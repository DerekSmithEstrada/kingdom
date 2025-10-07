from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Optional, Tuple

from collections import defaultdict

from .resources import Resource, normalise_mapping


VILLAGE_SIZE = 10
DEFAULT_SAVE_PATH = Path(__file__).resolve().parent.parent / "data" / "village_design.json"


@dataclass(frozen=True)
class TerrainDefinition:
    key: str
    label: str
    icon: str
    description: str


TERRAIN_TYPES: Dict[str, TerrainDefinition] = {
    "plain": TerrainDefinition(
        key="plain",
        label="Grassland",
        icon="🌿",
        description="Neutral terrain ideal for most structures.",
    ),
    "water": TerrainDefinition(
        key="water",
        label="Water",
        icon="🌊",
        description="Provides fresh water for nearby farms and houses.",
    ),
    "forest": TerrainDefinition(
        key="forest",
        label="Forest",
        icon="🌲",
        description="Dense trees that boost nearby wood production.",
    ),
    "hill": TerrainDefinition(
        key="hill",
        label="Hill",
        icon="⛰️",
        description="Rocky elevation that suits stone quarries.",
    ),
}


DEFAULT_TERRAIN_LAYOUT: Tuple[Tuple[str, ...], ...] = (
    ("water", "water", "water", "plain", "plain", "plain", "forest", "forest", "plain", "plain"),
    ("water", "water", "plain", "plain", "plain", "forest", "forest", "forest", "plain", "plain"),
    ("water", "plain", "plain", "forest", "forest", "forest", "plain", "plain", "plain", "plain"),
    ("plain", "plain", "plain", "forest", "hill", "plain", "plain", "plain", "plain", "plain"),
    ("plain", "plain", "plain", "hill", "hill", "plain", "plain", "forest", "plain", "plain"),
    ("plain", "plain", "plain", "plain", "plain", "plain", "plain", "forest", "forest", "plain"),
    ("plain", "plain", "forest", "forest", "plain", "plain", "plain", "plain", "plain", "plain"),
    ("plain", "forest", "forest", "plain", "plain", "plain", "plain", "plain", "water", "water"),
    ("plain", "plain", "plain", "plain", "plain", "plain", "plain", "water", "water", "water"),
    ("plain", "plain", "plain", "plain", "plain", "plain", "plain", "water", "water", "water"),
)


@dataclass(frozen=True)
class VillageBuildingDefinition:
    id: str
    name: str
    category: str
    icon: str
    color: str
    cost: Dict[Resource, float] = field(default_factory=dict)
    description: str = ""
    production: Dict[str, float] = field(default_factory=dict)
    efficiency_notes: List[str] = field(default_factory=list)
    housing: int = 0
    transport_bonus: float = 0.0
    logistics_radius: int = 0
    base_efficiency: float = 1.0
    inputs: Dict[str, float] = field(default_factory=dict)
    tier: int = 0
    workers: int = 0

    def to_payload(self) -> Dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "icon": self.icon,
            "color": self.color,
            "description": self.description,
            "production": self.production,
            "efficiency_notes": list(self.efficiency_notes),
            "housing": self.housing,
            "transport_bonus": self.transport_bonus,
            "logistics_radius": self.logistics_radius,
            "base_efficiency": self.base_efficiency,
            "inputs": self.inputs,
            "tier": self.tier,
            "workers": self.workers,
            "cost": {
                resource.value.lower(): float(amount)
                for resource, amount in self.cost.items()
            },
        }


