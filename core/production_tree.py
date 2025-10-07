"""Production tree graph builder for the Idle Village backend."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Mapping, MutableMapping, Optional, Sequence, Tuple

from .resources import ALL_RESOURCES, Resource


@dataclass(frozen=True)
class GraphNode:
    """Serializable node within the production graph."""

    id: str
    payload: Dict[str, object]


@dataclass(frozen=True)
class GraphEdge:
    """Serializable edge within the production graph."""

    key: str
    payload: Dict[str, object]


_CategoryMap = {
    "crops": "food",
    "farm": "food",
    "bakery": "food",
    "brewery": "food",
    "food": "food",
    "fish": "food",
    "dairy": "food",
    "wood": "construction",
    "stone": "construction",
    "construction": "construction",
    "quarry": "construction",
    "mining": "metal",
    "smelter": "metal",
    "metal": "metal",
    "blacksmith": "metal",
    "forge": "metal",
    "textiles": "textiles",
    "tailor": "textiles",
    "cloth": "textiles",
    "luxury": "luxury",
    "jeweler": "luxury",
    "jewellery": "luxury",
    "wine": "luxury",
}

_CategoryPriority = {
    "food": 0,
    "construction": 1,
    "metal": 2,
    "textiles": 3,
    "luxury": 4,
    "misc": 5,
}

_DEFAULT_GROUP = "misc"


def _resource_id(resource: Resource | str) -> str:
    if isinstance(resource, Resource):
        return resource.value.lower()
    return str(resource).strip().lower()


def _resource_label(resource: Resource) -> str:
    return resource.name.replace("_", " ").title()


def _normalise_category_group(category: Optional[str]) -> str:
    if not category:
        return _DEFAULT_GROUP
    normalized = str(category).strip().lower()
    if not normalized:
        return _DEFAULT_GROUP
    return _CategoryMap.get(normalized, normalized if normalized in _CategoryPriority else _DEFAULT_GROUP)


def _sort_category_group(group: str) -> int:
    return _CategoryPriority.get(group, _CategoryPriority[_DEFAULT_GROUP])


def _clone_mapping(mapping: Optional[Mapping[str, object]]) -> Dict[str, object]:
    if not mapping:
        return {}
    return {str(key): value for key, value in mapping.items()}


class ProductionTreeCache:
    """Simple version-aware cache for production tree payloads."""

    def __init__(self) -> None:
        self._entries: Dict[Tuple[bool], Tuple[int, Dict[str, object]]] = {}

    def get(self, *, version: int, only_discovered: bool) -> Optional[Dict[str, object]]:
        cached = self._entries.get((only_discovered,))
        if not cached:
            return None
        cached_version, payload = cached
        if cached_version != version:
            return None
        return payload

    def store(
        self,
        *,
        version: int,
        only_discovered: bool,
        payload: Dict[str, object],
    ) -> None:
        self._entries[(only_discovered,)] = (version, payload)


_CACHE = ProductionTreeCache()


def build_production_graph(state, *, only_discovered: bool = True) -> Dict[str, object]:
    """Return a production graph snapshot for ``state``.

    The result is memoised based on the internal state version, meaning repeated
    calls for the same state snapshot are inexpensive.
    """

    metadata = state.response_metadata()
    version = int(metadata.get("version", 0))
    cached = _CACHE.get(version=version, only_discovered=only_discovered)
    if cached is not None:
        return cached

    inventory_snapshot = state.inventory_snapshot()
    building_snapshots = state.snapshot_buildings()

    graph = generate_graph_from_snapshots(
        buildings=building_snapshots,
        inventory=inventory_snapshot,
        version=version,
        only_discovered=only_discovered,
    )
    _CACHE.store(version=version, only_discovered=only_discovered, payload=graph)
    return graph


def generate_graph_from_snapshots(
    *,
    buildings: Sequence[Mapping[str, object]],
    inventory: Mapping[str, Mapping[str, float | None]],
    version: int,
    only_discovered: bool,
) -> Dict[str, object]:
    """Build the production tree using plain snapshots.

    This helper is intentionally decoupled from :class:`GameState` to ease unit
    testing. ``buildings`` must be a sequence compatible with
    :meth:`core.game_state.GameState.snapshot_buildings`, while ``inventory``
    follows :meth:`core.inventory.Inventory.snapshot`.
    """

    inventory_amounts: Dict[str, float] = {}
    for resource in ALL_RESOURCES:
        key = resource.value
        entry = inventory.get(key)
        if isinstance(entry, Mapping):
            amount = float(entry.get("amount", 0.0) or 0.0)
        else:
            amount = 0.0
        inventory_amounts[_resource_id(resource)] = amount

    category_by_resource: Dict[str, str] = {}
    produced_resources: MutableMapping[str, bool] = {}
    related_discovery: Dict[str, bool] = { _resource_id(res): False for res in ALL_RESOURCES }

    building_nodes: List[GraphNode] = []
    building_inputs: Dict[str, List[str]] = {}
    building_outputs: Dict[str, List[str]] = {}

    edges: List[GraphEdge] = []

    for snapshot in buildings:
        node = _build_building_node(snapshot)
        building_nodes.append(node)

        building_id = node.payload["id"]
        inputs = node.payload.get("inputs_per_cycle", {})
        outputs = node.payload.get("outputs_per_cycle", {})
        workers = int(node.payload.get("workers", 0))
        building_discovered = bool(node.payload.get("discovered"))
        building_inputs[building_id] = list(inputs.keys())
        building_outputs[building_id] = list(outputs.keys())

        for output in outputs.keys():
            produced_resources[output] = True
            if building_discovered:
                related_discovery[output] = True

        group = node.payload.get("category_group", _DEFAULT_GROUP)
        for resource_key in outputs.keys():
            current = category_by_resource.get(resource_key)
            if current is None or _sort_category_group(group) < _sort_category_group(current):
                category_by_resource[resource_key] = group

        if workers > 0:
            for input_key in inputs.keys():
                related_discovery[_resource_id(input_key)] = True

        last_report = node.payload.get("last_report", {})
        reason = last_report.get("reason") if isinstance(last_report, Mapping) else None
        detail = last_report.get("detail") if isinstance(last_report, Mapping) else None

        for edge in _build_edges_for_building(node.payload, reason, detail):
            edges.append(edge)

    resource_nodes: List[GraphNode] = []
    for resource in ALL_RESOURCES:
        resource_key = _resource_id(resource)
        amount = inventory_amounts.get(resource_key, 0.0)
        discovered = amount > 0.0 or related_discovery.get(resource_key, False)
        category_group = category_by_resource.get(resource_key, _DEFAULT_GROUP)
        resource_nodes.append(
            GraphNode(
                id=resource_key,
                payload={
                    "id": resource_key,
                    "type": "resource",
                    "resource": resource.value,
                    "label": _resource_label(resource),
                    "stock": amount,
                    "discovered": discovered,
                    "category_group": category_group,
                    "raw": not produced_resources.get(resource_key, False),
                },
            )
        )

    filtered_resource_nodes = _filter_nodes(resource_nodes, only_discovered)
    filtered_building_nodes = _filter_nodes(building_nodes, only_discovered)
    visible_ids = {node.id for node in filtered_resource_nodes + filtered_building_nodes}
    filtered_edges = [edge for edge in edges if edge.payload["from"] in visible_ids and edge.payload["to"] in visible_ids]

    _apply_depth_metadata(filtered_resource_nodes, filtered_building_nodes, filtered_edges)

    active_buildings = [node.id for node in filtered_building_nodes if node.payload.get("active")]

    meta = {
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "version": version,
        "active_buildings": active_buildings,
        "filters": {"only_discovered": bool(only_discovered)},
        "has_recipes": bool(edges),
        "categories": _build_category_payload(filtered_resource_nodes, filtered_building_nodes),
    }

    return {
        "nodes": [node.payload for node in filtered_resource_nodes + filtered_building_nodes],
        "edges": [edge.payload for edge in filtered_edges],
        "meta": meta,
    }


def _build_category_payload(
    resources: Sequence[GraphNode],
    buildings: Sequence[GraphNode],
) -> Dict[str, Dict[str, object]]:
    groups: Dict[str, Dict[str, object]] = {}
    for node in list(resources) + list(buildings):
        group = str(node.payload.get("category_group", _DEFAULT_GROUP))
        entry = groups.setdefault(group, {"count": 0})
        entry["count"] = int(entry.get("count", 0)) + 1
    return groups


def _filter_nodes(nodes: Sequence[GraphNode], only_discovered: bool) -> List[GraphNode]:
    if not only_discovered:
        return list(nodes)
    return [node for node in nodes if node.payload.get("discovered")]


def _build_building_node(snapshot: Mapping[str, object]) -> GraphNode:
    building_id = str(snapshot.get("id") or snapshot.get("type") or "")
    type_key = str(snapshot.get("type") or building_id)
    name = str(snapshot.get("name") or type_key.replace("_", " ").title())

    workers = int(snapshot.get("workers") or snapshot.get("active_workers") or snapshot.get("active") or 0)
    built_count = int(snapshot.get("built") or 0)
    max_workers = int(snapshot.get("max_workers") or snapshot.get("capacityPerBuilding") or 0)

    per_worker_output = _clone_mapping(snapshot.get("per_worker_output_rate"))
    per_worker_input = _clone_mapping(snapshot.get("per_worker_input_rate"))

    inputs_per_cycle = _clone_mapping(snapshot.get("inputs"))
    outputs_per_cycle = _clone_mapping(snapshot.get("outputs"))

    cycle_time = float(snapshot.get("cycle_time") or snapshot.get("cycle_time_sec") or 0.0)
    effective_rate = float(snapshot.get("effective_rate") or 0.0)

    modifiers = snapshot.get("modifiers_applied")
    modifier_multiplier = 1.0
    if isinstance(modifiers, Mapping):
        try:
            modifier_multiplier = float(modifiers.get("total_multiplier", 1.0))
        except (TypeError, ValueError):  # pragma: no cover - defensive
            modifier_multiplier = 1.0

    outputs_per_sec: Dict[str, float] = {}
    inputs_per_sec: Dict[str, float] = {}

    if per_worker_output:
        for key, rate in per_worker_output.items():
            resource_key = _resource_id(key)
            outputs_per_sec[resource_key] = float(rate) * workers * modifier_multiplier
        for key, rate in per_worker_input.items():
            resource_key = _resource_id(key)
            inputs_per_sec[resource_key] = float(rate) * workers * modifier_multiplier
    elif cycle_time > 0:
        cycle_factor = effective_rate / cycle_time
        for key, amount in outputs_per_cycle.items():
            resource_key = _resource_id(key)
            outputs_per_sec[resource_key] = float(amount) * cycle_factor
        for key, amount in inputs_per_cycle.items():
            resource_key = _resource_id(key)
            inputs_per_sec[resource_key] = float(amount) * cycle_factor

    status = str(snapshot.get("status") or "").lower()
    last_report = snapshot.get("last_report")
    if not isinstance(last_report, Mapping):
        last_report = {}
    report_status = str(last_report.get("status") or status or "").lower()
    discovered = built_count > 0 or workers > 0 or report_status not in {"", "inactive"}
    active = report_status in {"produced", "running"}

    category = snapshot.get("category")
    category_group = _normalise_category_group(category)

    payload = {
        "id": building_id,
        "type": "building",
        "building_type": type_key,
        "name": name,
        "built": built_count,
        "workers": workers,
        "max_workers": max_workers,
        "enabled": bool(snapshot.get("enabled", True)),
        "discovered": discovered,
        "active": active,
        "status": report_status or status,
        "category": category,
        "category_label": snapshot.get("category_label") or None,
        "category_group": category_group,
        "inputs_per_cycle": {
            _resource_id(resource): float(amount)
            for resource, amount in inputs_per_cycle.items()
            if float(amount) > 0
        },
        "outputs_per_cycle": {
            _resource_id(resource): float(amount)
            for resource, amount in outputs_per_cycle.items()
            if float(amount) > 0
        },
        "inputs_per_sec": inputs_per_sec,
        "outputs_per_sec": outputs_per_sec,
        "rate_per_sec": sum(outputs_per_sec.values()) if outputs_per_sec else 0.0,
        "consumption_per_sec": sum(inputs_per_sec.values()) if inputs_per_sec else 0.0,
        "modifiers": modifiers if isinstance(modifiers, Mapping) else {},
        "last_report": dict(last_report),
        "cycle_time": cycle_time,
        "effective_rate": effective_rate,
    }
    return GraphNode(id=building_id, payload=payload)


def _build_edges_for_building(
    building_payload: Mapping[str, object],
    failure_reason: Optional[str],
    failure_detail: Optional[object],
) -> Iterable[GraphEdge]:
    building_id = str(building_payload.get("id"))
    building_type = str(building_payload.get("building_type") or building_id)
    building_name = str(building_payload.get("name") or building_type)

    outputs_per_cycle = building_payload.get("outputs_per_cycle") or {}
    inputs_per_cycle = building_payload.get("inputs_per_cycle") or {}

    if not isinstance(outputs_per_cycle, Mapping):
        outputs_per_cycle = {}
    if not isinstance(inputs_per_cycle, Mapping):
        inputs_per_cycle = {}

    for output_resource, output_amount in outputs_per_cycle.items():
        output_amount = float(output_amount)
        if output_amount <= 0:
            continue
        output_id = _resource_id(output_resource)
        for input_resource, input_amount in inputs_per_cycle.items():
            input_amount = float(input_amount)
            if input_amount <= 0:
                continue
            input_id = _resource_id(input_resource)
            ratio = input_amount / output_amount if output_amount else 0.0
            bottleneck = (
                str(failure_reason) == "missing_input"
                and isinstance(failure_detail, str)
                and failure_detail.strip().lower() == input_id
            )
            edge_payload = {
                "id": f"{building_id}:{input_id}->{output_id}",
                "from": input_id,
                "to": output_id,
                "recipe_id": f"{building_type}:{output_id}",
                "building_id": building_id,
                "building_name": building_name,
                "ratio": ratio,
                "inputs": {input_id: input_amount},
                "outputs": {output_id: output_amount},
                "bottleneck": bottleneck,
            }
            if bottleneck and isinstance(failure_detail, str):
                edge_payload["detail"] = failure_detail
            yield GraphEdge(key=edge_payload["id"], payload=edge_payload)
        if not inputs_per_cycle:
            # No inputs, emit a pseudo edge from source to output for completeness.
            edge_payload = {
                "id": f"{building_id}::source->{output_id}",
                "from": output_id,
                "to": output_id,
                "recipe_id": f"{building_type}:{output_id}",
                "building_id": building_id,
                "building_name": building_name,
                "ratio": 0.0,
                "inputs": {},
                "outputs": {output_id: output_amount},
                "bottleneck": str(failure_reason) == "missing_input",
            }
            yield GraphEdge(key=edge_payload["id"], payload=edge_payload)


def _apply_depth_metadata(
    resources: Sequence[GraphNode],
    buildings: Sequence[GraphNode],
    edges: Sequence[GraphEdge],
) -> None:
    resource_depth: Dict[str, int] = {node.id: 0 for node in resources}
    inputs_by_building: Dict[str, List[str]] = {}

    for edge in edges:
        inputs_by_building.setdefault(edge.payload["building_id"], []).append(edge.payload["from"])

    changed = True
    while changed:
        changed = False
        for edge in edges:
            source = edge.payload["from"]
            target = edge.payload["to"]
            source_depth = resource_depth.get(source, 0)
            new_depth = source_depth + 1
            if new_depth > resource_depth.get(target, 0):
                resource_depth[target] = new_depth
                changed = True

    building_depth: Dict[str, int] = {}
    for building in buildings:
        inputs = inputs_by_building.get(building.id, [])
        if inputs:
            base = max(resource_depth.get(resource, 0) for resource in inputs)
        else:
            base = 0
        building_depth[building.id] = base * 2 + 1

    for node in resources:
        depth = resource_depth.get(node.id, 0)
        node.payload["depth"] = depth * 2

    for node in buildings:
        node.payload["depth"] = building_depth.get(node.id, 1)

    for edge in edges:
        edge.payload["depth_from"] = resource_depth.get(edge.payload["from"], 0) * 2
        edge.payload["depth_to"] = resource_depth.get(edge.payload["to"], 0) * 2


__all__ = [
    "build_production_graph",
    "generate_graph_from_snapshots",
]
