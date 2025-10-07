from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Optional, Tuple

from .resources import Resource, normalise_mapping


VILLAGE_SIZE = 5
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
    ("water", "water", "water", "plain", "plain"),
    ("water", "plain", "forest", "forest", "plain"),
    ("plain", "plain", "plain", "forest", "plain"),
    ("plain", "hill", "plain", "plain", "plain"),
    ("plain", "plain", "plain", "plain", "plain"),
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
    storage_radius: int = 0
    base_efficiency: float = 1.0

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
            "storage_radius": self.storage_radius,
            "base_efficiency": self.base_efficiency,
            "cost": {
                resource.value.lower(): float(amount)
                for resource, amount in self.cost.items()
            },
        }


BUILDING_DEFINITIONS: Dict[str, VillageBuildingDefinition] = {
    "farm": VillageBuildingDefinition(
        id="farm",
        name="Crop Farm",
        category="production",
        icon="🌾",
        color="#6fc47f",
        cost=normalise_mapping({Resource.WOOD: 12, Resource.STONE: 4}),
        description="Produces food for the village. Gains bonus yield when irrigated by water tiles.",
        production={"food": 6.0},
        efficiency_notes=["+20% when adjacent to water"],
    ),
    "woodcutter": VillageBuildingDefinition(
        id="woodcutter",
        name="Woodcutter Camp",
        category="production",
        icon="🪓",
        color="#8b5a2b",
        cost=normalise_mapping({Resource.WOOD: 6, Resource.STONE: 2}),
        description="Chops nearby trees into usable wood.",
        production={"wood": 8.0},
        efficiency_notes=["+25% when next to a forest"],
    ),
    "quarry": VillageBuildingDefinition(
        id="quarry",
        name="Stone Quarry",
        category="production",
        icon="⛏️",
        color="#7d7f86",
        cost=normalise_mapping({Resource.WOOD: 4, Resource.STONE: 10}),
        description="Extracts stone from nearby hills.",
        production={"stone": 5.0},
        efficiency_notes=["+15% when bordering a hill"],
    ),
    "house": VillageBuildingDefinition(
        id="house",
        name="Village House",
        category="housing",
        icon="🏠",
        color="#5f8bff",
        cost=normalise_mapping({Resource.WOOD: 8, Resource.STONE: 4, Resource.GOLD: 10}),
        description="Increases the population capacity of the settlement.",
        production={"villagers": 4.0},
        housing=4,
        efficiency_notes=["Adds +4 villagers to capacity"],
    ),
    "storage": VillageBuildingDefinition(
        id="storage",
        name="Warehouse",
        category="storage",
        icon="📦",
        color="#d9a441",
        cost=normalise_mapping({Resource.WOOD: 10, Resource.STONE: 6}),
        description="Reduces hauling time for nearby structures.",
        production={"logistics": 1.0},
        transport_bonus=0.2,
        storage_radius=1,
        efficiency_notes=["Provides +20% transport efficiency within 1 tile"],
    ),
    "road": VillageBuildingDefinition(
        id="road",
        name="Stone Road",
        category="transport",
        icon="🛣️",
        color="#9d9fa7",
        cost=normalise_mapping({Resource.STONE: 3}),
        description="Links buildings together to speed up deliveries.",
        production={"logistics": 1.0},
        transport_bonus=0.1,
        efficiency_notes=["+10% transport bonus for adjacent buildings"],
    ),
    "well": VillageBuildingDefinition(
        id="well",
        name="Village Well",
        category="production",
        icon="⛲",
        color="#58a4d7",
        cost=normalise_mapping({Resource.STONE: 6, Resource.WOOD: 4}),
        description="Provides fresh water improving nearby housing.",
        production={"support": 1.0},
        efficiency_notes=["Houses adjacent to a well gain +10% efficiency"],
    ),
}

CATEGORY_ORDER: Tuple[str, ...] = ("production", "housing", "transport", "storage")


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

    def reset_effects(self) -> None:
        self.efficiency = 1.0
        self.efficiency_base = 1.0
        self.efficiency_bonus = 0.0
        self.transport_bonus = 0.0
        self.notes = []


class VillagePlacementError(Exception):
    """Raised when the player attempts an invalid placement."""


