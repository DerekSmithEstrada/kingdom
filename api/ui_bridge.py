"""Public API between the UI layer and the backend logic."""
from __future__ import annotations

from typing import Dict

from core.game_state import get_game_state
from core.persistence import load_game as core_load_game, save_game as core_save_game
from core.resources import Resource


# ---------------------------------------------------------------------------
# Initialisation and ticking


def init_game() -> Dict[str, object]:
    """Initialise or reset the global game state using configuration defaults."""

    state = get_game_state()
    state.reset()
    return {"ok": True}


def tick(dt: float) -> Dict[str, object]:
    """Advance the simulation by ``dt`` seconds."""

    state = get_game_state()
    state.tick(max(0.0, float(dt)))
    return {"ok": True}


# ---------------------------------------------------------------------------
# HUD and snapshots


def get_hud_snapshot() -> Dict[str, object]:
    return get_game_state().snapshot_hud()


def list_buildings_snapshot() -> Dict[str, object]:
    return {"buildings": get_game_state().snapshot_buildings()}


def get_jobs_snapshot() -> Dict[str, object]:
    return get_game_state().snapshot_jobs()


def get_trade_snapshot() -> Dict[str, object]:
    return get_game_state().snapshot_trade()


def get_inventory_snapshot() -> Dict[str, object]:
    return get_game_state().inventory_snapshot()


# ---------------------------------------------------------------------------
# Building interactions


def build_building(type_key: str) -> Dict[str, object]:
    state = get_game_state()
    try:
        building = state.build_building(type_key)
        return {"ok": True, "building": building.to_snapshot()}
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}


def demolish_building(building_id: int) -> Dict[str, object]:
    state = get_game_state()
    try:
        state.demolish_building(int(building_id))
        return {"ok": True}
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}


def toggle_building(building_id: int, enabled: bool) -> Dict[str, object]:
    state = get_game_state()
    try:
        state.toggle_building(int(building_id), bool(enabled))
        return {"ok": True}
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Worker management


def assign_workers(building_id: int, num: int) -> Dict[str, object]:
    state = get_game_state()
    try:
        assigned = state.assign_workers(int(building_id), int(num))
        result: Dict[str, object] = {"ok": True, "assigned": assigned}
        if assigned < num:
            result["warning"] = "No se pudieron asignar todos los trabajadores"
        return result
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}


def unassign_workers(building_id: int, num: int) -> Dict[str, object]:
    state = get_game_state()
    try:
        unassigned = state.unassign_workers(int(building_id), int(num))
        return {"ok": True, "unassigned": unassigned}
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Trade controls


def set_trade_mode(resource_key: str, mode: str) -> Dict[str, object]:
    state = get_game_state()
    try:
        resource = Resource(resource_key)
        channel = state.trade_manager.get_channel(resource)
        channel.set_mode(mode)
        return {"ok": True}
    except (ValueError, KeyError) as exc:
        return {"ok": False, "error": str(exc)}


def set_trade_rate(resource_key: str, rate: float) -> Dict[str, object]:
    state = get_game_state()
    try:
        resource = Resource(resource_key)
        channel = state.trade_manager.get_channel(resource)
        channel.set_rate(float(rate))
        return {"ok": True}
    except (ValueError, KeyError) as exc:
        return {"ok": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Persistence wrappers


def save_game(path: str) -> Dict[str, object]:
    try:
        core_save_game(path)
        return {"ok": True}
    except Exception as exc:  # pragma: no cover - safety net for UI feedback
        return {"ok": False, "error": str(exc)}


def load_game(path: str) -> Dict[str, object]:
    try:
        core_load_game(path)
        return {"ok": True}
    except Exception as exc:  # pragma: no cover - safety net for UI feedback
        return {"ok": False, "error": str(exc)}
