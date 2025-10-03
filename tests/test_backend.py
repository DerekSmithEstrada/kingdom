import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from api import ui_bridge
from core import config
from core.game_state import get_game_state
from core.resources import Resource


@pytest.fixture(autouse=True)
def reset_state():
    ui_bridge.init_game(force_reset=True)
    yield


def _get_wood_amount():
    state = get_game_state()
    snapshot = state.basic_state_snapshot()
    return snapshot["items"]["wood"]


def _set_workers(target: int) -> None:
    state = get_game_state()
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None
    delta = int(target) - int(building.assigned_workers)
    if delta == 0:
        return
    response = ui_bridge.change_building_workers(building.id, delta)
    assert response["ok"] is True, response
    assert response["assigned"] == target


def test_basic_state_snapshot_defaults():
    state = get_game_state()
    snapshot = state.basic_state_snapshot()
    assert snapshot["population"] == {"current": 2, "capacity": 20, "available": 1}
    building_payload = snapshot["buildings"][config.WOODCUTTER_CAMP]
    assert building_payload == {
        "built": 1,
        "workers": 1,
        "capacity": 10,
        "active": 1,
    }
    assert snapshot["jobs"]["forester"] == {"assigned": 1, "capacity": 10}
    for key, amount in snapshot["items"].items():
        assert amount == pytest.approx(0.0), f"{key} expected to be 0"


def test_initial_wood_is_zero():
    assert _get_wood_amount() == 0.0


def test_wood_does_not_increase_without_workers():
    state = get_game_state()
    ui_bridge.change_building_workers(config.WOODCUTTER_CAMP, -1)
    for _ in range(5):
        state.tick(1.0)
    assert _get_wood_amount() == pytest.approx(0.0)


def test_wood_increases_by_point_one_per_second_with_workers():
    _set_workers(0)
    _set_workers(1)
    state = get_game_state()
    for _ in range(5):
        state.tick(1.0)
    assert _get_wood_amount() == pytest.approx(0.5, rel=1e-9, abs=1e-9)


def test_additional_workers_do_not_change_generation_rate():
    state = get_game_state()
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None
    failure = ui_bridge.change_building_workers(building.id, 3)
    assert failure["ok"] is False
    assert failure.get("error_code") == "assignment_failed"
    _set_workers(2)
    state = get_game_state()
    for _ in range(5):
        state.tick(1.0)
    assert _get_wood_amount() == pytest.approx(0.5, rel=1e-9, abs=1e-9)


def test_jobs_reflect_building_assignments():
    state = get_game_state()
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None
    _set_workers(2)
    snapshot = state.basic_state_snapshot()
    assert snapshot["buildings"][config.WOODCUTTER_CAMP]["workers"] == 2
    assert snapshot["jobs"]["forester"]["assigned"] == 2
    assert snapshot["population"]["available"] == 0


def test_population_pool_recovers_after_unassign():
    state = get_game_state()
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None
    ui_bridge.change_building_workers(building.id, -1)
    snapshot = state.basic_state_snapshot()
    assert snapshot["population"] == {"current": 2, "capacity": 20, "available": 2}


def test_change_building_workers_delta_payload():
    state = get_game_state()
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None
    assigned = ui_bridge.change_building_workers(building.id, 1)
    assert assigned["ok"] is True
    assert assigned["delta"] == 1
    assert assigned["assigned"] == 2
    released = ui_bridge.change_building_workers(building.id, -1)
    assert released["ok"] is True
    assert released["delta"] == -1
    assert released["assigned"] == 1


def test_build_requires_one_wood():
    state = get_game_state()
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None
    state.demolish_building(building.id)
    state.inventory.set_amount(Resource.WOOD, 0)

    error = ui_bridge.build_building(config.WOODCUTTER_CAMP)
    assert error["ok"] is False
    assert error["error"] == "INSUFFICIENT_RESOURCES"
    assert error.get("requires", {}).get("wood") == pytest.approx(1)

    state.inventory.set_amount(Resource.WOOD, 1)
    success = ui_bridge.build_building(config.WOODCUTTER_CAMP)
    assert success["ok"] is True
    assert success["state"]["items"]["wood"] == pytest.approx(0.0)
    assert state.inventory.get_amount(Resource.WOOD) == pytest.approx(0.0)


def test_build_allows_multiple_instances():
    state = get_game_state()
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None

    state.demolish_building(building.id)
    state.inventory.set_amount(Resource.WOOD, 3)

    for expected in range(1, 4):
        response = ui_bridge.build_building(config.WOODCUTTER_CAMP)
        assert response["ok"] is True
        building = state.get_building_by_type(config.WOODCUTTER_CAMP)
        assert building is not None
        assert building.built_count == expected
        assert state.inventory.get_amount(Resource.WOOD) == pytest.approx(3 - expected)


def test_demolish_requires_existing_structure():
    state = get_game_state()
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None

    state.demolish_building(building.id)
    response = ui_bridge.demolish_building(config.WOODCUTTER_CAMP)
    assert response["ok"] is False
    assert response["error"] == "NOTHING_TO_DEMOLISH"
    assert response["http_status"] == 400


def test_demolish_clamps_workers_and_capacity():
    state = get_game_state()
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None

    _set_workers(0)
    state.worker_pool.set_total_workers(30)
    state.demolish_building(building.id)
    state.inventory.set_amount(Resource.WOOD, 3)

    for _ in range(3):
        result = ui_bridge.build_building(config.WOODCUTTER_CAMP)
        assert result["ok"] is True

    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None
    assert building.built_count == 3

    _set_workers(15)
    assert building.assigned_workers == 15

    state.demolish_building(building.id)
    assert building.built_count == 2
    assert building.assigned_workers == 15

    state.demolish_building(building.id)
    assert building.built_count == 1
    assert building.assigned_workers == 10
    assert state.worker_pool.available_workers == 20

    snapshot = state.basic_state_snapshot()
    woodcutter_snapshot = snapshot["buildings"][config.WOODCUTTER_CAMP]
    assert woodcutter_snapshot["built"] == 1
    assert woodcutter_snapshot["capacity"] == 10
    assert woodcutter_snapshot["active"] == 1
    assert snapshot["jobs"]["forester"] == {"assigned": 10, "capacity": 10}


def test_snapshot_includes_production_per_minute():
    _set_workers(0)
    _set_workers(2)
    state = get_game_state()
    snapshot = state.snapshot_building(config.WOODCUTTER_CAMP)
    assert snapshot["produces_per_min"] == pytest.approx(12.0)
    assert snapshot["produces_unit"] == "wood/min"
