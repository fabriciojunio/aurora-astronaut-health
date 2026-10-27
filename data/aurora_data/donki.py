"""NASA DONKI solar energetic particle events. The service can be down, so callers must expect FetchError."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date

DONKI_URL = "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/SEP"
MAX_WINDOW_DAYS = 60


@dataclass(frozen=True)
class SepEvent:
    event_id: str
    event_time: str
    instruments: tuple[str, ...]
    link: str


def build_url(start: date, end: date) -> str:
    if end < start:
        raise ValueError("end must not be before start")
    if (end - start).days > MAX_WINDOW_DAYS:
        raise ValueError(f"DONKI limits queries to {MAX_WINDOW_DAYS} days")
    return f"{DONKI_URL}?startDate={start.isoformat()}&endDate={end.isoformat()}"


def parse(body: bytes) -> list[SepEvent]:
    events = []
    for item in json.loads(body) or []:
        instruments = tuple(i.get("displayName", "") for i in item.get("instruments") or [])
        events.append(
            SepEvent(
                event_id=str(item.get("sepID", "")),
                event_time=str(item.get("eventTime", "")),
                instruments=instruments,
                link=str(item.get("link", "")),
            )
        )
    return events
