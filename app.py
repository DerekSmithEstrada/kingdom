from flask import Flask, jsonify, render_template, request

from api import ui_bridge

app = Flask(__name__)


@app.route("/")
def index():
    """Render the idle village dashboard."""
    return render_template("index.html")


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


@app.post("/api/buildings/<int:building_id>/assign")
def api_assign_workers(building_id: int):
    """Assign workers to a building using the bridge helper."""

    payload = request.get_json(silent=True) or {}
    requested = (
        payload.get("workers")
        if payload.get("workers") is not None
        else payload.get("count")
    )
    if requested is None:
        requested = payload.get("assign") or payload.get("number")

    response = ui_bridge.assign_workers(building_id, requested or 0)
    return jsonify(response)


if __name__ == "__main__":
    app.run(debug=True)
