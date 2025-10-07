"""Tests for the production tree graph builder."""
from __future__ import annotations

from typing import Mapping

from core import config
from core.buildings import build_from_config
from core.production_tree import generate_graph_from_snapshots
from core.resources import Resource


def _make_building_snapshot(type_key: str, *, workers: int, built: int = 1) -> dict:
    building = build_from_config(type_key)
    building.built = built
    building.enabled = True
    building.assigned_workers = workers
    snapshot = building.to_snapshot()
    max_workers = max(1, int(snapshot.get("max_workers") or 1))
    effective_rate = min(1.0, workers / max_workers)
    snapshot["effective_rate"] = effective_rate
    snapshot["workers"] = workers
    snapshot["active_workers"] = workers
    snapshot["last_report"] = {
        "status": "produced" if workers > 0 else "inactive",
        "reason": None,
        "detail": None,
        "consumed": {},
        "produced": {},
    }
    snapshot["modifiers_applied"] = {"total_multiplier": 1.0}
    return snapshot


def _make_inventory(amounts: Mapping[Resource | str, float]) -> dict:
    inventory: dict[str, dict[str, float | None]] = {}
    for key, value in amounts.items():
        if isinstance(key, Resource):
            resource_key = key.value
        else:
            resource_key = str(key)
        inventory[resource_key] = {"amount": float(value), "capacity": None}
    return inventory


def test_production_tree_contains_edges_for_recipes():
    windmill_snapshot = _make_building_snapshot(config.WINDMILL, workers=2)
    inventory = _make_inventory({Resource.WHEAT: 12.0, Resource.FLOUR: 0.0})

    graph = generate_graph_from_snapshots(
        buildings=[windmill_snapshot],
        inventory=inventory,
        version=1,
        only_discovered=True,
    )

    edges = graph["edges"]
    assert any(edge["from"] == "wheat" and edge["to"] == "flour" for edge in edges)
    windmill_edges = [edge for edge in edges if edge["building_id"] == windmill_snapshot["id"]]
    assert windmill_edges, "Expected at least one edge for the windmill"
    assert all(edge["ratio"] == 1.0 for edge in windmill_edges)


def test_building_rates_scale_with_workers():
    inventory = _make_inventory({Resource.WHEAT: 20.0, Resource.FLOUR: 0.0})

    low_workers_snapshot = _make_building_snapshot(config.WINDMILL, workers=1)
    high_workers_snapshot = _make_building_snapshot(config.WINDMILL, workers=2)

    graph_low = generate_graph_from_snapshots(
        buildings=[low_workers_snapshot],
        inventory=inventory,
        version=2,
        only_discovered=True,
    )
    graph_high = generate_graph_from_snapshots(
        buildings=[high_workers_snapshot],
        inventory=inventory,
        version=3,
        only_discovered=True,
    )

    def _building_rate(graph: dict) -> float:
        for node in graph["nodes"]:
            if node.get("type") == "building" and node.get("id") == low_workers_snapshot["id"]:
                return float(node.get("outputs_per_sec", {}).get("flour", 0.0))
        return 0.0

    low_rate = _building_rate(graph_low)
    high_rate = _building_rate(graph_high)

    assert low_rate > 0
    assert high_rate > low_rate
