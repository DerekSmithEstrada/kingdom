import logging

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
    logger.info(
        "Worker request: building=%s delta=%s payload_keys=%s",
        building_id,
        delta,
        sorted(payload.keys()),
    )
    response = ui_bridge.change_building_workers(building_id, delta)
    status = 200
    if not response.get("ok", False):
        error_code = response.get("error_code")
        status = 404 if error_code == "building_not_found" else 400
    logger.info(
        "Worker response: building=%s delta=%s ok=%s status=%s",
        building_id,
        delta,
        response.get("ok"),
        status,
    )
    return jsonify(response), status


if __name__ == "__main__":
    app.run(debug=True)
