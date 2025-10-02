"""Basic sanity tests for the management game backend."""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path
from typing import Tuple

sys.path.append(str(Path(__file__).resolve().parents[1]))

from api import ui_bridge
from core import config
from core.game_state import get_game_state
from core.resources import Resource
from core.timeclock import SeasonClock


def run_all_tests() -> None:
    test_initial_inventory_seed()
    test_starting_woodcutter_requires_workers()
    test_building_construction()
    test_worker_assignments()
    test_production_cycle()
    test_trade_operations()
    test_season_rotation()
    test_hud_snapshot_contains_season()
    test_tick_updates_progress()
    test_season_color_alignment()
    test_seasonal_modifiers_affect_production()
    test_persistence_cycle()
    test_persistence_preserves_clock()
    test_atomic_cycle_requires_inputs()
    test_atomic_cycle_respects_capacity()
    test_atomic_cycle_reports_consumption()
    print("All backend tests passed")


def assert_valid_season_block(season: dict) -> None:
    expected_keys = {"season_name", "season_index", "progress", "color_hex"}
    assert set(season.keys()) >= expected_keys, "Season block missing required keys"
    assert isinstance(season["season_name"], str)
    assert isinstance(season["season_index"], int)
    assert 0.0 <= float(season["progress"]) <= 1.0
    assert isinstance(season["color_hex"], str) and season["color_hex"].startswith("#")


def grant_construction_resources(type_key: str, multiplier: float = 1.0) -> None:
    state = get_game_state()
    cost = config.COSTOS_CONSTRUCCION.get(type_key, {})
    for resource, amount in cost.items():
        state.inventory.set_amount(resource, float(amount) * multiplier)


def test_initial_inventory_seed() -> None:
    response = ui_bridge.init_game()
    snapshot = ui_bridge.get_inventory_snapshot()
    for resource in Resource:
        amount = snapshot[resource.value]["amount"]
        assert math.isclose(amount, 0.0, rel_tol=1e-9, abs_tol=1e-9)

    assert response["ok"]
    resources_payload = response.get("resources", {})
    assert resources_payload.get(Resource.GOLD.value, 0.0) == 0.0

    state = get_game_state()
    assert len(state.buildings) == 1
    building = next(iter(state.buildings.values()))
    assert building.type_key == config.WOODCUTTER_CAMP
    assert building.assigned_workers == 0


def test_starting_woodcutter_requires_workers() -> None:
    ui_bridge.init_game()
    state = get_game_state()
    assert len(state.buildings) == 1
    building = next(iter(state.buildings.values()))

    wood_before = state.inventory.get_amount(Resource.WOOD)
    for _ in range(10):
        ui_bridge.tick(1.0)
    wood_after_no_workers = state.inventory.get_amount(Resource.WOOD)
    assert math.isclose(wood_after_no_workers, wood_before, rel_tol=1e-9, abs_tol=1e-9)

    ui_bridge.assign_workers(building.id, 1)
    for _ in range(10):
        ui_bridge.tick(1.0)
    wood_after_assignment = state.inventory.get_amount(Resource.WOOD)
    assert math.isclose(
        wood_after_assignment,
        wood_before + 1.0,
        rel_tol=1e-9,
        abs_tol=1e-9,
    )


def test_building_construction() -> None:
    ui_bridge.init_game()
    grant_construction_resources(config.WOODCUTTER_CAMP)
    result = ui_bridge.build_building(config.WOODCUTTER_CAMP)
    assert result["ok"], "Expected successful construction"

    state = get_game_state()
    state.inventory.set_amount(Resource.WOOD, 0)
    failure = ui_bridge.build_building(config.WOODCUTTER_CAMP)
    assert not failure["ok"], "Construction should fail without resources"


def test_worker_assignments() -> None:
    ui_bridge.init_game()
    grant_construction_resources(config.WOODCUTTER_CAMP)
    build_result = ui_bridge.build_building(config.WOODCUTTER_CAMP)
    building_id = build_result["building"]["id"]

    assign_result = ui_bridge.assign_workers(building_id, 5)
    assert assign_result["assigned"] == 5, "Should assign requested workers within max"

    unassign_result = ui_bridge.unassign_workers(building_id, 2)
    assert unassign_result["unassigned"] == 2


