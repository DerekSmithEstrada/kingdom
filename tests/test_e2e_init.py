"""End-to-end API verification for initial game state and production."""

from __future__ import annotations

import math
from typing import Dict

import pytest

from app import app
from core import config
from core.resources import Resource


@pytest.fixture()
def client():
    app.config.update(TESTING=True)
    with app.test_client() as test_client:
        yield test_client


def _assert_zeroed_resources(resources: Dict[str, float]) -> None:
    for resource in Resource:
        amount = resources.get(resource.value)
        assert amount is not None, f"Missing resource {resource.value}"
        assert math.isclose(amount, 0.0, abs_tol=1e-9), (
            f"Expected {resource.value} to start at 0, got {amount}"
        )


def _assert_zeroed_inventory(inventory: Dict[str, Dict[str, float]]) -> None:
    for resource in Resource:
        entry = inventory.get(resource.value)
        assert entry is not None, f"Missing inventory entry for {resource.value}"
        amount = entry.get("amount")
        assert math.isclose(amount or 0.0, 0.0, abs_tol=1e-9), (
            f"Expected inventory amount for {resource.value} to be 0, got {amount}"
        )


def test_forced_init_and_first_production_cycle(client):
    """Full handshake: reset, state snapshot, worker assign and production."""

    init_response = client.post("/api/init?reset=1")
    assert init_response.status_code == 200
    init_payload = init_response.get_json()
    assert init_payload["ok"] is True

    _assert_zeroed_resources(init_payload.get("resources", {}))
    _assert_zeroed_inventory(init_payload.get("inventory", {}))

    buildings = init_payload.get("buildings", [])
    assert len(buildings) == 1, "Only the Woodcutter Camp should be present initially"
    building = buildings[0]
    assert building["type"] == config.WOODCUTTER_CAMP
    assert building.get("active_workers", 0) == 0

    state_response = client.get("/api/state")
    assert state_response.status_code == 200
    state_payload = state_response.get_json()
    _assert_zeroed_resources(state_payload.get("resources", {}))
    _assert_zeroed_inventory(state_payload.get("inventory", {}))

    assign_response = client.post(
        f"/api/buildings/{building['id']}/assign",
        json={"workers": 1},
    )
    assert assign_response.status_code == 200
    assign_payload = assign_response.get_json()
    assert assign_payload["ok"] is True
    assigned_building = assign_payload.get("building", {})
    assert assigned_building.get("active_workers") == 1

    latest_payload = None
    for _ in range(10):
        tick_response = client.post("/api/tick", json={"dt": 1})
        assert tick_response.status_code == 200
        latest_payload = tick_response.get_json()
        assert latest_payload["ok"] is True

    assert latest_payload is not None, "Tick loop should return a payload"
    resources = latest_payload.get("resources", {})

    wood_amount = resources.get(Resource.WOOD.value)
    assert math.isclose(wood_amount or 0.0, 1.0, rel_tol=1e-9, abs_tol=1e-6)

    for resource in Resource:
        if resource is Resource.WOOD:
            continue
        amount = resources.get(resource.value)
        assert math.isclose(amount or 0.0, 0.0, abs_tol=1e-6), (
            f"Resource {resource.value} should remain at 0, got {amount}"
        )
