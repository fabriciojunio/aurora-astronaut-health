from __future__ import annotations

import io
import urllib.error
from typing import Any

import pytest

from aurora_data import http

URL = "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json"


class FakeResponse(io.BytesIO):
    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()


def test_returns_the_body_and_sends_a_user_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    def fake_urlopen(request: Any, timeout: float) -> FakeResponse:
        seen["agent"] = request.get_header("User-agent")
        seen["timeout"] = timeout
        return FakeResponse(b"[]")

    monkeypatch.setattr(http.urllib.request, "urlopen", fake_urlopen)
    result = http.fetch(URL, timeout=5)
    assert result.body == b"[]"
    assert seen == {"agent": http.USER_AGENT, "timeout": 5}


def test_retries_with_backoff_and_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}
    sleeps: list[float] = []

    def flaky(request: Any, timeout: float) -> FakeResponse:
        calls["n"] += 1
        if calls["n"] < 3:
            raise urllib.error.URLError("503 upstream")
        return FakeResponse(b"ok")

    monkeypatch.setattr(http.urllib.request, "urlopen", flaky)
    monkeypatch.setattr(http.time, "sleep", sleeps.append)
    assert http.fetch(URL, retries=3, backoff=1).body == b"ok"
    assert sleeps == [1, 2]


def test_gives_up_after_all_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    def down(request: Any, timeout: float) -> FakeResponse:
        raise TimeoutError("no route")

    monkeypatch.setattr(http.urllib.request, "urlopen", down)
    monkeypatch.setattr(http.time, "sleep", lambda _: None)
    with pytest.raises(http.FetchError, match="Failed after 2 attempts"):
        http.fetch(URL, retries=2)


def test_refuses_oversized_responses(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(http, "MAX_BYTES", 10)
    monkeypatch.setattr(http.urllib.request, "urlopen", lambda request, timeout: FakeResponse(b"x" * 11))
    with pytest.raises(http.FetchError, match="larger than"):
        http.fetch(URL)


def test_never_opens_a_url_outside_the_allowlist(monkeypatch: pytest.MonkeyPatch) -> None:
    def must_not_run(request: Any, timeout: float) -> FakeResponse:
        raise AssertionError("urlopen was called for a forbidden URL")

    monkeypatch.setattr(http.urllib.request, "urlopen", must_not_run)
    with pytest.raises(http.FetchError):
        http.fetch("https://attacker.example/steal")
