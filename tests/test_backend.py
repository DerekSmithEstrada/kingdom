"""Basic sanity tests for the management game backend."""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from api import ui_bridge
from core import config
from core.game_state import get_game_state
from core.resources import Resource


def run_all_tests() -> None:
    test_building_construction()
    test_worker_assignments()
    test_production_cycle()
    test_trade_operations()
    test_season_rotation()
    test_persistence_cycle()
    print("All backend tests passed")


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


def test_season_rotation() -> None:
    ui_bridge.init_game()
    state = get_game_state()
    first_season = state.season
    ui_bridge.tick(180.0)
    assert state.season != first_season
    for _ in range(3):
        ui_bridge.tick(180.0)
    assert state.season == first_season


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


if __name__ == "__main__":
    run_all_tests()
