"""Public API between the UI layer and the backend logic."""
from __future__ import annotations

from typing import Dict

from core import config
from core.game_state import (
    InsufficientResourcesError,
    NothingToDemolishError,
    get_game_state,
)
from core.village_design import VillagePlacementError
from core.jobs import WorkerAllocationError
from core.persistence import load_game as core_load_game, save_game as core_save_game
from core.resources import Resource
from core.production_tree import build_production_graph


def _season_snapshot(state=None) -> Dict[str, object]:
    game_state = state or get_game_state()
    return game_state.season_clock.to_dict()


# ---------------------------------------------------------------------------
# Initialisation and ticking


def _success_response(**payload: object) -> Dict[str, object]:
    response: Dict[str, object] = {"ok": True}
    response.update(payload)
    return response


def _error_response(
    code: str, message: str, *, http_status: int | None = None
) -> Dict[str, object]:
    payload: Dict[str, object] = {
        "ok": False,
        "error_code": code,
        "error_message": message,
        "error": message,
    }
    if http_status is not None:
        payload["http_status"] = int(http_status)
    return payload


def _should_reset(flag: object) -> bool:
    if flag is None:
        return True
    if isinstance(flag, str):
        return flag.strip().lower() not in {"0", "false", "no"}
    return bool(flag)


def _state_payload(state) -> Dict[str, object]:
    payload = state.snapshot_state()
    payload["production_report"] = state.production_reports_snapshot()
    return payload


def init_game(force_reset: object = None) -> Dict[str, object]:
    """Initialise or reset the global game state using configuration defaults."""

    state = get_game_state()
    if _should_reset(force_reset):
        state.reset()
    return _success_response(**_state_payload(state))


def tick(dt: float) -> Dict[str, object]:
    """Advance the simulation by ``dt`` seconds."""

    state = get_game_state()
    state.advance_time(max(0.0, float(dt)))
    return _success_response(**_state_payload(state))


def season_start(season: str, at: float) -> Dict[str, object]:
    """Trigger the season start event at the provided timestamp."""

    state = get_game_state()
    normalized = str(season or "").strip().lower()
    if normalized.title() in state.season_clock.seasons:
        state.season_clock.load(normalized.title())
    state.on_season_start(normalized, float(at))
    return _success_response(**_state_payload(state))


def get_state() -> Dict[str, object]:
    """Return a snapshot of the overall game state."""

    state = get_game_state()
    return _success_response(**_state_payload(state))


def get_basic_state() -> Dict[str, object]:
    """Return the minimal state payload used by the public /state endpoint."""

    state = get_game_state()
    return state.basic_state_snapshot()


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


def get_production_tree(only_discovered: object = True) -> Dict[str, object]:
    """Return the current production tree graph."""

    state = get_game_state()
    filter_discovered = _should_reset(only_discovered)
    graph = build_production_graph(state, only_discovered=filter_discovered)
    metadata = state.response_metadata(graph.get("meta", {}).get("version"))
    return _success_response(graph=graph, **metadata)


# ---------------------------------------------------------------------------
# Building interactions


def build_building(type_key: str) -> Dict[str, object]:
    state = get_game_state()
    try:
        canonical_type = config.resolve_building_type(type_key)
    except ValueError as exc:
        error = _error_response(
            "invalid_building_type",
            str(exc),
            http_status=404,
        )
        error.update(state.response_metadata())
        return error

    try:
        building = state.build_building(canonical_type)
    except InsufficientResourcesError as exc:
        requirements = {
            resource.value.lower(): float(amount)
            for resource, amount in exc.requirements.items()
        }
        error: Dict[str, object] = {
            "ok": False,
            "error": "INSUFFICIENT_RESOURCES",
            "error_code": "insufficient_resources",
            "error_message": "Recursos insuficientes",
            "requires": requirements,
            "http_status": 400,
        }
        error.update(state.response_metadata())
        return error
    except ValueError as exc:
        error = _error_response("build_failed", str(exc), http_status=400)
        error.update(state.response_metadata())
        return error

    snapshot = state.snapshot_building(building.id)
    state_payload = state.basic_state_snapshot()
    metadata = state.response_metadata(state_payload.get("version"))
    payload: Dict[str, object] = {
        "building": snapshot,
        "buildings": [snapshot],
        "production_report": snapshot["last_report"],
        "state": state_payload,
        "inventory": state.inventory_snapshot(),
        "resources": state.resources_snapshot(),
        "http_status": 200,
    }
    payload.update(metadata)
    return _success_response(**payload)


def demolish_building(building_id: int) -> Dict[str, object]:
    state = get_game_state()
    try:
        canonical_id = config.resolve_building_public_id(str(building_id))
    except ValueError:
        error = _error_response(
            "building_not_found",
            "Edificio inexistente",
            http_status=404,
        )
        error.update(state.response_metadata())
        return error

    try:
        building = state.demolish_building(canonical_id)
    except NothingToDemolishError:
        error: Dict[str, object] = {
            "ok": False,
            "error": "NOTHING_TO_DEMOLISH",
            "error_code": "nothing_to_demolish",
            "error_message": "No hay edificios para demoler",
            "http_status": 400,
        }
        error.update(state.response_metadata())
        return error
    except ValueError as exc:
        error = _error_response("building_not_found", str(exc), http_status=404)
        error.update(state.response_metadata())
        return error

    snapshot = state.snapshot_building(building.id)
    state_payload = state.basic_state_snapshot()
    metadata = state.response_metadata(state_payload.get("version"))
    payload: Dict[str, object] = {
        "building": snapshot,
        "buildings": [snapshot],
        "production_report": snapshot["last_report"],
        "state": state_payload,
        "inventory": state.inventory_snapshot(),
        "resources": state.resources_snapshot(),
        "http_status": 200,
    }
    payload.update(metadata)
    return _success_response(**payload)


