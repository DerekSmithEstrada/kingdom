"""Basic sanity tests for the management game backend."""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from api import ui_bridge
from core import config
from core.game_state import get_game_state
from core.resources import Resource
from core.timeclock import SeasonClock


def run_all_tests() -> None:
    test_building_construction()
    test_worker_assignments()
    test_production_cycle()
    test_trade_operations()
    test_season_rotation()
    test_hud_snapshot_contains_season()
    test_tick_updates_progress()
    test_season_color_alignment()
    test_persistence_cycle()
    test_persistence_preserves_clock()
    print("All backend tests passed")


def assert_valid_season_block(season: dict) -> None:
    expected_keys = {"season_name", "season_index", "progress", "color_hex"}
    assert set(season.keys()) >= expected_keys, "Season block missing required keys"
    assert isinstance(season["season_name"], str)
    assert isinstance(season["season_index"], int)
    assert 0.0 <= float(season["progress"]) <= 1.0
    assert isinstance(season["color_hex"], str) and season["color_hex"].startswith("#")


def test_building_construction() -> None:
    ui_bridge.init_game()
    result = ui_bridge.build_building(config.WOODCUTTER_CAMP)
    assert result["ok"], "Expected successful construction"

    state = get_game_state()
    state.inventory.set_amount(Resource.WOOD, 0)
    failure = ui_bridge.build_building(config.WOODCUTTER_CAMP)
    assert not failure["ok"], "Construction should fail without resources"


def test_worker_assignments() -> None:
    ui_bridge.init_game()
    build_result = ui_bridge.build_building(config.WOODCUTTER_CAMP)
    building_id = build_result["building"]["id"]

    assign_result = ui_bridge.assign_workers(building_id, 5)
    assert assign_result["assigned"] == 3, "Should assign up to max workers"

    unassign_result = ui_bridge.unassign_workers(building_id, 2)
    assert unassign_result["unassigned"] == 2


def test_production_cycle() -> None:
    ui_bridge.init_game()
    build_result = ui_bridge.build_building(config.WOODCUTTER_CAMP)
    building_id = build_result["building"]["id"]
    ui_bridge.assign_workers(building_id, 3)

    state = get_game_state()
    wood_before = state.inventory.get_amount(Resource.WOOD)
    for _ in range(30):
        ui_bridge.tick(0.1)
    wood_after = state.inventory.get_amount(Resource.WOOD)
    assert wood_after > wood_before, "Wood production should increase stock"


def test_trade_operations() -> None:
    ui_bridge.init_game()
    state = get_game_state()
    state.inventory.set_amount(Resource.GOLD, 200)
    hops_before = state.inventory.get_amount(Resource.HOPS)

    ui_bridge.set_trade_mode(Resource.HOPS.value, "import")
    ui_bridge.set_trade_rate(Resource.HOPS.value, 60)  # 1 per second
    for _ in range(10):
        ui_bridge.tick(1.0)
    hops_after = state.inventory.get_amount(Resource.HOPS)
    assert hops_after > hops_before, "Import should increase hops"

    state.inventory.set_amount(Resource.WOOD, 1)
    ui_bridge.set_trade_mode(Resource.WOOD.value, "export")
    ui_bridge.set_trade_rate(Resource.WOOD.value, 120)
    ui_bridge.tick(1.0)
    channel = state.trade_manager.get_channel(Resource.WOOD)
    assert state.inventory.get_amount(Resource.WOOD) <= 1e-6
    ui_bridge.tick(1.0)
    assert channel.mode == "pause", "Export should pause when stock remains at zero"


