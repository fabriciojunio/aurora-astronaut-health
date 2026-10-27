from __future__ import annotations

import json
from pathlib import Path

import pytest

import train

DATASET = Path(__file__).parent / "data" / "dataset.json"


@pytest.fixture(scope="module")
def result() -> dict:
    return train.train(DATASET)


def test_training_is_reproducible(result: dict) -> None:
    again = train.train(DATASET)
    assert again["model"]["threshold"] == result["model"]["threshold"]
    assert again["model"]["trees"][0] == result["model"]["trees"][0]


def test_false_alarm_rate_stays_near_the_target(result: dict) -> None:
    assert result["model"]["metrics"]["falseAlarmRate"] <= 0.02


def test_strong_anomalies_are_detected(result: dict) -> None:
    by_kind = result["model"]["metrics"]["byKind"]
    for kind in ("hypoxia", "fever", "tachycardia", "orthostatic", "hypertension"):
        assert by_kind[kind]["detectionRate"] >= 0.95, kind


def test_no_healthy_day_is_flagged_with_the_two_reading_rule(result: dict) -> None:
    assert result["model"]["metrics"]["byDay"]["healthy"]["flaggedRate"] <= 0.01


def test_strong_anomalies_flag_every_day(result: dict) -> None:
    by_day = result["model"]["metrics"]["byDay"]
    for kind in ("hypoxia", "fever", "tachycardia", "orthostatic", "hypertension"):
        assert by_day[kind]["flaggedRate"] == 1.0, kind


def test_baselines_never_repeat_across_splits() -> None:
    _, rows = train.load(DATASET)
    seeds = {s: {r["day"].split("/")[1] for r in rows if r["split"] == s} for s in ("train", "validation", "test")}
    assert not seeds["train"] & seeds["validation"]
    assert not seeds["train"] & seeds["test"]
    assert not seeds["validation"] & seeds["test"]


def test_exports_a_complete_tree_structure(result: dict) -> None:
    model = result["model"]
    assert model["kind"] == "isolation-forest"
    assert len(model["trees"]) == train.N_ESTIMATORS
    tree = model["trees"][0]
    n = len(tree["left"])
    assert all(len(tree[k]) == n for k in ("right", "feature", "threshold", "samples"))


def test_refuses_data_that_is_not_the_simulated_dataset(tmp_path: Path) -> None:
    path = tmp_path / "real.json"
    path.write_text(json.dumps({"features": [], "rows": []}), "utf-8")
    with pytest.raises(ValueError, match="simulated"):
        train.train(path)


def test_only_healthy_days_are_used_for_training() -> None:
    _, rows = train.load(DATASET)
    assert {r["label"] for r in rows if r["split"] == "train"} == {0}
