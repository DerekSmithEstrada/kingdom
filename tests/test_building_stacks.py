import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api import ui_bridge
from core.game_state import get_game_state


@pytest.fixture
def state():
    state = get_game_state()
    state.reset()
    yield state
    state.reset()


def _instance_report(state, type_id, instance_id):
    report = state.get_stack_report(type_id)
    mapping = {entry.instance_id: entry for entry in report.instances}
    return mapping[instance_id]


def test_input_proration(state):
    instance = state.build_instance("sawmill")
    state.assign_workers(instance.id, 4)
    state.inventory.set_amount("wood", 12)
    state.inventory.set_amount("planks", 0)

    state.advance_time(60)

    assert state.inventory.get("planks") == pytest.approx(8.0, rel=1e-3)
    report = _instance_report(state, "sawmill", instance.id)
    assert report.input_factor == pytest.approx(0.5, rel=1e-3)


def test_high_level_priority(state):
    low = state.build_instance("sawmill")
    high = state.build_instance("sawmill")
    state.assign_workers(low.id, 4)
    state.assign_workers(high.id, 4)
    state.upgrade_instance(high.id)

    state.inventory.set_amount("wood", 48)
    state.inventory.set_amount("planks", 0)

    state.advance_time(60)

    low_report = _instance_report(state, "sawmill", low.id)
    high_report = _instance_report(state, "sawmill", high.id)

    assert high_report.input_factor == pytest.approx(1.0, rel=1e-3)
    assert low_report.input_factor == pytest.approx(0.0, abs=1e-6)
    assert state.inventory.get("planks") == pytest.approx(32.0, rel=1e-3)


def test_consolidation_creates_higher_level(state):
    for _ in range(3):
        instance = state.build_instance("sawmill")
        state.assign_workers(instance.id, 1)
        state.upgrade_instance(instance.id)

    result = state.consolidate("sawmill")

    assert result.level == 3
    assert len(state.instances_by_type["sawmill"]) == 1
    assert state.instances_by_type["sawmill"][0].id == result.id


def test_worker_optimisation_focuses_best_instance(state):
    low = state.build_instance("lumber_camp")
    high = state.build_instance("lumber_camp")
    state.assign_workers(low.id, 2)
    state.assign_workers(high.id, 1)
    state.upgrade_instance(high.id)
    state.upgrade_instance(high.id)
    state.workers_free = 0

    state.optimize_workers("lumber_camp")

    low_after = state.instances[low.id]
    high_after = state.instances[high.id]

    assert high_after.workers_assigned >= 1
    assert low_after.workers_assigned <= high_after.workers_assigned


def test_auto_disables_lower_level_when_over_capacity(state):
    low = state.build_instance("lumber_camp")
    high = state.build_instance("lumber_camp")
    state.assign_workers(low.id, 2)
    state.assign_workers(high.id, 2)
    state.workers_total = 2
    total_assigned = low.workers_assigned + high.workers_assigned
    state.workers_free = max(0, state.workers_total - total_assigned)

    state.upgrade_instance(high.id)

    assert state.instances[low.id].workers_assigned == 0
    assert state.instances[low.id].active is False


@pytest.fixture
def client(state):
    from app import app

    app.testing = True
    ui_bridge.init_game(True)
    with app.test_client() as client:
        yield client


def test_api_build_assign_and_toggle(client):
    build = client.post("/buildings/build", json={"type_id": "lumber_camp"})
    assert build.status_code == 200
    payload = build.get_json()
    assert payload["ok"] is True
    instance_id = payload["instance"]

    assign = client.post("/workers/assign", json={"instance_id": instance_id, "n": 2})
    assert assign.status_code == 200
    assert assign.get_json()["ok"] is True

    toggle = client.post("/buildings/toggle", json={"instance_id": instance_id})
    assert toggle.status_code == 200
    assert toggle.get_json()["ok"] is True
