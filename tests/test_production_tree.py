"""Tests for the production tree graph builder."""
from __future__ import annotations

import pytest

from core import config
from core.game_state import GameState
from core.production_tree import build_graph
from core.resources import Resource


@pytest.fixture
def fresh_state():
    state = GameState.get_instance()
    state.reset()
    yield state
    state.reset()


def test_edge_from_recipe(fresh_state):
    graph = build_graph(fresh_state, config, only_discovered=False, only_active=False)
    assert any(
        edge["from"] == "wheat"
        and edge["to"] == "flour"
        and edge["via_building"] == config.WINDMILL
        and edge["recipe_id"] == f"{config.WINDMILL}:flour"
        for edge in graph["edges"]
    )


def test_active_flag(fresh_state):
    fresh_state.inventory.set_amount(Resource.STICKS, 50)
    fresh_state.inventory.set_amount(Resource.STONE, 50)
    building = fresh_state.build_building(config.WOODCUTTER_CAMP)
    building.assigned_workers = 1
    building.enabled = True
    graph = build_graph(fresh_state, config, only_discovered=True, only_active=False)
    woodcutter = next(node for node in graph["nodes"] if node["id"] == config.WOODCUTTER_CAMP)
    assert woodcutter["active"] is True

    building.assigned_workers = 0
    graph = build_graph(fresh_state, config, only_discovered=True, only_active=False)
    woodcutter = next(node for node in graph["nodes"] if node["id"] == config.WOODCUTTER_CAMP)
    assert woodcutter["active"] is False


def test_snake_case_ids(fresh_state):
    graph = build_graph(fresh_state, config, only_discovered=False, only_active=False)
    for node in graph["nodes"]:
        identifier = node["id"]
        assert identifier == identifier.lower()
        assert "-" not in identifier
    for edge in graph["edges"]:
        assert edge["from"] == edge["from"].lower()
        assert edge["to"] == edge["to"].lower()
        assert edge["via_building"] == edge["via_building"].lower()
        assert "-" not in edge["from"]
        assert "-" not in edge["to"]
        assert "-" not in edge["via_building"]
