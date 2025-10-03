import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from api import ui_bridge
from core import config
from core.game_state import get_game_state


@pytest.fixture(autouse=True)
def reset_state():
    ui_bridge.init_game(force_reset=True)
    yield


def _get_wood_amount():
    state = get_game_state()
    snapshot = state.basic_state_snapshot()
    return snapshot["items"]["wood"]


def _assign_workers(count: int) -> None:
    state = get_game_state()
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None
    response = ui_bridge.assign_workers(building.id, count)
    assert response["ok"] is True, response


def test_basic_state_snapshot_defaults():
    state = get_game_state()
    snapshot = state.basic_state_snapshot()
    assert snapshot["population"] == {"current": 2, "capacity": 20, "available": 2}
    building_payload = snapshot["buildings"][config.WOODCUTTER_CAMP]
    assert building_payload == {
        "built": 1,
        "workers": 0,
        "capacity": 10,
        "active": 0,
    }
    assert snapshot["jobs"]["forester"] == {"assigned": 0, "capacity": 10}
    for key, amount in snapshot["items"].items():
        assert amount == pytest.approx(0.0), f"{key} expected to be 0"


def test_initial_wood_is_zero():
    assert _get_wood_amount() == 0.0


def test_wood_does_not_increase_without_workers():
    state = get_game_state()
    for _ in range(5):
        state.tick(1.0)
    assert _get_wood_amount() == pytest.approx(0.0)


def test_wood_increases_by_point_one_per_second_with_workers():
    _assign_workers(1)
    state = get_game_state()
    for _ in range(5):
        state.tick(1.0)
    assert _get_wood_amount() == pytest.approx(0.5, rel=1e-9, abs=1e-9)


def test_additional_workers_do_not_change_generation_rate():
    state = get_game_state()
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None
    failure = ui_bridge.assign_workers(building.id, 3)
    assert failure["ok"] is False
    assert failure.get("error_code") == "assignment_failed"
    _assign_workers(2)
    state = get_game_state()
    for _ in range(5):
        state.tick(1.0)
    assert _get_wood_amount() == pytest.approx(0.5, rel=1e-9, abs=1e-9)


def test_jobs_reflect_building_assignments():
    state = get_game_state()
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None
    ui_bridge.assign_workers(building.id, 2)
    snapshot = state.basic_state_snapshot()
    assert snapshot["buildings"][config.WOODCUTTER_CAMP]["workers"] == 2
    assert snapshot["jobs"]["forester"]["assigned"] == 2
    assert snapshot["population"]["available"] == 0


def test_population_pool_recovers_after_unassign():
    state = get_game_state()
    building = state.get_building_by_type(config.WOODCUTTER_CAMP)
    assert building is not None
    ui_bridge.assign_workers(building.id, 1)
    ui_bridge.unassign_workers(building.id, 1)
    snapshot = state.basic_state_snapshot()
    assert snapshot["population"] == {"current": 2, "capacity": 20, "available": 2}
