"""Writes data snapshots with provenance, so every number in the app can be traced to its source."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, is_dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Source:
    name: str
    provider: str
    url: str
    license: str


def _serializable(records: list[Any]) -> list[Any]:
    return [asdict(r) if is_dataclass(r) and not isinstance(r, type) else r for r in records]


def canonical_bytes(payload: Any) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def write_snapshot(
    out_dir: Path,
    name: str,
    source: Source,
    records: list[Any],
    *,
    retrieved_at: datetime | None = None,
    notes: str = "",
) -> dict[str, Any]:
    """Writes `<name>.json` and returns its manifest entry (with the SHA-256 of the exact bytes)."""
    if not name.replace("-", "").replace("_", "").isalnum():
        raise ValueError(f"Invalid snapshot name: {name}")
    out_dir.mkdir(parents=True, exist_ok=True)
    moment = (retrieved_at or datetime.now(UTC)).isoformat(timespec="seconds")
    payload = {
        "source": asdict(source),
        "retrievedAt": moment,
        "notes": notes,
        "records": _serializable(records),
    }
    body = canonical_bytes(payload)
    (out_dir / f"{name}.json").write_bytes(body)
    return {
        "file": f"{name}.json",
        "sha256": hashlib.sha256(body).hexdigest(),
        "records": len(records),
        "source": source.name,
        "url": source.url,
        "retrievedAt": moment,
    }


def write_manifest(out_dir: Path, entries: list[dict[str, Any]]) -> Path:
    path = out_dir / "manifest.json"
    path.write_bytes(canonical_bytes({"version": 1, "snapshots": sorted(entries, key=lambda e: e["file"])}))
    return path


def verify_snapshot(out_dir: Path, entry: dict[str, Any]) -> bool:
    body = (out_dir / str(entry["file"])).read_bytes()
    return hashlib.sha256(body).hexdigest() == str(entry["sha256"])
