"""Builds every data snapshot the web app uses.

    python -m aurora_data.build --out ../apps/web/public/data

A source that is down does not stop the build: the previous snapshot is kept and the failure is
reported, because the app must keep working offline with the last good data.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

from . import donki, osdr, protons, radlab
from .http import FetchError, fetch
from .snapshot import Source, write_manifest, write_snapshot

# May 2024: the 10-11 May geomagnetic storm and the 20 May solar event that Curiosity recorded on Mars.
WINDOW_START = "2024-05-01"
WINDOW_END = "2024-06-01"

RADLAB_SOURCE = Source(
    name="NASA OSDR RadLab",
    provider="NASA Open Science Data Repository",
    url="https://visualization.osdr.nasa.gov/radlab/",
    license="NASA open data; instrument teams credited in the RadLab knowledge base",
)
NOAA_SOURCE = Source(
    name="NOAA SWPC GOES integral protons",
    provider="NOAA Space Weather Prediction Center",
    url=protons.GOES_PROTONS_URL,
    license="U.S. Government public data",
)
DONKI_SOURCE = Source(
    name="NASA DONKI SEP",
    provider="NASA Community Coordinated Modeling Center",
    url="https://kauai.ccmc.gsfc.nasa.gov/DONKI/",
    license="NASA open data",
)
OSDR_SOURCE = Source(
    name="NASA OSDR study search",
    provider="NASA Open Science Data Repository",
    url="https://osdr.nasa.gov/bio/",
    license="NASA open data; cite each study by its OSD accession",
)


def build_radiation(out: Path) -> dict[str, Any]:
    rows = []
    for instrument in radlab.ENVIRONMENTS:
        result = fetch(radlab.build_url(instrument, WINDOW_START, WINDOW_END))
        rows.extend(radlab.parse_csv(result.body.decode("utf-8")))
    hourly = radlab.aggregate_hourly(rows)
    if not hourly:
        raise FetchError("RadLab returned no usable rows")
    return write_snapshot(
        out,
        "radiation-may-2024",
        RADLAB_SOURCE,
        hourly,
        notes=f"Hourly mean and max absorbed dose rate in {radlab.UNIT}, {WINDOW_START} to {WINDOW_END}",
    )


def build_protons(out: Path) -> dict[str, Any]:
    readings = protons.parse(fetch(protons.GOES_PROTONS_URL).body)
    return write_snapshot(out, "goes-protons-latest", NOAA_SOURCE, readings, notes=">=10 MeV flux in pfu")


def build_sep_events(out: Path) -> dict[str, Any]:
    url = donki.build_url(date.fromisoformat(WINDOW_START), date.fromisoformat("2024-05-31"))
    events = donki.parse(fetch(url, retries=2).body)
    return write_snapshot(out, "donki-sep-may-2024", DONKI_SOURCE, events)


def build_studies(out: Path) -> dict[str, Any]:
    records = []
    for topic, term in osdr.TOPICS.items():
        for study in osdr.parse(fetch(osdr.build_url(term)).body):
            records.append({"topic": topic, **study.__dict__})
    return write_snapshot(out, "osdr-studies", OSDR_SOURCE, records)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    out: Path = args.out

    previous = {}
    manifest_path = out / "manifest.json"
    if manifest_path.exists():
        previous = {e["file"]: e for e in json.loads(manifest_path.read_text("utf-8"))["snapshots"]}

    entries: dict[str, dict[str, Any]] = dict(previous)
    failures = []
    for step in (build_radiation, build_protons, build_sep_events, build_studies):
        try:
            entry = step(out)
            entries[entry["file"]] = entry
            print(f"ok    {entry['file']}: {entry['records']} records")
        except (FetchError, ValueError) as error:
            failures.append(step.__name__)
            print(f"FAIL  {step.__name__}: {error} (keeping previous snapshot, if any)", file=sys.stderr)
    write_manifest(out, list(entries.values()))
    return 1 if failures and not entries else 0


if __name__ == "__main__":
    raise SystemExit(main())