def test_production_cycle() -> None:
    ui_bridge.init_game()
    grant_construction_resources(config.WOODCUTTER_CAMP)
    build_result = ui_bridge.build_building(config.WOODCUTTER_CAMP)
    building_id = build_result["building"]["id"]
    ui_bridge.assign_workers(building_id, 5)

    state = get_game_state()
    state.inventory.set_amount(Resource.WOOD, 0.0)
    wood_before = state.inventory.get_amount(Resource.WOOD)
    for _ in range(10):
        ui_bridge.tick(1.0)
    wood_after = state.inventory.get_amount(Resource.WOOD)
    assert math.isclose(wood_after - wood_before, 5.0, rel_tol=1e-9, abs_tol=1e-9)


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


def test_seasonal_modifiers_affect_production() -> None:
    ui_bridge.init_game()
    grant_construction_resources(config.FARMER)
    state = get_game_state()
    build_result = ui_bridge.build_building(config.FARMER)
    building_id = build_result["building"]["id"]
    ui_bridge.assign_workers(building_id, 3)
    state.inventory.set_amount(Resource.SEEDS, 500)

    def advance_to(target: str) -> None:
        attempts = 0
        while state.season != target and attempts < 8:
            remaining = state.season_clock.get_time_left()
            dt = remaining if remaining > 0 else state.season_clock.ticks_per_season
            ui_bridge.tick(dt + 0.001)
            attempts += 1
        assert state.season == target, f"Failed to reach season {target}"

    advance_to("Summer")
    summer_snapshot = state.snapshot_building(building_id)
    summer_modifiers = summer_snapshot["modifiers_applied"]
    assert summer_modifiers["season"] == "Summer"
    assert math.isclose(
        summer_modifiers["values"][config.FARMER], 1.2, rel_tol=1e-6
    )

    advance_to("Winter")
    winter_snapshot = state.snapshot_building(building_id)
    winter_modifiers = winter_snapshot["modifiers_applied"]
    assert winter_modifiers["season"] == "Winter"
    assert math.isclose(
        winter_modifiers["values"][config.FARMER], 0.7, rel_tol=1e-6
    )

    assert winter_snapshot["effective_rate"] < summer_snapshot["effective_rate"]


def test_persistence_cycle() -> None:
    ui_bridge.init_game()
    grant_construction_resources(config.FARMER)
    build_result = ui_bridge.build_building(config.FARMER)
    building_id = build_result["building"]["id"]
    ui_bridge.assign_workers(building_id, 2)
    state = get_game_state()
    state.inventory.set_amount(Resource.SEEDS, 50)
    save_path = Path("tests/_tmp_save.json")
    ui_bridge.save_game(str(save_path))

    state.inventory.set_amount(Resource.WATER, 0)
    ui_bridge.load_game(str(save_path))
    os.remove(save_path)

    restored = state.buildings[building_id]
    assert restored.assigned_workers == 2
    assert state.inventory.get_amount(Resource.SEEDS) == 50


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


def test_atomic_cycle_requires_inputs() -> None:
    ui_bridge.init_game()
    grant_construction_resources(config.LUMBER_HUT)
    build_result = ui_bridge.build_building(config.LUMBER_HUT)
    building_id = build_result["building"]["id"]
    state = get_game_state()

    state.inventory.set_amount(Resource.WOOD, 1.0)
    state.inventory.set_amount(Resource.GOLD, 10.0)
    ui_bridge.assign_workers(building_id, 2)

    for _ in range(10):
        ui_bridge.tick(1.0)

    report = state.last_production_reports.get(building_id)
    assert report is not None
    assert report["status"] == "stalled"
    assert report["reason"] == "missing_input"
    assert not report["consumed"], "No resources should be consumed when stalled"
    assert not report["produced"], "No outputs should be generated without inputs"
    assert math.isclose(state.inventory.get_amount(Resource.WOOD), 1.0, rel_tol=1e-6)


def test_atomic_cycle_respects_capacity() -> None:
    ui_bridge.init_game()
    grant_construction_resources(config.WOODCUTTER_CAMP)
    build_result = ui_bridge.build_building(config.WOODCUTTER_CAMP)
    building_id = build_result["building"]["id"]
    state = get_game_state()

    ui_bridge.assign_workers(building_id, 3)
    current = state.inventory.get_amount(Resource.WOOD)
    state.inventory.set_capacity(Resource.WOOD, current)

    for _ in range(10):
        ui_bridge.tick(1.0)

    report = state.last_production_reports.get(building_id)
    assert report is not None
    assert report["status"] == "stalled"
    assert report["reason"] == "no_capacity"
    assert not report["produced"], "Outputs should not be produced when capacity is full"
    assert math.isclose(state.inventory.get_amount(Resource.WOOD), current, rel_tol=1e-6)


