import logging
import time
import uuid
from datetime import datetime, timezone

from flask import Flask, jsonify, render_template, request

from api import ui_bridge
from core.game_state import get_game_state
from core.scheduler import ensure_tick_loop

app = Flask(__name__)
ensure_tick_loop()

logger = logging.getLogger(__name__)


def _generate_request_metadata() -> tuple[str, str]:
    request_id = str(uuid.uuid4())
    server_time = datetime.now(timezone.utc).isoformat()
    return request_id, server_time


def _enrich_payload(payload: dict, request_id: str, server_time: str) -> dict:
    body = dict(payload or {})
    body["request_id"] = request_id
    body["server_time"] = server_time
    nested_state = body.get("state")
    if isinstance(nested_state, dict):
        nested_copy = dict(nested_state)
        nested_copy.setdefault("request_id", request_id)
        nested_copy.setdefault("server_time", server_time)
        body["state"] = nested_copy
    return body


def _json_response(payload: dict, status: int = 200, *, request_id: str, server_time: str):
    body = _enrich_payload(payload, request_id, server_time)
    response = jsonify(body)
    response.status_code = status
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.route("/")
def index():
    """Render the idle village dashboard."""
    return render_template("index.html")


@app.get("/state")
def public_state():
    """Expose the minimal public state payload required by the frontend."""

    payload = ui_bridge.get_basic_state()
    wood_amount = payload.get("items", {}).get("wood")
    logger.info("/state payload wood=%.1f", wood_amount if wood_amount is not None else 0.0)
    request_id, server_time = _generate_request_metadata()
    payload = _enrich_payload(payload, request_id, server_time)
    response = jsonify(payload)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.post("/api/init")
def api_init():
    """Initialise the game state, optionally forcing a reset."""

    reset_flag = request.args.get("reset")
    if reset_flag is None:
        payload = request.get_json(silent=True) or {}
        reset_flag = payload.get("reset") or payload.get("force_reset")

    response = ui_bridge.init_game(reset_flag)
    request_id, server_time = _generate_request_metadata()
    return _json_response(response, request_id=request_id, server_time=server_time)


@app.get("/api/state")
def api_state():
    """Return the current snapshot of the game state."""

    response = ui_bridge.get_state()
    request_id, server_time = _generate_request_metadata()
    return _json_response(response, request_id=request_id, server_time=server_time)


@app.post("/api/tick")
def api_tick():
    """Advance the simulation by ``dt`` seconds (defaults to 1)."""

    payload = request.get_json(silent=True) or {}
    dt = payload.get("dt", 1)
    response = ui_bridge.tick(dt)
    request_id, server_time = _generate_request_metadata()
    return _json_response(response, request_id=request_id, server_time=server_time)


@app.post("/api/buildings/<int:building_id>/workers")
def api_change_workers(building_id: int):
    """Apply a worker delta to the target building."""

    payload = request.get_json(silent=True) or {}
    delta = payload.get("delta")
    if delta is None:
        delta = (
            payload.get("workers")
            if payload.get("workers") is not None
            else payload.get("count")
        )
    request_id, server_time = _generate_request_metadata()
    state = get_game_state()
    before_snapshot = state.worker_allocation_snapshot(building_id)
    logger.info(
        "Worker handler enter route=/api/buildings/%s/workers request_id=%s delta=%s workers_before=%s population_available=%s timestamp=%s",
        building_id,
        request_id,
        delta,
        before_snapshot.get("workers"),
        before_snapshot.get("population_available"),
        server_time,
    )
    start = time.perf_counter()
    response = ui_bridge.change_building_workers(building_id, delta)
    status = 200
    if not response.get("ok", False):
        error_code = response.get("error_code")
        if error_code == "building_not_found":
            status = 404
        elif error_code == "assignment_failed":
            status = 409
        else:
            status = 400
    duration_ms = (time.perf_counter() - start) * 1000.0
    after_snapshot = state.worker_allocation_snapshot(building_id)
    logger.info(
        "Worker handler exit route=/api/buildings/%s/workers request_id=%s delta=%s workers_before=%s workers_after=%s population_available_before=%s population_available_after=%s status=%s duration_ms=%.2f timestamp=%s",
        building_id,
        request_id,
        delta,
        before_snapshot.get("workers"),
        after_snapshot.get("workers"),
        before_snapshot.get("population_available"),
        after_snapshot.get("population_available"),
        status,
        duration_ms,
        datetime.now(timezone.utc).isoformat(),
    )
    return _json_response(
        response,
        status,
        request_id=request_id,
        server_time=server_time,
    )


if __name__ == "__main__":
    app.run(debug=True)
