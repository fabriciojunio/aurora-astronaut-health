from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path

import pytest

from aurora_data import donki, osdr, protons, radlab
from aurora_data.http import FetchError, check_url
from aurora_data.snapshot import Source, verify_snapshot, write_manifest, write_snapshot

FIXTURES = Path(__file__).parent / "fixtures"


class TestHttpAllowlist:
    def test_accepts_known_https_hosts(self) -> None:
        check_url("https://visualization.osdr.nasa.gov/radlab/api/?format=csv")
        check_url("https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json")

    @pytest.mark.parametrize(
        "url",
        [
            "http://visualization.osdr.nasa.gov/radlab/api/",
            "https://evil.example.com/data.json",
            "https://visualization.osdr.nasa.gov.evil.com/",
            "file:///etc/passwd",
            "ftp://osdr.nasa.gov/",
        ],
    )
    def test_refuses_anything_else(self, url: str) -> None:
        with pytest.raises(FetchError):
            check_url(url)


class TestRadLab:
    def test_builds_the_query_format_the_api_accepts(self) -> None:
        url = radlab.build_url("DosTel1", "2024-05-01", "2024-06-01")
        assert url.startswith("https://visualization.osdr.nasa.gov/radlab/api/?instrument=DosTel1")
        assert "timestamp%3E=2024-05-01" in url and "timestamp%3C2024-06-01" in url
        assert url.endswith("&absorbed_dose_rate&format=csv")

    def test_rejects_unknown_instrument_and_bad_dates(self) -> None:
        with pytest.raises(ValueError):
            radlab.build_url("DROP TABLE", "2024-05-01", "2024-06-01")
        with pytest.raises(ValueError):
            radlab.build_url("DosTel1", "yesterday", "2024-06-01")

    def test_parses_real_iss_response(self) -> None:
        rows = radlab.parse_csv((FIXTURES / "radlab_dostel1.csv").read_text("utf-8"))
        assert len(rows) > 20
        moment, instrument, rate = rows[0]
        assert instrument == "DosTel1"
        assert moment.year == 2024
        assert 0 < rate < 100

    def test_parses_real_mars_response(self) -> None:
        rows = radlab.parse_csv((FIXTURES / "radlab_msl.csv").read_text("utf-8"))
        assert {instrument for _, instrument, _ in rows} == {"MSL-RAD-Surface"}

    def test_skips_invalid_rows(self) -> None:
        text = (
            "timestamp,instrument_id,absorbed_dose_rate\n"
            '"2024-05-20T00:00:00","DosTel1",5.0\n'
            '"not-a-date","DosTel1",5.0\n'
            '"2024-05-20T00:01:00","DosTel1",\n'
            '"2024-05-20T00:02:00","DosTel1",nan\n'
            '"2024-05-20T00:03:00","DosTel1",-1\n'
            '"2024-05-20T00:04:00","Unknown",5.0\n'
            '"2024-05-20T00:05:00","DosTel1",inf\n'
        )
        assert len(radlab.parse_csv(text)) == 1

    def test_aggregates_by_hour_and_instrument(self) -> None:
        rows = [
            (datetime(2024, 5, 20, 0, 10), "DosTel1", 2.0),
            (datetime(2024, 5, 20, 0, 50), "DosTel1", 4.0),
            (datetime(2024, 5, 20, 1, 5), "DosTel1", 9.0),
            (datetime(2024, 5, 20, 0, 30), "MSL-RAD-Surface", 3.5),
        ]
        hourly = radlab.aggregate_hourly(rows)
        first = next(h for h in hourly if h.instrument == "DosTel1" and h.hour.endswith("T00:00:00"))
        assert (first.mean_rate, first.max_rate, first.samples, first.environment) == (3.0, 4.0, 2, "iss")
        assert {h.environment for h in hourly} == {"iss", "mars_surface"}


