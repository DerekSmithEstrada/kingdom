import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from api import ui_bridge
from core.game_state import get_game_state


@pytest.fixture(autouse=True)
def reset_state():
    ui_bridge.init_game(force_reset=True)
    yield


def _set_population(state, total):
    current = state.population_total()
    if total <= current:
        return
    state._grant_new_villagers(total - current)


def test_summer_adds_three_up_to_cap():
    state = get_game_state()
    _set_population(state, 17)
    previous_total = state.population_total()
    assert previous_total == 17

    state.on_season_start("summer", state.time["last_tick"] + 10.0)
    assert state.population_total() == 20
    assert state.population["total"] == 20
    assert len(state.population["villagers"]) == 20
    assert state.population["villagers"][-1]["employed"] is False


def test_autumn_adds_two():
    state = get_game_state()
    initial_total = state.population_total()
    state.on_season_start("autumn", state.time["last_tick"] + 5.0)
    assert state.population_total() == initial_total + 2

    ui_bridge.init_game(force_reset=True)
    state = get_game_state()
    _set_population(state, 19)
    state.on_season_start("autumn", state.time["last_tick"] + 15.0)
    assert state.population_total() == state.population["cap"]


def test_winter_adds_one():
    state = get_game_state()
    initial_total = state.population_total()
    state.on_season_start("winter", state.time["last_tick"] + 3.0)
    assert state.population_total() == min(
        state.population["cap"], initial_total + 1
    )


def test_gold_growth_idle_and_employed():
    state = get_game_state()
    _set_population(state, 5)
    villagers = state.population["villagers"]
    villagers[0]["employed"] = True
    villagers[1]["employed"] = True
    state.resources["gold"] = 0.0

    state.tick(state.time["last_tick"] + 10.0)
    assert state.resources["gold"] == pytest.approx(0.5)


def test_tick_is_idempotent_on_zero_dt():
    state = get_game_state()
    _set_population(state, 4)
    state.resources["gold"] = 1.0
    state.tick(state.time["last_tick"])
    assert state.resources["gold"] == pytest.approx(1.0)


def test_on_season_start_idempotent_same_timestamp():
    state = get_game_state()
    stamp = state.time["last_tick"] + 2.0
    state.on_season_start("spring", stamp)
    total_after_first = state.population_total()
    state.on_season_start("spring", stamp)
    assert state.population_total() == total_after_first


def test_inactivity_catchup():
    state = get_game_state()
    _set_population(state, 10)
    state.resources["gold"] = 0.0
    state.tick(state.time["last_tick"] + 120.0)
    assert state.resources["gold"] == pytest.approx(12.0)

