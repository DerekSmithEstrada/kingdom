import logging
import time

from flask import Flask, jsonify, render_template, request

from api import ui_bridge
from core.scheduler import ensure_tick_loop

app = Flask(__name__)
ensure_tick_loop()

logger = logging.getLogger(__name__)


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
    return jsonify(response)


@app.get("/api/state")
def api_state():
    """Return the current snapshot of the game state."""

    response = ui_bridge.get_state()
    return jsonify(response)


@app.post("/api/tick")
def api_tick():
    """Advance the simulation by ``dt`` seconds (defaults to 1)."""

    payload = request.get_json(silent=True) or {}
    dt = payload.get("dt", 1)
    response = ui_bridge.tick(dt)
    return jsonify(response)


@app.post("/season/start")
def api_season_start():
    """Trigger a season start event at a specific timestamp."""

    payload = request.get_json(silent=True) or {}
    season = payload.get("season")
    at = payload.get("at")
    if season is None or at is None:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": "invalid_payload",
                    "error_message": "Missing 'season' or 'at' in payload",
                }
            ),
            400,
        )
    try:
        at_value = float(at)
    except (TypeError, ValueError):
        return (
            jsonify(
                {
                    "ok": False,
                    "error": "invalid_timestamp",
                    "error_message": "Timestamp 'at' must be a number",
                }
            ),
            400,
        )

    try:
        response = ui_bridge.season_start(season, at_value)
    except ValueError as exc:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": "invalid_season",
                    "error_message": str(exc),
                }
            ),
            400,
        )
    return jsonify(response)


@app.post("/api/buildings/<string:building_id>/build")
def api_build_building(building_id: str):
    """Construct a new instance of the requested building."""

    response = ui_bridge.build_building(building_id)
    status = 200
    if not response.get("ok", False):
        status = int(response.get("http_status", 400))
    else:
        status = int(response.get("http_status", status))
    return jsonify(response), status


@app.post("/api/buildings/<string:building_id>/demolish")
def api_demolish_building(building_id: str):
    """Demolish an existing instance of the requested building."""

    response = ui_bridge.demolish_building(building_id)
    status = 200
    if not response.get("ok", False):
        status = int(response.get("http_status", 400))
    else:
        status = int(response.get("http_status", status))
    return jsonify(response), status


@app.post("/api/buildings/<string:building_id>/workers")
def api_change_workers(building_id: str):
    """Apply a worker delta to the target building."""

    payload = request.get_json(silent=True) or {}
    delta = payload.get("delta")
    if delta is None:
        delta = (
            payload.get("workers")
            if payload.get("workers") is not None
            else payload.get("count")
        )
    start = time.perf_counter()
    logger.info(
        "Worker request: building=%s delta=%s payload_keys=%s",
        building_id,
        delta,
        sorted(payload.keys()),
    )
    response = ui_bridge.change_building_workers(building_id, delta)
    status = 200
    if not response.get("ok", False):
        status = int(response.get("http_status", 400))
    else:
        status = int(response.get("http_status", status))
    duration_ms = (time.perf_counter() - start) * 1000.0
    building_snapshot = response.get("building") if isinstance(response, dict) else {}
    normalized_id = None
    if isinstance(building_snapshot, dict):
        normalized_id = building_snapshot.get("id")
    workers_before = response.get("before") if isinstance(response, dict) else None
    workers_after = response.get("assigned") if isinstance(response, dict) else None
    logger.info(
        "Worker response: building=%s normalized=%s delta=%s ok=%s status=%s before=%s after=%s duration_ms=%.2f",
        building_id,
        normalized_id,
        delta,
        response.get("ok"),
        status,
        workers_before,
        workers_after,
        duration_ms,
    )
    logger.info(
        "Worker metadata: request_id=%s server_time=%s",
        response.get("request_id"),
        response.get("server_time"),
    )
    return jsonify(response), status


if __name__ == "__main__":
    app.run(debug=True)