BUILDING_DEFINITIONS: Dict[str, VillageBuildingDefinition] = {
    "woodcutter_camp": VillageBuildingDefinition(
        id="woodcutter_camp",
        name="Woodcutter Camp",
        category="production",
        icon="🪓",
        color="#b47339",
        cost=normalise_mapping({}),
        description="Harvests nearby forests for raw wood. Works best bordering dense woods.",
        production={"wood": 6.0},
        efficiency_notes=["+25% when next to a forest tile"],
        tier=0,
        workers=2,
    ),
    "stick_gatherer": VillageBuildingDefinition(
        id="stick_gatherer",
        name="Stick Gatherer",
        category="production",
        icon="🥢",
        color="#96764a",
        cost=normalise_mapping({}),
        description="Collects fallen branches used as basic fuel and crafting material.",
        production={"sticks": 4.0},
        efficiency_notes=["Base resource node – no inputs required"],
        tier=0,
        workers=1,
    ),
    "stone_quarry": VillageBuildingDefinition(
        id="stone_quarry",
        name="Stone Quarry",
        category="production",
        icon="⛏️",
        color="#80889a",
        cost=normalise_mapping({}),
        description="Extracts stone. Gains speed when built on or beside hills.",
        production={"stone": 4.5},
        efficiency_notes=["+15% if touching a hill tile"],
        tier=0,
        workers=3,
    ),
    "gold_panner": VillageBuildingDefinition(
        id="gold_panner",
        name="Gold Panner",
        category="production",
        icon="🥇",
        color="#d9b44a",
        cost=normalise_mapping({}),
        description="Pans nearby rivers for flecks of gold. Prefers water tiles.",
        production={"gold": 1.5},
        efficiency_notes=["+15% when adjacent to water"],
        tier=0,
        workers=2,
    ),
    "sawmill": VillageBuildingDefinition(
        id="sawmill",
        name="Sawmill",
        category="production",
        icon="🪚",
        color="#9b7653",
        cost=normalise_mapping({}),
        description="Processes logs into sturdy planks. Needs steady wood supply.",
        production={"planks": 3.0},
        inputs={"wood": 4.0},
        tier=1,
        workers=3,
    ),
    "carpenter": VillageBuildingDefinition(
        id="carpenter",
        name="Carpenter Workshop",
        category="production",
        icon="🛠️",
        color="#c2743d",
        cost=normalise_mapping({}),
        description="Crafts tools from refined planks to unlock advanced structures.",
        production={"tools": 2.0},
        inputs={"planks": 2.0},
        tier=2,
        workers=2,
    ),
    "warehouse": VillageBuildingDefinition(
        id="warehouse",
        name="Village Warehouse",
        category="storage",
        icon="📦",
        color="#d9a441",
        cost=normalise_mapping({}),
        description="Central storage that speeds up deliveries within its reach.",
        production={},
        transport_bonus=0.3,
        logistics_radius=2,
        efficiency_notes=["+30% transport efficiency within 2 tiles"],
        tier=0,
        workers=2,
    ),
    "cart_station": VillageBuildingDefinition(
        id="cart_station",
        name="Cart Station",
        category="transport",
        icon="🛒",
        color="#8f9bb3",
        cost=normalise_mapping({}),
        description="Dispatches hand carts to link nearby buildings.",
        production={},
        transport_bonus=0.2,
        logistics_radius=1,
        efficiency_notes=["+20% transport bonus to adjacent tiles"],
        tier=0,
        workers=1,
    ),
    "house": VillageBuildingDefinition(
        id="house",
        name="Village House",
        category="housing",
        icon="🏠",
        color="#6a91ff",
        cost=normalise_mapping({}),
        description="Provides shelter for villagers, increasing population capacity.",
        production={"villagers": 6.0},
        housing=6,
        efficiency_notes=["Receives +10% from nearby wells"],
        tier=0,
        workers=0,
    ),
    "well": VillageBuildingDefinition(
        id="well",
        name="Village Well",
        category="support",
        icon="⛲",
        color="#58a4d7",
        cost=normalise_mapping({}),
        description="Supplies fresh water that comforts nearby homes.",
        production={},
        efficiency_notes=["Houses next door gain +10% efficiency"],
        tier=0,
        workers=1,
    ),
}

CATEGORY_ORDER: Tuple[str, ...] = (
    "production",
    "housing",
    "storage",
    "transport",
    "support",
)


