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


@app.get("/game/state")
def game_state():
    payload = ui_bridge.get_state()
    status = payload.get("http_status", 200)
    return jsonify(payload), status


@app.post("/api/init")
def api_init():
    payload = request.get_json(silent=True) or {}
    response = ui_bridge.init_game(payload.get("reset"))
    status = response.get("http_status", 200)
    return jsonify(response), status


@app.get("/api/state")
def api_state():
    response = ui_bridge.get_state()
    status = response.get("http_status", 200)
    return jsonify(response), status


@app.post("/api/tick")
def api_tick():
    payload = request.get_json(silent=True) or {}
    response = ui_bridge.tick(payload.get("dt", 1))
    status = response.get("http_status", 200)
    return jsonify(response), status


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


@app.post("/buildings/build")
def build_building():
    payload = request.get_json(silent=True) or {}
    type_id = payload.get("type_id")
    if not type_id:
        return jsonify({"ok": False, "error": "missing_type", "error_message": "type_id requerido"}), 400
    response = ui_bridge.build_building(type_id)
    status = response.get("http_status", 200 if response.get("ok") else 400)
    return jsonify(response), status


@app.post("/buildings/upgrade")
def upgrade_building():
    payload = request.get_json(silent=True) or {}
    instance_id = payload.get("instance_id")
    if not instance_id:
        return jsonify({"ok": False, "error": "missing_instance", "error_message": "instance_id requerido"}), 400
    response = ui_bridge.upgrade_building(instance_id)
    status = response.get("http_status", 200 if response.get("ok") else 400)
    return jsonify(response), status


@app.post("/buildings/consolidate")
def consolidate_building():
    payload = request.get_json(silent=True) or {}
    type_id = payload.get("type_id")
    if not type_id:
        return jsonify({"ok": False, "error": "missing_type", "error_message": "type_id requerido"}), 400
    response = ui_bridge.consolidate_building(type_id)
    status = response.get("http_status", 200 if response.get("ok") else 400)
    return jsonify(response), status


@app.post("/buildings/toggle")
def toggle_building():
    payload = request.get_json(silent=True) or {}
    instance_id = payload.get("instance_id")
    if not instance_id:
        return jsonify({"ok": False, "error": "missing_instance", "error_message": "instance_id requerido"}), 400
    response = ui_bridge.toggle_instance(instance_id)
    status = response.get("http_status", 200 if response.get("ok") else 400)
    return jsonify(response), status


@app.post("/buildings/demolish")
def demolish_building():
    payload = request.get_json(silent=True) or {}
    instance_id = payload.get("instance_id")
    if not instance_id:
        return jsonify({"ok": False, "error": "missing_instance", "error_message": "instance_id requerido"}), 400
    response = ui_bridge.demolish_instance(instance_id)
    status = response.get("http_status", 200 if response.get("ok") else 400)
    return jsonify(response), status


@app.post("/workers/assign")
def assign_workers():
    payload = request.get_json(silent=True) or {}
    instance_id = payload.get("instance_id")
    workers = payload.get("n") if "n" in payload else payload.get("workers")
    if instance_id is None or workers is None:
        return jsonify({"ok": False, "error": "invalid_payload", "error_message": "instance_id y n requeridos"}), 400
    response = ui_bridge.assign_workers(instance_id, int(workers))
    status = response.get("http_status", 200 if response.get("ok") else 400)
    return jsonify(response), status


@app.post("/workers/optimize")
def optimize_workers():
    payload = request.get_json(silent=True) or {}
    response = ui_bridge.optimize_workers(payload.get("type_id"))
    status = response.get("http_status", 200 if response.get("ok") else 400)
    return jsonify(response), status


if __name__ == "__main__":
    app.run(debug=True)