class TestProtons:
    @pytest.mark.parametrize(
        ("flux", "level"),
        [(0.2, 0), (9.99, 0), (10, 1), (99, 1), (100, 2), (1_000, 3), (10_000, 4), (100_000, 5), (1e7, 5)],
    )
    def test_maps_flux_to_noaa_s_scale(self, flux: float, level: int) -> None:
        assert protons.storm_level(flux) == level

    def test_parses_real_goes_response_keeping_only_10_mev(self) -> None:
        readings = protons.parse((FIXTURES / "noaa_protons.json").read_bytes())
        assert readings
        assert all(r.storm_level >= 0 for r in readings)
        assert [r.time for r in readings] == sorted(r.time for r in readings)

    def test_ignores_malformed_items(self) -> None:
        body = json.dumps(
            [
                {"time_tag": "t1", "energy": ">=10 MeV", "flux": "high"},
                {"time_tag": "t2", "energy": ">=10 MeV", "flux": -3},
                {"time_tag": "t3", "energy": ">=10 MeV", "flux": 150.0},
            ]
        ).encode()
        assert [(r.time, r.storm_level) for r in protons.parse(body)] == [("t3", 2)]


class TestDonki:
    def test_enforces_the_60_day_window(self) -> None:
        assert "startDate=2024-05-01" in donki.build_url(date(2024, 5, 1), date(2024, 5, 31))
        with pytest.raises(ValueError):
            donki.build_url(date(2024, 1, 1), date(2024, 6, 1))
        with pytest.raises(ValueError):
            donki.build_url(date(2024, 6, 1), date(2024, 5, 1))

    def test_parses_events_and_empty_answers(self) -> None:
        body = json.dumps(
            [{"sepID": "2024-05-11T02:25:00-SEP-001", "eventTime": "2024-05-11T02:25Z",
              "instruments": [{"displayName": "GOES-P: EPEAD 10-100 MeV"}], "link": "https://example"}]
        ).encode()
        events = donki.parse(body)
        assert events[0].event_id.endswith("SEP-001")
        assert events[0].instruments == ("GOES-P: EPEAD 10-100 MeV",)
        assert donki.parse(b"null") == []


class TestOsdr:
    def test_parses_real_search_response(self) -> None:
        studies = osdr.parse((FIXTURES / "osdr_bone.json").read_bytes())
        assert studies
        assert all(s.accession.startswith("OSD-") for s in studies)
        assert all(s.url.startswith("https://osdr.nasa.gov/bio/repo/data/studies/OSD-") for s in studies)

    def test_validates_page_size(self) -> None:
        with pytest.raises(ValueError):
            osdr.build_url("bone", size=0)
        assert "term=bone%20loss" in osdr.build_url("bone loss")


class TestSnapshot:
    SOURCE = Source("Test", "Provider", "https://example", "public")

    def test_writes_snapshot_with_verifiable_hash(self, tmp_path: Path) -> None:
        entry = write_snapshot(
            tmp_path, "radiation", self.SOURCE, [{"rate": 1.5}],
            retrieved_at=datetime(2026, 10, 28, tzinfo=UTC),
        )
        assert entry["records"] == 1
        assert verify_snapshot(tmp_path, entry)
        payload = json.loads((tmp_path / "radiation.json").read_text("utf-8"))
        assert payload["source"]["provider"] == "Provider"
        assert payload["retrievedAt"] == "2026-10-28T00:00:00+00:00"

    def test_detects_a_modified_snapshot(self, tmp_path: Path) -> None:
        entry = write_snapshot(tmp_path, "radiation", self.SOURCE, [{"rate": 1.5}])
        path = tmp_path / "radiation.json"
        path.write_text(path.read_text("utf-8").replace("1.5", "0.1"), "utf-8")
        assert not verify_snapshot(tmp_path, entry)

    def test_same_content_gives_same_hash(self, tmp_path: Path) -> None:
        moment = datetime(2026, 10, 28, tzinfo=UTC)
        a = write_snapshot(tmp_path / "a", "x", self.SOURCE, [{"b": 1, "a": 2}], retrieved_at=moment)
        b = write_snapshot(tmp_path / "b", "x", self.SOURCE, [{"a": 2, "b": 1}], retrieved_at=moment)
        assert a["sha256"] == b["sha256"]

    @pytest.mark.parametrize("name", ["../escape", "a/b", "", "name.json"])
    def test_rejects_names_that_could_escape_the_folder(self, tmp_path: Path, name: str) -> None:
        with pytest.raises(ValueError):
            write_snapshot(tmp_path, name, self.SOURCE, [])

    def test_manifest_lists_snapshots_in_order(self, tmp_path: Path) -> None:
        entries = [write_snapshot(tmp_path, n, self.SOURCE, []) for n in ("zeta", "alpha")]
        manifest = json.loads(write_manifest(tmp_path, entries).read_text("utf-8"))
        assert [s["file"] for s in manifest["snapshots"]] == ["alpha.json", "zeta.json"]
