"""HTTP access for the data pipeline, using only the standard library."""

from __future__ import annotations

import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from urllib.parse import urlparse

ALLOWED_HOSTS = frozenset(
    {
        "visualization.osdr.nasa.gov",
        "osdr.nasa.gov",
        "api.nasa.gov",
        "kauai.ccmc.gsfc.nasa.gov",
        "services.swpc.noaa.gov",
        "images-api.nasa.gov",
    }
)
MAX_BYTES = 50 * 1024 * 1024
USER_AGENT = "aurora-astronaut-health-data/1.0 (NASA Space Apps 2026)"


class FetchError(RuntimeError):
    """Raised when a source cannot be downloaded after all retries."""


@dataclass(frozen=True)
class FetchResult:
    url: str
    body: bytes


def check_url(url: str) -> None:
    """Only HTTPS and only the known public data hosts: the pipeline never follows arbitrary URLs."""
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise FetchError(f"Refusing non-HTTPS URL: {url}")
    if parsed.hostname not in ALLOWED_HOSTS:
        raise FetchError(f"Host not in the allowlist: {parsed.hostname}")


def fetch(url: str, *, timeout: float = 120.0, retries: int = 3, backoff: float = 2.0) -> FetchResult:
    check_url(url)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})  # noqa: S310 (allowlisted)
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 (allowlisted)
                body = response.read(MAX_BYTES + 1)
                if len(body) > MAX_BYTES:
                    raise FetchError(f"Response larger than {MAX_BYTES} bytes: {url}")
                return FetchResult(url=url, body=body)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            last_error = error
            if attempt < retries - 1:
                time.sleep(backoff * 2**attempt)
    raise FetchError(f"Failed after {retries} attempts: {url} ({last_error})")