def toggle_building(building_id: int, enabled: bool) -> Dict[str, object]:
    state = get_game_state()
    try:
        building_id = int(building_id)
        state.toggle_building(building_id, bool(enabled))
        snapshot = state.snapshot_building(building_id)
        return _success_response(
            building=snapshot,
            production_report=snapshot["last_report"],
        )
    except ValueError as exc:
        return _error_response("building_not_found", str(exc))


# ---------------------------------------------------------------------------
# Worker management


def change_building_workers(building_id: str, delta: int) -> Dict[str, object]:
    state = get_game_state()
    try:
        canonical_id = config.resolve_building_public_id(str(building_id))
    except ValueError:
        error = _error_response(
            "invalid_building_id",
            "El identificador de edificio es inválido",
            http_status=404,
        )
        error.update(state.response_metadata())
        return error

    try:
        delta = int(delta)
    except (TypeError, ValueError):
        error = _error_response(
            "invalid_delta", "El cambio de trabajadores debe ser un número entero"
        )
        error.update(state.response_metadata())
        return error

    try:
        result = state.apply_worker_delta(canonical_id, delta)
        snapshot = state.snapshot_building(canonical_id)
        state_payload = state.basic_state_snapshot()
        metadata = {
            "request_id": state_payload.get("request_id"),
            "server_time": state_payload.get("server_time"),
            "version": state_payload.get("version"),
        }
        payload: Dict[str, object] = {
            "delta": result["delta"],
            "assigned": result["assigned"],
            "before": result.get("before"),
            "building": snapshot,
            "production_report": snapshot["last_report"],
            "state": state_payload,
        }
        payload.update(metadata)
        payload["http_status"] = 200
        return _success_response(**payload)
    except WorkerAllocationError as exc:
        error = _error_response(
            "assignment_failed", str(exc), http_status=409
        )
        error.update(state.response_metadata())
        return error
    except ValueError as exc:
        error = _error_response("building_not_found", str(exc), http_status=404)
        error.update(state.response_metadata())
        return error


def assign_workers(building_id: int, num: int) -> Dict[str, object]:
    return change_building_workers(building_id, num)


def unassign_workers(building_id: int, num: int) -> Dict[str, object]:
    return change_building_workers(building_id, -num)


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
# Village design bridge


def get_village_design_state() -> Dict[str, object]:
    state = get_game_state()
    snapshot = state.snapshot_village_design()
    metadata = state.response_metadata(snapshot.get("version"))
    payload = {"village": snapshot}
    payload.update(metadata)
    return _success_response(**payload)


def build_village_tile(x: int, y: int, building_type: str) -> Dict[str, object]:
    state = get_game_state()
    try:
        snapshot = state.build_village_structure(x, y, building_type)
    except InsufficientResourcesError as exc:
        requirements = {
            resource.value.lower(): float(amount)
            for resource, amount in exc.requirements.items()
        }
        error = _error_response(
            "insufficient_resources",
            "Recursos insuficientes",
            http_status=400,
        )
        error["requires"] = requirements
        error.update(state.response_metadata())
        return error
    except VillagePlacementError as exc:
        error = _error_response("invalid_placement", str(exc), http_status=400)
        error.update(state.response_metadata())
        return error
    metadata = state.response_metadata(snapshot.get("version"))
    payload = {"village": snapshot}
    payload.update(metadata)
    return _success_response(**payload)


def demolish_village_tile(x: int, y: int) -> Dict[str, object]:
    state = get_game_state()
    try:
        snapshot = state.demolish_village_structure(x, y)
    except VillagePlacementError as exc:
        error = _error_response("invalid_demolish", str(exc), http_status=400)
        error.update(state.response_metadata())
        return error
    metadata = state.response_metadata(snapshot.get("version"))
    payload = {"village": snapshot}
    payload.update(metadata)
    return _success_response(**payload)


def upgrade_village_tile(x: int, y: int) -> Dict[str, object]:
    state = get_game_state()
    try:
        snapshot = state.upgrade_village_structure(x, y)
    except VillagePlacementError as exc:
        error = _error_response("invalid_upgrade", str(exc), http_status=400)
        error.update(state.response_metadata())
        return error
    metadata = state.response_metadata(snapshot.get("version"))
    payload = {"village": snapshot}
    payload.update(metadata)
    return _success_response(**payload)


def save_village_design(path: str | None = None) -> Dict[str, object]:
    state = get_game_state()
    try:
        target = state.save_village_design(path)
    except Exception as exc:  # pragma: no cover - UI feedback only
        error = _error_response("village_save_failed", str(exc), http_status=500)
        error.update(state.response_metadata())
        return error
    metadata = state.response_metadata()
    return _success_response(path=target, message="Village design saved", **metadata)


def load_village_design(path: str | None = None) -> Dict[str, object]:
    state = get_game_state()
    try:
        snapshot = state.load_village_design(path)
    except FileNotFoundError:
        error = _error_response("village_save_missing", "No saved design found", http_status=404)
        error.update(state.response_metadata())
        return error
    except VillagePlacementError as exc:
        error = _error_response("village_load_failed", str(exc), http_status=400)
        error.update(state.response_metadata())
        return error
    except Exception as exc:  # pragma: no cover - UI feedback
        error = _error_response("village_load_failed", str(exc), http_status=400)
        error.update(state.response_metadata())
        return error
    metadata = state.response_metadata(snapshot.get("version"))
    payload = {"village": snapshot, "message": "Village design loaded"}
    payload.update(metadata)
    return _success_response(**payload)


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
