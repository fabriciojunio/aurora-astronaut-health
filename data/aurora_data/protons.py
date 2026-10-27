"""NOAA SWPC GOES integral proton flux: the operational indicator of a solar radiation storm."""

from __future__ import annotations

import json
from dataclasses import dataclass

GOES_PROTONS_URL = "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json"

# NOAA Space Weather Scale for solar radiation storms, by >=10 MeV flux in pfu.
S_SCALE = ((5, 100_000.0), (4, 10_000.0), (3, 1_000.0), (2, 100.0), (1, 10.0))


@dataclass(frozen=True)
class ProtonReading:
    time: str
    flux_10mev: float
    storm_level: int


def storm_level(flux_pfu: float) -> int:
    for level, threshold in S_SCALE:
        if flux_pfu >= threshold:
            return level
    return 0


def parse(body: bytes) -> list[ProtonReading]:
    readings = []
    for item in json.loads(body):
        if item.get("energy") != ">=10 MeV":
            continue
        flux = item.get("flux")
        if not isinstance(flux, (int, float)) or flux < 0:
            continue
        readings.append(ProtonReading(item["time_tag"], round(float(flux), 4), storm_level(float(flux))))
    return sorted(readings, key=lambda r: r.time)