def _format_production_summary(production: Mapping[str, float]) -> Optional[str]:
    if not isinstance(production, Mapping):
        return None
    parts: List[str] = []
    for resource, amount in production.items():
        try:
            numeric = float(amount)
        except (TypeError, ValueError):
            continue
        if abs(numeric) < 1e-6:
            continue
        label = resource.replace("_", " ").title()
        parts.append(f"{numeric:g} {label}/min")
    if not parts:
        return None
    return ", ".join(parts)


@dataclass
class VillageBuilding:
    instance_id: str
    type_id: str
    level: int = 1

    def to_payload(self, definition: VillageBuildingDefinition) -> Dict[str, object]:
        return {
            "id": self.instance_id,
            "type": self.type_id,
            "level": self.level,
            "name": definition.name,
            "icon": definition.icon,
            "color": definition.color,
            "category": definition.category,
            "description": definition.description,
        }


@dataclass
class VillageCell:
    terrain: str
    building: Optional[VillageBuilding] = None
    efficiency: float = 1.0
    efficiency_base: float = 1.0
    efficiency_bonus: float = 0.0
    transport_bonus: float = 0.0
    notes: List[str] = field(default_factory=list)
    inputs: Dict[str, Dict[str, object]] = field(default_factory=dict)
    outputs: Dict[str, float] = field(default_factory=dict)
    status: str = "idle"
    supply_ratio: float = 1.0
    distance_penalty: float = 1.0
    workers_required: int = 0
    transport_multiplier: float = 1.0

    def reset_effects(self) -> None:
        self.efficiency = 1.0
        self.efficiency_base = 1.0
        self.efficiency_bonus = 0.0
        self.transport_bonus = 0.0
        self.notes = []
        self.inputs = {}
        self.outputs = {}
        self.status = "idle"
        self.supply_ratio = 1.0
        self.distance_penalty = 1.0
        self.workers_required = 0
        self.transport_multiplier = 1.0


class VillagePlacementError(Exception):
    """Raised when the player attempts an invalid placement."""


