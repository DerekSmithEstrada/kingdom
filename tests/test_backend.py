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
    ui_bridge.assign_workers(building.id, count)


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
    _assign_workers(3)
    state = get_game_state()
    for _ in range(5):
        state.tick(1.0)
    assert _get_wood_amount() == pytest.approx(0.5, rel=1e-9, abs=1e-9)