def test_import_refunds_when_capacity_full() -> None:
    ui_bridge.init_game()
    state = get_game_state()
    state.inventory.set_amount(Resource.HOPS, 0)
    state.inventory.set_capacity(Resource.HOPS, 0)
    state.inventory.set_amount(Resource.GOLD, 100)

    gold_before = state.inventory.get_amount(Resource.GOLD)

    ui_bridge.set_trade_mode(Resource.HOPS.value, "import")
    ui_bridge.set_trade_rate(Resource.HOPS.value, 60)
    ui_bridge.tick(1.0)

    gold_after = state.inventory.get_amount(Resource.GOLD)
    assert abs(gold_after - gold_before) <= 1e-6, "Gold should not decrease when import fails"


def test_season_rotation() -> None:
    ui_bridge.init_game()
    state = get_game_state()
    first_season = state.season
    ui_bridge.tick(180.0)
    assert state.season != first_season
    for _ in range(3):
        ui_bridge.tick(180.0)
    assert state.season == first_season


def test_hud_snapshot_contains_season() -> None:
    ui_bridge.init_game()
    snapshot = ui_bridge.get_hud_snapshot()
    assert "season" in snapshot, "Snapshot must include season block"
    assert_valid_season_block(snapshot["season"])


def test_tick_updates_progress() -> None:
    ui_bridge.init_game()
    initial = ui_bridge.get_hud_snapshot()["season"]
    assert_valid_season_block(initial)

    response = ui_bridge.tick(30.0)
    progress = response["season"]["progress"]
    assert progress > initial["progress"], "Progress should increase after ticking"
    current_index = response["season"]["season_index"]

    previous_progress = progress
    advanced = False
    for _ in range(8):
        payload = ui_bridge.tick(30.0)
        season = payload["season"]
        assert_valid_season_block(season)
        if season["season_index"] != current_index:
            assert season["progress"] <= 0.02, "Progress should reset when season rolls over"
            advanced = True
            break
        assert season["progress"] >= previous_progress - 1e-6
        previous_progress = season["progress"]
    assert advanced, "Season should advance after enough ticks"


def test_season_color_alignment() -> None:
    ui_bridge.init_game()
    for expected_index, expected_name in enumerate(SeasonClock.SEASON_NAMES):
        if expected_index == 0:
            season = ui_bridge.get_hud_snapshot()["season"]
        else:
            season = ui_bridge.tick(180.0)["season"]
        assert season["season_name"] == expected_name
        assert season["color_hex"] == SeasonClock.SEASON_COLORS[expected_name]


def test_persistence_cycle() -> None:
    ui_bridge.init_game()
    build_result = ui_bridge.build_building(config.WHEAT_FARM)
    building_id = build_result["building"]["id"]
    ui_bridge.assign_workers(building_id, 2)
    state = get_game_state()
    state.inventory.set_amount(Resource.WATER, 50)
    save_path = Path("tests/_tmp_save.json")
    ui_bridge.save_game(str(save_path))

    state.inventory.set_amount(Resource.WATER, 0)
    ui_bridge.load_game(str(save_path))
    os.remove(save_path)

    restored = state.buildings[building_id]
    assert restored.assigned_workers == 2
    assert state.inventory.get_amount(Resource.WATER) == 50


def test_persistence_preserves_clock() -> None:
    ui_bridge.init_game()
    state = get_game_state()
    ui_bridge.tick(90.0)
    before = state.season_clock.to_dict()
    export = state.season_clock.export_state()
    save_path = Path("tests/_tmp_clock.json")
    ui_bridge.save_game(str(save_path))

    ui_bridge.tick(30.0)
    ui_bridge.load_game(str(save_path))
    os.remove(save_path)

    after = state.season_clock.to_dict()
    assert after["season_index"] == export["season_index"]
    assert math.isclose(after["progress"], before["progress"], abs_tol=0.001)
    assert after["season_name"] == before["season_name"]

    resumed = ui_bridge.tick(10.0)["season"]
    assert resumed["season_index"] == after["season_index"] or (
        resumed["season_index"] == (after["season_index"] + 1) % len(SeasonClock.SEASON_NAMES)
        and resumed["progress"] < 0.05
    )

if __name__ == "__main__":
    run_all_tests()
