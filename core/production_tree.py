"""Production graph builder exposed via /api/production_tree."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Mapping, MutableMapping, Set

from . import config
from .resources import ALL_RESOURCES, Resource

CATEGORY_MAP: Dict[str, str] = {
    "wheat": "food",
    "flour": "food",
    "bread": "food",
    "berries": "food",
    "fish": "food",
    "hops": "food",
    "beer": "luxury",
    "wood": "construction",
    "plank": "construction",
    "stone": "construction",
    "polished_stone": "construction",
    "coal": "metalwork",
    "iron_ore": "metalwork",
    "iron": "metalwork",
    "tools": "metalwork",
    "wool": "textiles",
    "cloth": "textiles",
    "clothes": "textiles",
    "glass": "luxury",
    "gems": "luxury",
    "jewelry": "luxury",
}
DEFAULT_CATEGORY = "misc"


def _flag(value, default: bool) -> bool:
    if isinstance(value, str):
        token = value.strip().lower()
        if token in {"1", "true", "yes", "on"}:
            return True
        if token in {"0", "false", "no", "off"}:
            return False
        return default
    if value is None:
        return default
    return bool(value)


def _resource_id(resource: Resource | str) -> str:
    return resource.value.lower() if isinstance(resource, Resource) else str(resource)


def _collect(
    mapping: Mapping[Resource, float] | None,
    extra: Mapping[Resource, float] | None = None,
) -> Dict[str, float]:
    data: Dict[str, float] = {}
    for source in (mapping, extra):
        if source:
            for res, amount in source.items():
                data[_resource_id(res)] = float(amount)
    return data


def _amount(get_amount, identifier: str) -> float:
    try:
        return float(get_amount(Resource(identifier.upper())))
    except Exception:
        return 0.0


def build_graph(
    game_state,
    cfg=config,
    only_discovered: bool | object = True,
    only_active: bool | object = False,
) -> Dict[str, object]:
    discovered_flag = _flag(only_discovered, True)
    active_flag = _flag(only_active, False)
    inventory = getattr(game_state, "inventory", None)
    get_amount = inventory.get_amount if inventory else lambda _: 0.0  # type: ignore[misc]
    building_nodes: Dict[str, Dict[str, object]] = {}
    resource_nodes: Dict[str, Dict[str, object]] = {}
    edges: list[Dict[str, object]] = []
    relations: MutableMapping[str, MutableMapping[str, Set[str]]] = {}
    building_outputs: Dict[str, Set[str]] = {}

    for type_key, recipe in cfg.BUILDING_RECIPES.items():
        building_id = cfg.resolve_building_public_id(type_key)
        outputs = _collect(recipe.outputs, recipe.per_worker_output_rate)
        inputs = _collect(recipe.inputs, recipe.per_worker_input_rate)
        building_outputs[building_id] = set(outputs)
        for resource_id in outputs:
            relations.setdefault(resource_id, {}).setdefault("produced_by", set()).add(building_id)
        for resource_id in inputs:
            relations.setdefault(resource_id, {}).setdefault("consumed_by", set()).add(building_id)
        if not inputs:
            continue
        for output_id, output_amount in outputs.items():
            for input_id, input_amount in inputs.items():
                ratio = None if not input_amount else output_amount / float(input_amount)
                edges.append(
                    {
                        "from": input_id,
                        "to": output_id,
                        "recipe_id": f"{building_id}:{output_id}",
                        "ratio": ratio,
                        "via_building": building_id,
                    }
                )

    active_buildings: Set[str] = set()
    for type_key in cfg.BUILDING_RECIPES:
        building_id = cfg.resolve_building_public_id(type_key)
        metadata = cfg.get_building_metadata(type_key)
        building = game_state.buildings.get(building_id)
        built = workers = 0
        rate = None
        active = discovered = False
        if building is not None:
            built = int(getattr(building, "built_count", building.built))
            workers = int(getattr(building, "assigned_workers", 0))
            discovered = built > 0 or building.enabled
            try:
                snapshot = game_state.snapshot_building(building.id)
            except ValueError:
                snapshot = None
            if snapshot:
                built = int(snapshot.get("built", built))
                workers = int(snapshot.get("workers", workers))
                per_minute = snapshot.get("per_minute_output") or {}
                if per_minute:
                    rate = sum(float(amount) for amount in per_minute.values()) / 60.0
                if bool(snapshot.get("can_produce")) and workers > 0:
                    active = True
                discovered = discovered or built > 0 or bool(snapshot.get("production_report"))
        building_nodes[building_id] = {
            "id": building_id,
            "type": "building",
            "built": built,
            "workers": workers,
            "rate_per_sec": rate,
            "active": active,
            "discovered": discovered,
            "category": metadata.category or DEFAULT_CATEGORY,
        }
        if active:
            active_buildings.add(building_id)

    for resource_id, relation in relations.items():
        node = resource_nodes.setdefault(
            resource_id,
            {
                "id": resource_id,
                "type": "resource",
                "stock": 0.0,
                "discovered": False,
                "category": CATEGORY_MAP.get(resource_id, DEFAULT_CATEGORY),
            },
        )
        node["stock"] = _amount(get_amount, resource_id)
        discovered = node["stock"] > 0 or any(
            building_nodes.get(bid, {}).get("built", 0) > 0 for bid in relation.get("produced_by", ())
        )
        if not discovered:
            discovered = any(
                building_nodes.get(bid, {}).get("built", 0) > 0 for bid in relation.get("consumed_by", ())
            )
        node["discovered"] = discovered

    for resource in ALL_RESOURCES:
        identifier = resource.value.lower()
        stock = _amount(get_amount, identifier)
        if identifier not in resource_nodes and stock <= 0:
            continue
        node = resource_nodes.setdefault(
            identifier,
            {
                "id": identifier,
                "type": "resource",
                "stock": 0.0,
                "discovered": False,
                "category": CATEGORY_MAP.get(identifier, DEFAULT_CATEGORY),
            },
        )
        node["stock"] = stock
        if stock > 0:
            node["discovered"] = True

    if active_flag:
        edges = [edge for edge in edges if edge["via_building"] in active_buildings]
        allowed = {edge["from"] for edge in edges} | {edge["to"] for edge in edges}
        for building_id in active_buildings:
            allowed.update(building_outputs.get(building_id, set()))
        resource_nodes = {rid: node for rid, node in resource_nodes.items() if rid in allowed}
        building_nodes = {bid: node for bid, node in building_nodes.items() if bid in active_buildings}

    if discovered_flag:
        resource_nodes = {rid: node for rid, node in resource_nodes.items() if node["discovered"]}
        building_nodes = {bid: node for bid, node in building_nodes.items() if node["discovered"]}
        edges = [
            edge
            for edge in edges
            if edge["from"] in resource_nodes
            and edge["to"] in resource_nodes
            and edge["via_building"] in building_nodes
        ]

    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    return {
        "nodes": list(resource_nodes.values()) + list(building_nodes.values()),
        "edges": edges,
        "meta": {
            "updated_at": timestamp,
            "active_buildings": sorted(active_buildings),
            "filters": {"only_discovered": discovered_flag, "only_active": active_flag},
            "id_style": "snake_case",
        },
    }
