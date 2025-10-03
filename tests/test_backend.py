import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

import pytest

from api import ui_bridge
from core import config
from core.game_state import get_game_state
from core.resources import Resource


@pytest.fixture(autouse=True)
def reset_state():
    ui_bridge.init_game(force_reset=True)
    yield


def test_basic_state_snapshot_defaults():
    state = get_game_state()
    snapshot = state.basic_state_snapshot()
    assert snapshot["population"] == {
        "current": 4,
        "capacity": 20,
        "available": 4,
        "total": 4,
    }
    building_payload = snapshot["buildings"][config.WOODCUTTER_CAMP]
    assert building_payload == {
        "built": 1,
        "workers": 0,
        "capacity": 2,
        "active": 0,
    }
    assert snapshot["jobs"]["forester"] == {"assigned": 0, "capacity": 2}
    assert snapshot["items"]["gold"] == pytest.approx(10.0)
    assert snapshot["items"]["wood"] == pytest.approx(0.0)
    wood_state = snapshot["wood_state"]
    assert wood_state["wood"] == pytest.approx(0.0)
    assert wood_state["woodcutter_camps_built"] == 1
    assert wood_state["workers_assigned_woodcutter"] == 0
    assert wood_state["max_workers_woodcutter"] == 2
    assert wood_state["wood_max_capacity"] == pytest.approx(30.0)
    assert wood_state["wood_production_per_second"] == pytest.approx(0.0)


def test_wood_production_matches_formula():
    state = get_game_state()
    state.inventory.set_amount(Resource.STICKS, 1.0)
    state.inventory.set_amount(Resource.STONE, 1.0)
    state.assign_workers_to_woodcutter(1)
    state.recompute_wood_caps()
    state.advance_time(10.0)
    snapshot = state.basic_state_snapshot()
    assert snapshot["items"]["wood"] == pytest.approx(0.1, rel=1e-9, abs=1e-9)
    assert snapshot["items"]["sticks"] == pytest.approx(0.6, rel=1e-9, abs=1e-9)
    assert snapshot["items"]["stone"] == pytest.approx(0.6, rel=1e-9, abs=1e-9)
    assert snapshot["wood_state"]["wood_production_per_second"] == pytest.approx(0.01)


def test_worker_cap_scales_with_camps():
    state = get_game_state()
    state.worker_pool.set_total_workers(10)
    state.assign_workers_to_woodcutter(5)
    assert state.workers_assigned_woodcutter == 2
    assert state.max_workers_woodcutter == 2

    state.inventory.set_amount(Resource.STICKS, 100)
    state.inventory.set_amount(Resource.STONE, 100)
    state.inventory.set_amount(Resource.GOLD, 100)
    state.recompute_wood_caps()
    response = ui_bridge.build_building(config.WOODCUTTER_CAMP)
    assert response["ok"] is True
    state.recompute_wood_caps()
    state.assign_workers_to_woodcutter(10)
    assert state.woodcutter_camps_built == 2
    assert state.max_workers_woodcutter == 4
    assert state.workers_assigned_woodcutter == 4


def test_capacity_clamp_enforced():
    state = get_game_state()
    state.worker_pool.set_total_workers(10)
    state.assign_workers_to_woodcutter(2)
    state.inventory.set_amount(Resource.STICKS, 100)
    state.inventory.set_amount(Resource.STONE, 100)
    state.inventory.set_amount(Resource.WOOD, 29.9)
    state.recompute_wood_caps()
    state.advance_time(10.0)
    assert state.wood_max_capacity == pytest.approx(30.0)
    assert state.wood == pytest.approx(29.9)


def test_no_camps_means_no_production():
    state = get_game_state()
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None
    state.demolish_building(building.id)
    state.assign_workers_to_woodcutter(5)
    state.advance_time(60.0)
    state_snapshot = state.basic_state_snapshot()
    wood_state = state_snapshot["wood_state"]
    assert wood_state["woodcutter_camps_built"] == 0
    assert wood_state["wood_max_capacity"] == pytest.approx(0.0)
    assert wood_state["wood"] == pytest.approx(0.0)
    assert wood_state["wood_production_per_second"] == pytest.approx(0.0)
    assert wood_state["workers_assigned_woodcutter"] == 0


def test_demolition_adjusts_capacity_and_workers():
    state = get_game_state()
    state.worker_pool.set_total_workers(10)
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None

    state.assign_workers_to_woodcutter(0)
    state.inventory.set_amount(Resource.STICKS, 100)
    state.inventory.set_amount(Resource.STONE, 100)
    state.inventory.set_amount(Resource.GOLD, 100)
    state.recompute_wood_caps()
    ui_bridge.build_building(config.WOODCUTTER_CAMP)
    state.recompute_wood_caps()
    state.assign_workers_to_woodcutter(4)
    state.inventory.set_amount(Resource.WOOD, 58)
    state.recompute_wood_caps()

    state.demolish_building(building.id)
    state_snapshot = state.basic_state_snapshot()
    wood_state = state_snapshot["wood_state"]
    assert wood_state["woodcutter_camps_built"] == 1
    assert wood_state["wood_max_capacity"] == pytest.approx(30.0)
    assert wood_state["wood"] == pytest.approx(30.0)
    assert wood_state["workers_assigned_woodcutter"] == 2
    assert wood_state["max_workers_woodcutter"] == 2


def test_build_requires_resources():
    state = get_game_state()
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None
    state.inventory.set_amount(Resource.STICKS, 0)
    state.inventory.set_amount(Resource.STONE, 0)
    state.inventory.set_amount(Resource.GOLD, 0)
    state.recompute_wood_caps()

    error = ui_bridge.build_building(config.WOODCUTTER_CAMP)
    assert error["ok"] is False
    assert error["error"] == "INSUFFICIENT_RESOURCES"
    assert error.get("requires", {}).get("sticks") == pytest.approx(30)
    assert error.get("requires", {}).get("stone") == pytest.approx(20)
    assert error.get("requires", {}).get("gold") == pytest.approx(10)

    state.inventory.set_amount(Resource.STICKS, 40)
    state.inventory.set_amount(Resource.STONE, 40)
    state.inventory.set_amount(Resource.GOLD, 25)
    state.recompute_wood_caps()
    success = ui_bridge.build_building(config.WOODCUTTER_CAMP)
    assert success["ok"] is True
    state.recompute_wood_caps()
    snapshot = state.basic_state_snapshot()
    assert snapshot["items"]["sticks"] == pytest.approx(10.0)
    assert snapshot["items"]["stone"] == pytest.approx(20.0)
    assert snapshot["items"]["gold"] == pytest.approx(15.0)
    assert snapshot["wood_state"]["woodcutter_camps_built"] == 2
    assert snapshot["wood_state"]["wood_max_capacity"] == pytest.approx(60.0)


def test_snapshot_includes_production_per_minute():
    state = get_game_state()
    state.worker_pool.set_total_workers(10)
    state.assign_workers_to_woodcutter(2)
    snapshot = state.snapshot_building(config.WOODCUTTER_CAMP)
    assert snapshot["produces_per_min"] == pytest.approx(1.2)
    assert snapshot["produces_unit"] == "wood/min"