def test_atomic_cycle_reports_consumption() -> None:
    ui_bridge.init_game()
    grant_construction_resources(config.LUMBER_HUT)
    build_result = ui_bridge.build_building(config.LUMBER_HUT)
    building_id = build_result["building"]["id"]
    state = get_game_state()

    ui_bridge.assign_workers(building_id, 2)
    state.inventory.set_amount(Resource.WOOD, 20.0)
    state.inventory.set_amount(Resource.GOLD, 50.0)
    state.inventory.set_amount(Resource.PLANK, 0.0)
    initial_wood = state.inventory.get_amount(Resource.WOOD)
    initial_gold = state.inventory.get_amount(Resource.GOLD)
    initial_planks = state.inventory.get_amount(Resource.PLANK)

    ui_bridge.tick(4.0)

    report = state.last_production_reports.get(building_id)
    assert report is not None
    assert report["status"] == "produced"

    consumed = report["consumed"]
    produced = report["produced"]
    assert math.isclose(consumed[Resource.WOOD.value], 2.0, rel_tol=1e-6)
    maintenance = config.BUILDING_RECIPES[config.LUMBER_HUT].maintenance[Resource.GOLD]
    assert math.isclose(consumed[Resource.GOLD.value], maintenance, rel_tol=1e-6)
    assert math.isclose(produced[Resource.PLANK.value], 1.0, rel_tol=1e-6)

    final_wood = state.inventory.get_amount(Resource.WOOD)
    final_gold = state.inventory.get_amount(Resource.GOLD)
    expected_wood = initial_wood - consumed[Resource.WOOD.value]
    expected_gold = initial_gold - consumed[Resource.GOLD.value]
    expected_planks = initial_planks + produced[Resource.PLANK.value]
    assert math.isclose(final_wood, expected_wood, rel_tol=1e-6)
    assert math.isclose(final_gold, expected_gold, rel_tol=1e-6)
    assert math.isclose(state.inventory.get_amount(Resource.PLANK), expected_planks, rel_tol=1e-6)


def test_insufficient_stock_blocks_output() -> None:
    ui_bridge.init_game()
    grant_construction_resources(config.LUMBER_HUT)
    build_result = ui_bridge.build_building(config.LUMBER_HUT)
    building_id = build_result["building"]["id"]
    state = get_game_state()

    ui_bridge.assign_workers(building_id, 2)
    state.inventory.set_amount(Resource.WOOD, 1.0)
    state.inventory.set_amount(Resource.GOLD, 50.0)
    state.inventory.set_amount(Resource.PLANK, 0.0)

    ui_bridge.tick(4.0)

    report = state.last_production_reports.get(building_id)
    assert report is not None
    assert report["status"] == "stalled"
    assert report["reason"] == "missing_input"
    assert not report["consumed"]
    assert not report["produced"]
    assert math.isclose(state.inventory.get_amount(Resource.WOOD), 1.0, rel_tol=1e-6)
    assert math.isclose(state.inventory.get_amount(Resource.PLANK), 0.0, rel_tol=1e-6)


def test_exact_stock_produces_without_negatives() -> None:
    ui_bridge.init_game()
    grant_construction_resources(config.LUMBER_HUT)
    build_result = ui_bridge.build_building(config.LUMBER_HUT)
    building_id = build_result["building"]["id"]
    state = get_game_state()

    ui_bridge.assign_workers(building_id, 2)
    state.inventory.set_amount(Resource.WOOD, 2.0)
    state.inventory.set_amount(Resource.GOLD, 50.0)
    state.inventory.set_amount(Resource.PLANK, 0.0)

    ui_bridge.tick(4.0)

    report = state.last_production_reports.get(building_id)
    assert report is not None
    assert report["status"] == "produced"
    produced = report["produced"].get(Resource.PLANK.value, 0.0)
    assert math.isclose(produced, 1.0, rel_tol=1e-6)
    assert state.inventory.get_amount(Resource.WOOD) >= -1e-9
    assert math.isclose(state.inventory.get_amount(Resource.WOOD), 0.0, abs_tol=1e-6)
    assert math.isclose(state.inventory.get_amount(Resource.PLANK), produced, rel_tol=1e-6)