class VillageDesignState:
    """Manage the fixed 5x5 village design grid."""

    def __init__(self) -> None:
        self.size = VILLAGE_SIZE
        self._next_id = 1
        self._grid: List[List[VillageCell]] = []
        self._resource_flow: Dict[str, object] = {"nodes": [], "links": []}
        self._supply_overview: Dict[str, object] = {
            "buildings": [],
            "totals": {"production": {}, "consumption": {}},
        }
        self.reset()

    # ------------------------------------------------------------------
    def reset(self) -> None:
        self._grid = [
            [VillageCell(terrain=DEFAULT_TERRAIN_LAYOUT[y][x]) for x in range(self.size)]
            for y in range(self.size)
        ]
        self._next_id = 1
        self._resource_flow = {"nodes": [], "links": []}
        self._supply_overview = {
            "buildings": [],
            "totals": {"production": {}, "consumption": {}},
        }
        self.recompute_effects()

    # ------------------------------------------------------------------
    def _cell(self, x: int, y: int) -> VillageCell:
        if not (0 <= x < self.size and 0 <= y < self.size):
            raise VillagePlacementError("Target location is outside the village bounds")
        return self._grid[y][x]

    def place_building(
        self, x: int, y: int, building_type: str
    ) -> Tuple[VillageBuilding, Dict[str, object]]:
        definition = BUILDING_DEFINITIONS.get(building_type)
        if definition is None:
            raise VillagePlacementError("Unknown building type")
        cell = self._cell(x, y)
        if cell.building is not None:
            raise VillagePlacementError("Cell already contains a structure")
        instance = VillageBuilding(instance_id=f"b{self._next_id}", type_id=definition.id)
        self._next_id += 1
        cell.building = instance
        effects = self.recompute_effects()
        return instance, effects

    def demolish_building(
        self, x: int, y: int
    ) -> Tuple[VillageBuilding, Dict[str, object]]:
        cell = self._cell(x, y)
        if cell.building is None:
            raise VillagePlacementError("There is no building to demolish")
        building = cell.building
        cell.building = None
        effects = self.recompute_effects()
        return building, effects

    def upgrade_building(
        self, x: int, y: int
    ) -> Tuple[VillageBuilding, Dict[str, object]]:
        cell = self._cell(x, y)
        if cell.building is None:
            raise VillagePlacementError("There is no building to upgrade")
        if cell.building.level >= 5:
            raise VillagePlacementError("Building already at max level")
        cell.building.level = min(5, cell.building.level + 1)
        effects = self.recompute_effects()
        return cell.building, effects

    # ------------------------------------------------------------------
    def _neighbors(self, x: int, y: int) -> Iterable[Tuple[int, int]]:
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = x + dx, y + dy
                if 0 <= nx < self.size and 0 <= ny < self.size:
                    yield nx, ny

    def recompute_effects(self) -> Dict[str, object]:
        for row in self._grid:
            for cell in row:
                cell.reset_effects()

        def distance_penalty(distance: int) -> float:
            if distance <= 1:
                return 1.0
            return max(0.35, 1.0 / (1.0 + 0.25 * (distance - 1)))

        total_housing = 0
        logistic_emitters: List[Tuple[int, int, float, int]] = []
        wells: List[Tuple[int, int]] = []
        building_entries: List[Dict[str, object]] = []

        for y, row in enumerate(self._grid):
            for x, cell in enumerate(row):
                if not cell.building:
                    continue
                definition = BUILDING_DEFINITIONS[cell.building.type_id]
                level = max(1, int(cell.building.level))
                level_bonus = 1.0 + 0.1 * (level - 1)
                base_efficiency = float(definition.base_efficiency or 1.0) * level_bonus
                cell.efficiency_base = base_efficiency
                cell.efficiency = base_efficiency
                cell.workers_required = definition.workers
                terrain = cell.terrain

                production_summary = _format_production_summary(definition.production)
                if production_summary:
                    cell.notes.append(f"Base production: {production_summary}")
                if definition.inputs:
                    inputs_summary = ", ".join(
                        f"{amount:g} {resource.replace('_', ' ')}"
                        for resource, amount in definition.inputs.items()
                    )
                    cell.notes.append(f"Requires: {inputs_summary}")

                if definition.id == "woodcutter_camp":
                    if any(self._grid[ny][nx].terrain == "forest" for nx, ny in self._neighbors(x, y)):
                        cell.efficiency *= 1.25
                        cell.notes.append("Adjacent forest +25%")
                elif definition.id == "stone_quarry":
                    if terrain == "hill" or any(
                        self._grid[ny][nx].terrain == "hill" for nx, ny in self._neighbors(x, y)
                    ):
                        cell.efficiency *= 1.15
                        cell.notes.append("Hill proximity +15%")
                elif definition.id == "gold_panner":
                    if terrain == "water" or any(
                        self._grid[ny][nx].terrain == "water" for nx, ny in self._neighbors(x, y)
                    ):
                        cell.efficiency *= 1.15
                        cell.notes.append("River bonus +15%")
                elif definition.id == "house":
                    total_housing += definition.housing
                    if definition.housing:
                        cell.notes.append(f"Housing capacity +{definition.housing}")
                elif definition.id == "well":
                    wells.append((x, y))

                if definition.transport_bonus:
                    radius = max(0, int(definition.logistics_radius or 0))
                    logistic_emitters.append((x, y, definition.transport_bonus, radius))
                    bonus_pct = int(round(definition.transport_bonus * 100))
                    if radius:
                        cell.notes.append(f"Logistics aura radius {radius} (+{bonus_pct}%)")
                    else:
                        cell.notes.append(f"Self logistics +{bonus_pct}%")

                building_entries.append({"x": x, "y": y, "cell": cell, "definition": definition})

        for x, y in wells:
            for nx, ny in self._neighbors(x, y):
                cell = self._grid[ny][nx]
                if cell.building and cell.building.type_id == "house":
                    cell.efficiency *= 1.1
                    cell.notes.append("Well nearby +10%")

        for x, y, bonus, radius in logistic_emitters:
            for ny in range(max(0, y - radius), min(self.size, y + radius + 1)):
                for nx in range(max(0, x - radius), min(self.size, x + radius + 1)):
                    cell = self._grid[ny][nx]
                    if not cell.building:
                        continue
                    cell.transport_bonus += bonus

        producers_by_resource: Dict[str, List[Dict[str, object]]] = defaultdict(list)
        flow_nodes: List[Dict[str, object]] = []
        flow_links: List[Dict[str, object]] = []
        total_production: Dict[str, float] = defaultdict(float)
        total_consumption: Dict[str, float] = defaultdict(float)
        supply_report: List[Dict[str, object]] = []

        building_entries.sort(key=lambda entry: entry["definition"].tier)

        for entry in building_entries:
            x = entry["x"]
            y = entry["y"]
            cell = entry["cell"]
            definition = entry["definition"]

            base_multiplier = cell.efficiency
            logistic_multiplier = 1.0 + cell.transport_bonus
            cell.transport_multiplier = logistic_multiplier
            if logistic_multiplier > 1.0005:
                bonus_pct = int(round((logistic_multiplier - 1.0) * 100))
                cell.notes.append(f"Logistics bonus +{bonus_pct}%")

            distance_factor = 1.0
            supply_ratio = 1.0
            inputs_detail: Dict[str, Dict[str, object]] = {}
            link_records: List[Dict[str, object]] = []

            if definition.inputs:
                for resource, required in definition.inputs.items():
                    providers = producers_by_resource.get(resource, [])
                    if not providers:
                        supply_ratio = 0.0
                        inputs_detail[resource] = {
                            "required": round(float(required), 2),
                            "available": 0.0,
                            "ratio": 0.0,
                            "status": "missing",
                            "distance": None,
                            "provider": None,
                            "penalty": 0.0,
                            "actual_rate": 0.0,
                        }
                        cell.notes.append(
                            f"No supply for {resource.replace('_', ' ').title()}"
                        )
                        link_records.append(
                            {
                                "from": None,
                                "resource": resource,
                                "distance": None,
                                "ratio": 0.0,
                            }
                        )
                        continue
                    total_available = sum(
                        float(provider.get("rate", 0.0)) for provider in providers
                    )
                    best_provider = min(
                        providers,
                        key=lambda provider: abs(int(provider["x"]) - x)
                        + abs(int(provider["y"]) - y),
                    )
                    distance = abs(int(best_provider["x"]) - x) + abs(int(best_provider["y"]) - y)
                    penalty = distance_penalty(distance)
                    distance_factor *= penalty
                    ratio = 1.0
                    if required > 0:
                        ratio = min(1.0, total_available / float(required)) if total_available else 0.0
                    supply_ratio = min(supply_ratio, ratio)
                    status = "ok"
                    if ratio <= 0:
                        status = "missing"
                    elif ratio < 0.999:
                        status = "limited"
                        limited_pct = int(round(ratio * 100))
                        cell.notes.append(
                            f"Limited {resource.replace('_', ' ').title()} supply ({limited_pct}%)"
                        )
                    if penalty < 0.999:
                        penalty_pct = int(round((1.0 - penalty) * 100))
                        cell.notes.append(
                            f"Distance penalty −{penalty_pct}% ({resource.replace('_', ' ').title()})"
                        )
                    inputs_detail[resource] = {
                        "required": round(float(required), 2),
                        "available": round(float(total_available), 2),
                        "ratio": round(float(ratio), 3),
                        "status": status,
                        "distance": distance,
                        "provider": best_provider["id"],
                        "penalty": round(penalty, 3),
                        "actual_rate": 0.0,
                    }
                    link_records.append(
                        {
                            "from": best_provider["id"],
                            "resource": resource,
                            "distance": distance,
                            "ratio": round(float(ratio), 3),
                        }
                    )

            if definition.inputs:
                if supply_ratio <= 0:
                    cell.status = "inactive"
                elif supply_ratio < 0.999:
                    cell.status = "bottleneck"
                else:
                    cell.status = "operational"
            else:
                cell.status = "operational"

            cell.distance_penalty = distance_factor
            cell.supply_ratio = supply_ratio
            final_efficiency = base_multiplier * logistic_multiplier * distance_factor * supply_ratio
            cell.efficiency = final_efficiency
            for resource, detail in inputs_detail.items():
                required = float(definition.inputs.get(resource, 0.0))
                detail["actual_rate"] = round(required * final_efficiency, 2)

            outputs: Dict[str, float] = {}
            for resource, amount in definition.production.items():
                produced = float(amount) * final_efficiency
                outputs[resource] = round(produced, 2)
                total_production[resource] += produced
            cell.outputs = outputs

            for resource, amount in definition.inputs.items():
                consumed = float(amount) * final_efficiency
                total_consumption[resource] += consumed

            cell.inputs = inputs_detail
            if cell.efficiency_base:
                cell.efficiency_bonus = cell.efficiency / cell.efficiency_base - 1.0
            else:
                cell.efficiency_bonus = 0.0
            summary = f"Effective efficiency {int(round(cell.efficiency * 100))}%"
            if summary not in cell.notes:
                cell.notes.append(summary)

            building = cell.building
            flow_nodes.append(
                {
                    "id": building.instance_id,
                    "type": building.type_id,
                    "name": definition.name,
                    "icon": definition.icon,
                    "category": definition.category,
                    "position": {"x": x, "y": y},
                    "level": building.level,
                    "status": cell.status,
                    "efficiency": round(cell.efficiency, 3),
                    "inputs": inputs_detail,
                    "outputs": outputs,
                }
            )

            for link in link_records:
                link_payload = dict(link)
                link_payload["to"] = building.instance_id
                required = float(definition.inputs.get(link_payload["resource"], 0.0))
                link_payload["rate"] = round(required * final_efficiency, 2)
                flow_links.append(link_payload)

            for resource, value in outputs.items():
                providers = producers_by_resource.setdefault(resource, [])
                providers.append(
                    {
                        "id": building.instance_id,
                        "x": x,
                        "y": y,
                        "rate": value,
                    }
                )

            supply_report.append(
                {
                    "id": building.instance_id,
                    "type": building.type_id,
                    "name": definition.name,
                    "category": definition.category,
                    "level": building.level,
                    "status": cell.status,
                    "efficiency": round(cell.efficiency, 3),
                    "inputs": inputs_detail,
                    "outputs": outputs,
                    "workers": definition.workers,
                }
            )

        production_totals = {
            resource: round(amount, 2) for resource, amount in total_production.items()
        }
        consumption_totals = {
            resource: round(amount, 2) for resource, amount in total_consumption.items()
        }

        self._resource_flow = {"nodes": flow_nodes, "links": flow_links}
        self._supply_overview = {
            "buildings": supply_report,
            "totals": {
                "production": production_totals,
                "consumption": consumption_totals,
            },
        }

        return {
            "housing": total_housing,
            "production": production_totals,
            "consumption": consumption_totals,
        }

    # ------------------------------------------------------------------
    def snapshot(self) -> Dict[str, object]:
        effects = self.recompute_effects()
        grid_payload: List[List[Dict[str, object]]] = []
        for y, row in enumerate(self._grid):
            row_payload: List[Dict[str, object]] = []
            for x, cell in enumerate(row):
                terrain_def = TERRAIN_TYPES.get(cell.terrain, TERRAIN_TYPES["plain"])
                cell_payload: Dict[str, object] = {
                    "x": x,
                    "y": y,
                    "terrain": {
                        "key": terrain_def.key,
                        "label": terrain_def.label,
                        "icon": terrain_def.icon,
                        "description": terrain_def.description,
                    },
                    "efficiency": round(cell.efficiency, 3),
                    "efficiency_base": round(cell.efficiency_base, 3),
                    "efficiency_bonus": round(cell.efficiency_bonus, 3),
                    "transport_bonus": round(cell.transport_bonus, 3),
                    "notes": list(cell.notes),
                }
                cell_payload["state"] = {
                    "empty": cell.building is None,
                    "building_id": cell.building.type_id if cell.building else None,
                    "terrain_type": terrain_def.key,
                    "efficiency_bonus": round(cell.efficiency_bonus, 3),
                    "efficiency_multiplier": round(cell.efficiency, 3),
                    "transport_bonus": round(cell.transport_bonus, 3),
                    "level": cell.building.level if cell.building else None,
                    "status": cell.status,
                    "supply_ratio": round(cell.supply_ratio, 3),
                    "distance_penalty": round(cell.distance_penalty, 3),
                }
                if cell.building:
                    definition = BUILDING_DEFINITIONS[cell.building.type_id]
                    production = {
                        key: round(value * cell.efficiency, 2)
                        for key, value in definition.production.items()
                    }
                    cell_payload["building"] = {
                        **cell.building.to_payload(definition),
                        "efficiency": round(cell.efficiency, 3),
                        "base_efficiency": round(cell.efficiency_base, 3),
                        "efficiency_bonus": round(cell.efficiency_bonus, 3),
                        "transport_bonus": round(cell.transport_bonus, 3),
                        "production_per_minute": production,
                        "base_production": definition.production,
                        "housing": definition.housing,
                        "efficiency_notes": definition.efficiency_notes,
                        "inputs": cell.inputs,
                        "outputs": cell.outputs,
                        "status": cell.status,
                        "supply_ratio": round(cell.supply_ratio, 3),
                        "distance_penalty": round(cell.distance_penalty, 3),
                        "transport_multiplier": round(cell.transport_multiplier, 3),
                        "workers_required": definition.workers,
                    }
                row_payload.append(cell_payload)
            grid_payload.append(row_payload)
        catalog = [
            BUILDING_DEFINITIONS[key].to_payload()
            for key in BUILDING_DEFINITIONS.keys()
        ]
        return {
            "size": self.size,
            "grid": grid_payload,
            "catalog": catalog,
            "effects": effects,
            "resource_flow": self._resource_flow,
            "supply_overview": self._supply_overview,
        }

    # ------------------------------------------------------------------
    def export_state(self) -> Dict[str, object]:
        return {
            "version": 1,
            "grid": [
                [
                    None
                    if cell.building is None
                    else {
                        "type": cell.building.type_id,
                        "level": cell.building.level,
                    }
                    for cell in row
                ]
                for row in self._grid
            ],
        }

    def load_state(self, payload: Dict[str, object]) -> None:
        if not payload:
            self.reset()
            return
        grid_data = payload.get("grid")
        if not isinstance(grid_data, list):
            self.reset()
            return
        self.reset()
        for y, row in enumerate(grid_data[: self.size]):
            if not isinstance(row, list):
                continue
            for x, entry in enumerate(row[: self.size]):
                if not entry:
                    continue
                type_id = entry.get("type") if isinstance(entry, dict) else None
                if not isinstance(type_id, str):
                    continue
                if type_id not in BUILDING_DEFINITIONS:
                    continue
                cell = self._grid[y][x]
                level = int(entry.get("level", 1)) if isinstance(entry, dict) else 1
                cell.building = VillageBuilding(
                    instance_id=f"b{self._next_id}", type_id=type_id, level=max(1, level)
                )
                self._next_id += 1
        self.recompute_effects()

    # ------------------------------------------------------------------
    def save_to_path(self, path: Path = DEFAULT_SAVE_PATH) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        data = self.export_state()
        import json

        with path.open("w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)

    def load_from_path(self, path: Path = DEFAULT_SAVE_PATH) -> None:
        if not path.exists():
            raise FileNotFoundError(path)
        import json

        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            raise ValueError("Invalid village design save file")
        self.load_state(data)


__all__ = [
    "BUILDING_DEFINITIONS",
    "CATEGORY_ORDER",
    "DEFAULT_SAVE_PATH",
    "TerrainDefinition",
    "TERRAIN_TYPES",
    "VillageBuildingDefinition",
    "VillageDesignState",
    "VillagePlacementError",
    "VILLAGE_SIZE",
]
