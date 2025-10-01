"""Flask application exposing the management game UI and JSON API."""

from __future__ import annotations

from flask import Flask, jsonify, render_template, request

from api import ui_bridge


app = Flask(__name__)


@app.route("/")
def index() -> str:
    """Render the idle village dashboard."""

    return render_template("index.html")


def _json_response(payload: dict[str, object], *, success_status: int = 200):
    """Return a payload encoded as JSON with an inferred status code."""

    status = success_status if payload.get("ok", True) else 400
    return jsonify(payload), status


@app.post("/api/init")
def api_init():
    """Initialise the game state and return the first UI snapshot."""

    result = ui_bridge.init_game()
    if not result.get("ok", False):
        return _json_response(result)

    payload = {
        "ok": True,
        "hud": ui_bridge.get_hud_snapshot(),
        "buildings": ui_bridge.list_buildings_snapshot().get("buildings", []),
        "jobs": ui_bridge.get_jobs_snapshot(),
        "trade": ui_bridge.get_trade_snapshot(),
    }
    return _json_response(payload)


@app.get("/api/hud")
def api_hud():
    """Return the latest HUD snapshot."""

    payload = {
        "ok": True,
        "hud": ui_bridge.get_hud_snapshot(),
        "jobs": ui_bridge.get_jobs_snapshot(),
        "trade": ui_bridge.get_trade_snapshot(),
    }
    return _json_response(payload)


@app.get("/api/buildings")
def api_buildings():
    """Return the current list of buildings along with worker data."""

    payload = {
        "ok": True,
        "buildings": ui_bridge.list_buildings_snapshot().get("buildings", []),
        "jobs": ui_bridge.get_jobs_snapshot(),
    }
    return _json_response(payload)


@app.get("/api/trade")
def api_trade():
    """Return the current trade channel configuration."""

    payload = {"ok": True, "trade": ui_bridge.get_trade_snapshot()}
    return _json_response(payload)


@app.post("/api/actions/build")
def action_build():
    """Construct a new building of the provided type."""

    data = request.get_json(silent=True) or {}
    type_key = data.get("type")
    if not type_key:
        return _json_response({"ok": False, "error": "Missing 'type'"})
    return _json_response(ui_bridge.build_building(str(type_key)))


@app.post("/api/actions/demolish")
def action_demolish():
    """Demolish a building by id."""

    data = request.get_json(silent=True) or {}
    building_id = data.get("id")
    if building_id is None:
        return _json_response({"ok": False, "error": "Missing 'id'"})
    return _json_response(ui_bridge.demolish_building(int(building_id)))


@app.post("/api/actions/toggle")
def action_toggle():
    """Enable or disable a building."""

    data = request.get_json(silent=True) or {}
    building_id = data.get("id")
    enabled = data.get("enabled")
    if building_id is None or enabled is None:
        return _json_response({"ok": False, "error": "Missing 'id' or 'enabled'"})
    return _json_response(ui_bridge.toggle_building(int(building_id), bool(enabled)))


@app.post("/api/actions/assign")
def action_assign():
    """Assign workers to a building (incrementally)."""

    data = request.get_json(silent=True) or {}
    building_id = data.get("id")
    workers = data.get("workers")
    if building_id is None or workers is None:
        return _json_response({"ok": False, "error": "Missing 'id' or 'workers'"})
    return _json_response(ui_bridge.assign_workers(int(building_id), int(workers)))


@app.post("/api/actions/unassign")
def action_unassign():
    """Remove workers from a building (incrementally)."""

    data = request.get_json(silent=True) or {}
    building_id = data.get("id")
    workers = data.get("workers")
    if building_id is None or workers is None:
        return _json_response({"ok": False, "error": "Missing 'id' or 'workers'"})
    return _json_response(ui_bridge.unassign_workers(int(building_id), int(workers)))


@app.post("/api/actions/trade/mode")
def action_trade_mode():
    """Update the mode of a trade channel."""

    data = request.get_json(silent=True) or {}
    resource_key = data.get("resource")
    mode = data.get("mode")
    if not resource_key or mode is None:
        return _json_response({"ok": False, "error": "Missing 'resource' or 'mode'"})
    return _json_response(ui_bridge.set_trade_mode(str(resource_key), str(mode)))


@app.post("/api/actions/trade/rate")
def action_trade_rate():
    """Update the rate of a trade channel."""

    data = request.get_json(silent=True) or {}
    resource_key = data.get("resource")
    rate = data.get("rate")
    if resource_key is None or rate is None:
        return _json_response({"ok": False, "error": "Missing 'resource' or 'rate'"})
    return _json_response(ui_bridge.set_trade_rate(str(resource_key), float(rate)))


@app.post("/api/actions/tick")
def action_tick():
    """Advance the simulation for visual refreshes."""

    data = request.get_json(silent=True) or {}
    dt = float(data.get("dt", 1.0))
    return _json_response(ui_bridge.tick(dt))


if __name__ == "__main__":
    app.run(debug=True)
