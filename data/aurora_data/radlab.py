"""NASA OSDR RadLab: measured absorbed dose rates from ISS, lunar orbit and Mars surface detectors."""

from __future__ import annotations

import csv
import io
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from statistics import fmean
from urllib.parse import quote

RADLAB_API = "https://visualization.osdr.nasa.gov/radlab/api/"

# Unit of absorbed_dose_rate in RadLab, per its knowledge base: micrograys per hour.
UNIT = "uGy/h"

ENVIRONMENTS = {
    "DosTel1": "iss",
    "DosTel2": "iss",
    "CRaTER-D1D2": "lunar_orbit",
    "MSL-RAD-Surface": "mars_surface",
}


@dataclass(frozen=True)
class HourlyDose:
    instrument: str
    environment: str
    hour: str
    mean_rate: float
    max_rate: float
    samples: int


def build_url(instrument: str, start: str, end: str) -> str:
    """RadLab accepts filters as key=value and adds a column for every bare key."""
    if instrument not in ENVIRONMENTS:
        raise ValueError(f"Unknown instrument: {instrument}")
    datetime.fromisoformat(start)
    datetime.fromisoformat(end)
    return (
        f"{RADLAB_API}?instrument={quote(instrument)}"
        f"&timestamp%3E={quote(start)}&timestamp%3C{quote(end)}"
        "&absorbed_dose_rate&format=csv"
    )


def parse_csv(text: str) -> list[tuple[datetime, str, float]]:
    """Keeps only rows with a valid timestamp, a known instrument and a finite, non-negative rate."""
    rows: list[tuple[datetime, str, float]] = []
    for row in csv.DictReader(io.StringIO(text)):
        instrument = (row.get("instrument_id") or "").strip()
        raw_rate = (row.get("absorbed_dose_rate") or "").strip()
        if instrument not in ENVIRONMENTS or not raw_rate:
            continue
        try:
            moment = datetime.fromisoformat(row["timestamp"].strip())
            rate = float(raw_rate)
        except (KeyError, ValueError):
            continue
        if rate != rate or rate < 0 or rate == float("inf"):
            continue
        rows.append((moment, instrument, rate))
    return rows


def aggregate_hourly(rows: list[tuple[datetime, str, float]]) -> list[HourlyDose]:
    buckets: dict[tuple[str, str], list[float]] = defaultdict(list)
    for moment, instrument, rate in rows:
        hour = moment.replace(minute=0, second=0, microsecond=0).isoformat()
        buckets[(instrument, hour)].append(rate)
    return [
        HourlyDose(
            instrument=instrument,
            environment=ENVIRONMENTS[instrument],
            hour=hour,
            mean_rate=round(fmean(values), 4),
            max_rate=round(max(values), 4),
            samples=len(values),
        )
        for (instrument, hour), values in sorted(buckets.items(), key=lambda item: (item[0][1], item[0][0]))
    ]
