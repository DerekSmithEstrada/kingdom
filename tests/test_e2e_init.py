"""End-to-end API verification for initial game state and production."""

from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Dict

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import app
from core import config
from core.resources import Resource


@pytest.fixture()
def client():
    app.config.update(TESTING=True)
    with app.test_client() as test_client:
        yield test_client


def _assert_starting_resources(resources: Dict[str, float]) -> None:
    for resource in Resource:
        amount = resources.get(resource.value)
        assert amount is not None, f"Missing resource {resource.value}"
        expected = config.STARTING_RESOURCES.get(resource, 0.0)
        assert math.isclose(amount, expected, abs_tol=1e-9), (
            f"Expected {resource.value} to start at {expected}, got {amount}"
        )


def _assert_starting_inventory(inventory: Dict[str, Dict[str, float]]) -> None:
    for resource in Resource:
        entry = inventory.get(resource.value)
        assert entry is not None, f"Missing inventory entry for {resource.value}"
        amount = entry.get("amount", 0.0)
        expected = config.STARTING_RESOURCES.get(resource, 0.0)
        assert math.isclose(amount, expected, abs_tol=1e-9), (
            f"Expected inventory amount for {resource.value} to be {expected}, got {amount}"
        )


def test_forced_init_and_first_production_cycle(client):
    """Full handshake: reset, state snapshot, worker assign and production."""

    init_response = client.post("/api/init?reset=1")
    assert init_response.status_code == 200
    init_payload = init_response.get_json()
    assert init_payload["ok"] is True

    _assert_starting_resources(init_payload.get("resources", {}))
    _assert_starting_inventory(init_payload.get("inventory", {}))

    buildings = init_payload.get("buildings", [])
    assert any(b["type"] == config.WOODCUTTER_CAMP for b in buildings)
    woodcutter = next(
        b for b in buildings if b["type"] == config.WOODCUTTER_CAMP
    )
    assert woodcutter.get("active_workers", 0) == 0
    assert woodcutter.get("cost", {}).get("WOOD") == pytest.approx(10)
    assert woodcutter.get("cost", {}).get("GOLD") == pytest.approx(5)
    assert woodcutter.get("per_worker_input_rate", {}).get("STICKS") == pytest.approx(
        0.04
    )
    assert woodcutter.get("per_worker_output_rate", {}).get("WOOD") == pytest.approx(
        0.01
    )

    stick_tent = next(
        b for b in buildings if b["type"] == config.STICK_GATHERING_TENT
    )
    assert stick_tent.get("built") == 0
    assert stick_tent.get("cost", {}).get("GOLD") == pytest.approx(1)
    assert stick_tent.get("per_worker_output_rate", {}).get("STICKS") == pytest.approx(
        0.01
    )

    stone_tent = next(
        b for b in buildings if b["type"] == config.STONE_GATHERING_TENT
    )
    assert stone_tent.get("built") == 0
    assert stone_tent.get("cost", {}).get("GOLD") == pytest.approx(2)
    assert stone_tent.get("per_worker_output_rate", {}).get("STONE") == pytest.approx(
        0.01
    )

    state_response = client.get("/api/state")
    assert state_response.status_code == 200
    state_payload = state_response.get_json()
    _assert_starting_resources(state_payload.get("resources", {}))
    _assert_starting_inventory(state_payload.get("inventory", {}))

    public_state = client.get("/state")
    assert public_state.status_code == 200
    assert public_state.get_json()["items"]["wood"] == pytest.approx(10.0)

    for _ in range(5):
        tick_response = client.post("/api/tick", json={"dt": 1})
        assert tick_response.status_code == 200
        payload = tick_response.get_json()
        assert payload["ok"] is True

    after_idle_state = client.get("/state").get_json()
    assert after_idle_state["items"]["wood"] == pytest.approx(10.5, abs=1e-9)
