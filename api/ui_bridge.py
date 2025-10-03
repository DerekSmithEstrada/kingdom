"""Thin bridge between Flask endpoints and the core game state."""

from __future__ import annotations

from typing import Dict, Optional

from core.game_state import (
    BuildingOperationError,
    GameState,
    InsufficientResourcesError,
    InstanceNotFoundError,
    get_game_state,
)


def _success(**payload: object) -> Dict[str, object]:
    response: Dict[str, object] = {"ok": True}
    response.update(payload)
    return response


def _error(code: str, message: str, *, http_status: int = 400, **extra) -> Dict[str, object]:
    payload: Dict[str, object] = {
        "ok": False,
        "error": code,
        "error_code": code,
        "error_message": message,
        "http_status": http_status,
    }
    payload.update(extra)
    return payload


def _state_payload(state: GameState) -> Dict[str, object]:
    return {"state": state.snapshot_state()}


def init_game(force_reset: Optional[object] = None) -> Dict[str, object]:
    state = get_game_state()
    flag = bool(force_reset) if force_reset is not None else True
    if flag:
        state.reset()
    return _success(**_state_payload(state))


def tick(dt: float) -> Dict[str, object]:
    state = get_game_state()
    state.advance_time(max(0.0, float(dt)))
    return _success(**_state_payload(state))


def get_state() -> Dict[str, object]:
    state = get_game_state()
    return _success(**_state_payload(state))


def get_basic_state() -> Dict[str, object]:
    return get_state()["state"]


def build_building(type_id: str) -> Dict[str, object]:
    state = get_game_state()
    try:
        instance = state.build_instance(type_id)
    except InsufficientResourcesError as exc:
        return _error("insufficient_resources", "Recursos insuficientes", missing=exc.missing)
    except BuildingOperationError as exc:
        return _error(str(exc), str(exc))
    return _success(instance=instance.id, **_state_payload(state))


def upgrade_building(instance_id: str) -> Dict[str, object]:
    state = get_game_state()
    try:
        instance = state.upgrade_instance(instance_id)
    except InstanceNotFoundError:
        return _error("instance_not_found", "Instancia inexistente", http_status=404)
    except InsufficientResourcesError as exc:
        return _error("insufficient_resources", "Recursos insuficientes", missing=exc.missing)
    except BuildingOperationError as exc:
        return _error(str(exc), str(exc))
    return _success(instance=instance.id, **_state_payload(state))


def consolidate_building(type_id: str) -> Dict[str, object]:
    state = get_game_state()
    try:
        instance = state.consolidate(type_id)
    except BuildingOperationError as exc:
        return _error(str(exc), str(exc))
    return _success(instance=instance.id, **_state_payload(state))


def toggle_instance(instance_id: str) -> Dict[str, object]:
    state = get_game_state()
    try:
        instance = state.toggle_instance(instance_id)
    except InstanceNotFoundError:
        return _error("instance_not_found", "Instancia inexistente", http_status=404)
    return _success(instance=instance.id, **_state_payload(state))


def demolish_instance(instance_id: str) -> Dict[str, object]:
    state = get_game_state()
    try:
        state.demolish_instance(instance_id)
    except InstanceNotFoundError:
        return _error("instance_not_found", "Instancia inexistente", http_status=404)
    return _success(**_state_payload(state))


def assign_workers(instance_id: str, workers: int) -> Dict[str, object]:
    state = get_game_state()
    try:
        instance = state.assign_workers(instance_id, workers)
    except InstanceNotFoundError:
        return _error("instance_not_found", "Instancia inexistente", http_status=404)
    except BuildingOperationError as exc:
        return _error(str(exc), str(exc))
    return _success(instance=instance.id, **_state_payload(state))


def optimize_workers(type_id: Optional[str] = None) -> Dict[str, object]:
    state = get_game_state()
    state.optimize_workers(type_id)
    return _success(**_state_payload(state))