class VillageDesignState:
    """Manage the fixed 5x5 village design grid."""

    def __init__(self) -> None:
        self.size = VILLAGE_SIZE
        self._next_id = 1
        self._grid: List[List[VillageCell]] = []
        self.reset()

    # ------------------------------------------------------------------
    def reset(self) -> None:
        self._grid = [
            [VillageCell(terrain=DEFAULT_TERRAIN_LAYOUT[y][x]) for x in range(self.size)]
            for y in range(self.size)
        ]
        self._next_id = 1
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

        total_housing = 0
        storage_tiles: List[Tuple[int, int, float, int]] = []
        road_tiles: List[Tuple[int, int, float]] = []
        wells: List[Tuple[int, int]] = []

        for y, row in enumerate(self._grid):
            for x, cell in enumerate(row):
                if not cell.building:
                    continue
                definition = BUILDING_DEFINITIONS[cell.building.type_id]
                cell.efficiency_base = float(definition.base_efficiency or 1.0)
                cell.efficiency = cell.efficiency_base
                cell.efficiency_bonus = 0.0
                cell.notes = []
                terrain = cell.terrain

                production_summary = _format_production_summary(definition.production)
                if production_summary:
                    cell.notes.append(f"Base production: {production_summary}")

                if definition.id == "farm":
                    if any(self._grid[ny][nx].terrain == "water" for nx, ny in self._neighbors(x, y)):
                        cell.efficiency *= 1.2
                        cell.notes.append("Irrigation bonus +20%")
                elif definition.id == "woodcutter":
                    if any(self._grid[ny][nx].terrain == "forest" for nx, ny in self._neighbors(x, y)):
                        cell.efficiency *= 1.25
                        cell.notes.append("Adjacent forest +25%")
                elif definition.id == "quarry":
                    if any(self._grid[ny][nx].terrain == "hill" for nx, ny in self._neighbors(x, y)) or terrain == "hill":
                        cell.efficiency *= 1.15
                        cell.notes.append("Hill proximity +15%")
                elif definition.id == "house":
                    total_housing += definition.housing
                    if definition.housing:
                        cell.notes.append(
                            f"Housing capacity +{definition.housing} villagers"
                        )
                elif definition.id == "storage":
                    radius = max(1, int(definition.storage_radius or 1))
                    storage_tiles.append((x, y, definition.transport_bonus, radius))
                    bonus_pct = int(round(definition.transport_bonus * 100))
                    cell.notes.append(
                        f"Logistics hub radius {radius} (+{bonus_pct}% transport)"
                    )
                elif definition.id == "road":
                    road_tiles.append((x, y, definition.transport_bonus))
                    bonus_pct = int(round(definition.transport_bonus * 100))
                    cell.notes.append(f"Road connection bonus +{bonus_pct}%")
                elif definition.id == "well":
                    wells.append((x, y))
                    cell.notes.append("Supports housing with +10% efficiency")


        # Apply transport bonuses
        for x, y, bonus, radius in storage_tiles:
            for ny in range(max(0, y - radius), min(self.size, y + radius + 1)):
                for nx in range(max(0, x - radius), min(self.size, x + radius + 1)):
                    cell = self._grid[ny][nx]
                    if cell.building and BUILDING_DEFINITIONS[cell.building.type_id].id != "storage":
                        cell.transport_bonus += bonus
                        bonus_pct = int(round(bonus * 100))
                        cell.notes.append(f"Storage support +{bonus_pct}%")

        for x, y, bonus in road_tiles:
            for nx, ny in self._neighbors(x, y):
                cell = self._grid[ny][nx]
                if cell.building and BUILDING_DEFINITIONS[cell.building.type_id].id not in {"road"}:
                    cell.transport_bonus += bonus
                    bonus_pct = int(round(bonus * 100))
                    cell.notes.append(f"Road connection +{bonus_pct}%")

        for x, y in wells:
            for nx, ny in self._neighbors(x, y):
                cell = self._grid[ny][nx]
                if cell.building and cell.building.type_id == "house":
                    cell.efficiency *= 1.1
                    cell.notes.append("Well nearby +10%")

        for row in self._grid:
            for cell in row:
                if not cell.building:
                    cell.efficiency_bonus = 0.0
                    continue
                if cell.efficiency_base:
                    cell.efficiency_bonus = cell.efficiency / cell.efficiency_base - 1.0
                else:
                    cell.efficiency_bonus = 0.0
                summary = f"Current efficiency {int(round(cell.efficiency * 100))}%"
                if summary not in cell.notes:
                    cell.notes.append(summary)
                if abs(cell.transport_bonus) > 1e-6:
                    bonus_pct = int(round(cell.transport_bonus * 100))
                    summary = f"Transport bonus +{bonus_pct}%"
                    if summary not in cell.notes:
                        cell.notes.append(summary)

        return {"housing": total_housing}

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
