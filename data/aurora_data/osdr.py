"""NASA Open Science Data Repository: study metadata behind each health risk shown in the app."""

from __future__ import annotations

import json
from dataclasses import dataclass
from urllib.parse import quote

OSDR_SEARCH = "https://osdr.nasa.gov/osdr/data/search"
STUDY_PAGE = "https://osdr.nasa.gov/bio/repo/data/studies/"

TOPICS = {
    "bone": "bone loss",
    "muscle": "muscle atrophy",
    "cardiovascular": "cardiovascular",
    "radiation": "space radiation",
    "immune": "immune",
    "eye": "ocular",
    "sleep": "sleep",
}


@dataclass(frozen=True)
class Study:
    accession: str
    title: str
    organism: str
    flight_program: str
    url: str


def build_url(term: str, size: int = 5) -> str:
    if not 1 <= size <= 25:
        raise ValueError("size must be between 1 and 25")
    return f"{OSDR_SEARCH}?term={quote(term)}&size={size}&type=cgene"


def _text(value: object) -> str:
    if isinstance(value, list):
        return ", ".join(str(v) for v in value if v)
    return str(value or "").strip()


def parse(body: bytes) -> list[Study]:
    hits = json.loads(body).get("hits", {}).get("hits", [])
    studies = []
    for hit in hits:
        source = hit.get("_source", {})
        accession = _text(source.get("Accession"))
        title = _text(source.get("Study Title"))
        if not accession or not title:
            continue
        studies.append(
            Study(
                accession=accession,
                title=title,
                organism=_text(source.get("organism")),
                flight_program=_text(source.get("Flight Program")),
                url=f"{STUDY_PAGE}{quote(accession)}",
            )
        )
    return studies