def test_competing_buildings_consume_available_input_once() -> None:
    ui_bridge.init_game()
    grant_construction_resources(config.LUMBER_HUT, multiplier=2.0)
    first = ui_bridge.build_building(config.LUMBER_HUT)
    second = ui_bridge.build_building(config.LUMBER_HUT)
    first_id = first["building"]["id"]
    second_id = second["building"]["id"]
    state = get_game_state()

    ui_bridge.assign_workers(first_id, 2)
    ui_bridge.assign_workers(second_id, 2)
    state.inventory.set_amount(Resource.WOOD, 2.0)
    state.inventory.set_amount(Resource.GOLD, 100.0)
    state.inventory.set_amount(Resource.PLANK, 0.0)

    ui_bridge.tick(4.0)

    first_report = state.last_production_reports.get(first_id)
    second_report = state.last_production_reports.get(second_id)
    assert first_report is not None and second_report is not None
    produced_total = first_report["produced"].get(Resource.PLANK.value, 0.0) + second_report[
        "produced"
    ].get(Resource.PLANK.value, 0.0)
    assert math.isclose(produced_total, 1.0, rel_tol=1e-6)
    statuses = {first_report["status"], second_report["status"]}
    assert statuses == {"produced", "stalled"}
    assert math.isclose(state.inventory.get_amount(Resource.WOOD), 0.0, abs_tol=1e-6)


def test_season_change_modifies_rate_and_output() -> None:
    ui_bridge.init_game()
    grant_construction_resources(config.FARMER)
    build_result = ui_bridge.build_building(config.FARMER)
    building_id = build_result["building"]["id"]
    state = get_game_state()
    ui_bridge.assign_workers(building_id, 3)

    def advance_to(target: str) -> None:
        attempts = 0
        while state.season != target and attempts < 12:
            remaining = state.season_clock.get_time_left()
            dt = remaining if remaining > 0 else state.season_clock.ticks_per_season
            ui_bridge.tick(dt + 0.1)
            attempts += 1
        assert state.season == target, f"Failed to reach season {target}"

    def measure(season: str) -> Tuple[float, float]:
        advance_to(season)
        building = state.buildings[building_id]
        building.cycle_progress = 0.0
        state.inventory.set_amount(Resource.SEEDS, 200.0)
        state.inventory.set_amount(Resource.GRAIN, 0.0)
        state.inventory.set_amount(Resource.GOLD, 500.0)
        for _ in range(40):
            ui_bridge.tick(1.0)
        snapshot = state.snapshot_building(building_id)
        return snapshot["effective_rate"], state.inventory.get_amount(Resource.GRAIN)

    summer_rate, summer_output = measure("Summer")
    winter_rate, winter_output = measure("Winter")

    assert summer_rate > winter_rate
    assert summer_output > winter_output


def test_artisan_requires_all_inputs() -> None:
    ui_bridge.init_game()
    grant_construction_resources(config.ARTISAN)
    build_result = ui_bridge.build_building(config.ARTISAN)
    building_id = build_result["building"]["id"]
    state = get_game_state()

    ui_bridge.assign_workers(building_id, 2)
    state.inventory.set_amount(Resource.PLANK, 2.0)
    state.inventory.set_amount(Resource.STONE, 0.0)
    state.inventory.set_amount(Resource.GOLD, 100.0)

    ui_bridge.tick(6.0)

    report = state.last_production_reports.get(building_id)
    assert report is not None
    assert report["status"] == "stalled"
    assert report["reason"] == "missing_input"
    assert report.get("detail") in {Resource.STONE.value, Resource.PLANK.value}
    assert math.isclose(state.inventory.get_amount(Resource.PLANK), 2.0, rel_tol=1e-6)
    assert math.isclose(state.inventory.get_amount(Resource.TOOLS), 0.0, rel_tol=1e-6)


def test_missing_input_notifications_reflect_import_and_clear() -> None:
    ui_bridge.init_game()
    grant_construction_resources(config.LUMBER_HUT)
    build_result = ui_bridge.build_building(config.LUMBER_HUT)
    building_id = build_result["building"]["id"]
    state = get_game_state()

    ui_bridge.assign_workers(building_id, 2)
    state.inventory.set_amount(Resource.WOOD, 0.0)
    state.inventory.set_amount(Resource.GOLD, 200.0)
    state.inventory.set_amount(Resource.PLANK, 0.0)

    channel = state.trade_manager.get_channel(Resource.WOOD)
    channel.set_mode("import")
    channel.set_rate(0.0)

    ui_bridge.tick(4.0)

    notifications = state.list_notifications()
    assert notifications, "Expected notification for missing wood"
    expected = "Lumber Hut parado: falta Wood (resoluble via import)"
    assert expected in notifications

    ui_bridge.tick(4.0)
    notifications = state.list_notifications()
    assert notifications.count(expected) == 1

    state.inventory.set_amount(Resource.WOOD, 20.0)
    ui_bridge.tick(4.0)
    assert expected not in state.list_notifications()


if __name__ == "__main__":
    run_all_tests()
