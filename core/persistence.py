"""Persistence helpers to save and load game state."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from . import config
from .buildings import Building, build_from_config
from .game_state import get_game_state


SAVE_VERSION = 1


def save_game(path: str) -> None:
    """Serialise the current game state to ``path`` in JSON format."""

    game_state = get_game_state()
    data: Dict[str, Any] = {
        "version": SAVE_VERSION,
        "season": game_state.season,
        "season_time_left": game_state.season_time_left_sec,
        "clock": game_state.season_clock.export_state(),
        "inventory": game_state.inventory.bulk_export(),
        "workers": {
            "total": game_state.worker_pool.total_workers,
            "assignments": {
                building_id: building.assigned_workers
                for building_id, building in game_state.buildings.items()
            },
        },
        "buildings": [building.to_dict() for building in game_state.buildings.values()],
        "trade": game_state.trade_manager.bulk_export(),
    }
    with open(Path(path), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


def load_game(path: str) -> None:
    """Restore previously saved state from ``path``."""

    with open(Path(path), "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if data.get("version") != SAVE_VERSION:
        raise ValueError("Versión de guardado incompatible")

    game_state = get_game_state()
    game_state.reset()

    clock_data = data.get("clock")
    if isinstance(clock_data, dict):
        game_state.season_clock.load(clock_data)
    else:
        season = str(data.get("season", game_state.season))
        time_left = float(data.get("season_time_left", game_state.season_time_left_sec))
        game_state.season_clock.load(season, time_left)
    game_state._sync_season_state()

    inventory_data = data.get("inventory", {})
    quantities = inventory_data.get("quantities", {})
    capacities = inventory_data.get("capacities", {})
    game_state.inventory.bulk_load(quantities, capacities)

    workers_info = data.get("workers", {})
    game_state.worker_pool.set_total_workers(int(workers_info.get("total", game_state.worker_pool.total_workers)))

    game_state.buildings = {}
    Building.reset_ids()
    max_id = 0
    for entry in data.get("buildings", []):
        type_key = entry.get("type")
        if not type_key or type_key not in config.BUILDING_RECIPES:
            continue
        building = build_from_config(type_key)
        building.id = int(entry.get("id", building.id))
        building.enabled = bool(entry.get("enabled", True))
        building.cycle_progress = float(entry.get("cycle_progress", 0.0))
        assigned = int(entry.get("assigned_workers", 0))
        building.assigned_workers = max(0, min(assigned, building.max_workers))
        game_state.buildings[building.id] = building
        max_id = max(max_id, building.id)
        game_state.worker_pool.register_building(building)
        game_state.worker_pool.set_assignment(building, building.assigned_workers)
    Building.reset_ids(max_id + 1)

    assignments = workers_info.get("assignments", {})
    for key, value in assignments.items():
        building_id = int(key)
        building = game_state.buildings.get(building_id)
        if building:
            game_state.worker_pool.set_assignment(building, int(value))

    trade_data = data.get("trade", {})
    game_state.trade_manager.bulk_load(trade_data)
