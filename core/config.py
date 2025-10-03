"""Centralised configuration for the management game backend."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Mapping, Optional, Tuple

from .resources import ALL_RESOURCES, Resource, normalise_mapping

# ---------------------------------------------------------------------------
# Building identifiers and normalisation helpers

WOODCUTTER_CAMP = "woodcutter_camp"
LUMBER_HUT = "lumber_hut"
MINER = "miner"
FARMER = "farmer"
ARTISAN = "artisan"

BUILDING_PUBLIC_IDS: Dict[str, str] = {
    WOODCUTTER_CAMP: "woodcutter_camp",
    LUMBER_HUT: "lumber_hut",
    MINER: "miner",
    FARMER: "farmer",
    ARTISAN: "artisan",
}

_BUILDING_ID_LOOKUP: Dict[str, str] = {
    public_id: type_key for type_key, public_id in BUILDING_PUBLIC_IDS.items()
}


def normalise_building_key(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("El identificador de edificio debe ser una cadena")
    key = value.strip().lower().replace("-", "_")
    if not key:
        raise ValueError("El identificador de edificio está vacío")
    return key


def resolve_building_type(value: str) -> str:
    key = normalise_building_key(value)
    if key in BUILDING_PUBLIC_IDS:
        return key
    mapped = _BUILDING_ID_LOOKUP.get(key)
    if mapped:
        return mapped
    raise ValueError(f"Identificador de edificio desconocido: {value}")


def resolve_building_public_id(value: str) -> str:
    type_key = resolve_building_type(value)
    return BUILDING_PUBLIC_IDS[type_key]

# ---------------------------------------------------------------------------
# Building metadata

BUILDING_NAMES: Dict[str, str] = {
    WOODCUTTER_CAMP: "Woodcutter Camp",
    LUMBER_HUT: "Lumber Hut",
    MINER: "Miner",
    FARMER: "Farmer",
    ARTISAN: "Artisan Workshop",
}

BUILD_COSTS: Dict[str, Dict[Resource, float]] = {
    WOODCUTTER_CAMP: {Resource.WOOD: 1},
    LUMBER_HUT: {},
    MINER: {},
    FARMER: {},
    ARTISAN: {},
}

# Backwards compatibility alias for legacy references.
COSTOS_CONSTRUCCION: Dict[str, Dict[Resource, float]] = BUILD_COSTS

@dataclass(frozen=True)
class BuildingRecipe:
    """Structure describing how a building converts resources each cycle."""

    inputs: Mapping[Resource, float]
    outputs: Mapping[Resource, float]
    cycle_time: float
    max_workers: int
    capacity: Optional[Mapping[Resource, float]] = None
    maintenance: Mapping[Resource, float] = field(default_factory=dict)
    per_worker_output_rate: Optional[Mapping[Resource, float]] = None


def _recipe(
    *,
    inputs: Mapping[Resource, float] | None,
    outputs: Mapping[Resource, float],
    cycle_time: float,
    max_workers: int,
    capacity: Mapping[Resource, float] | None = None,
    maintenance: Mapping[Resource, float] | None = None,
    per_worker_output_rate: Mapping[Resource, float] | None = None,
) -> BuildingRecipe:
    return BuildingRecipe(
        inputs=normalise_mapping(inputs or {}),
        outputs=normalise_mapping(outputs),
        cycle_time=float(cycle_time),
        max_workers=int(max_workers),
        capacity=None if capacity is None else normalise_mapping(capacity),
        maintenance=normalise_mapping(maintenance or {}),
        per_worker_output_rate=None
        if per_worker_output_rate is None
        else normalise_mapping(per_worker_output_rate),
    )


BUILDING_RECIPES: Dict[str, BuildingRecipe] = {
    WOODCUTTER_CAMP: _recipe(
        # Extractive: 0.1 Wood per worker per second without inputs.
        inputs={},
        outputs={Resource.WOOD: 0.1},
        cycle_time=1.0,
        max_workers=2,
        maintenance={},
        per_worker_output_rate={Resource.WOOD: 0.1},
    ),
    LUMBER_HUT: _recipe(
        # 2 Wood -> 1 Plank per 4s cycle; halved throughput if input missing.
        inputs={Resource.WOOD: 2},
        outputs={Resource.PLANK: 1},
        cycle_time=4.0,
        max_workers=2,
        maintenance={Resource.GOLD: 0.006666666666666667},
    ),
    MINER: _recipe(
        # 0 input -> 1 Stone + 0.2 Ore per 5s cycle.
        inputs={},
        outputs={Resource.STONE: 1, Resource.ORE: 0.2},
        cycle_time=5.0,
        max_workers=3,
        maintenance={Resource.GOLD: 0.016666666666666666},
    ),
    FARMER: _recipe(
        # 1 Seed -> 3 Grain per 8s cycle after sowing.
        inputs={Resource.SEEDS: 1},
        outputs={Resource.GRAIN: 3},
        cycle_time=8.0,
        max_workers=3,
        maintenance={Resource.GOLD: 0.0125},
    ),
    ARTISAN: _recipe(
        # 1 Plank + 1 Stone -> 1 Tool per 6s cycle; stalls if any input missing.
        inputs={Resource.PLANK: 1, Resource.STONE: 1},
        outputs={Resource.TOOLS: 1},
        cycle_time=6.0,
        max_workers=2,
        maintenance={Resource.GOLD: 0.01},
    ),
}

TRADE_DEFAULTS: Dict[Resource, Dict[str, float | str]] = {
    Resource.WOOD: {"mode": "pause", "rate": 0.0, "price": 1.0},
    Resource.STONE: {"mode": "pause", "rate": 0.0, "price": 1.5},
    Resource.ORE: {"mode": "pause", "rate": 0.0, "price": 2.5},
    Resource.GRAIN: {"mode": "pause", "rate": 0.0, "price": 2.0},
    Resource.PLANK: {"mode": "pause", "rate": 0.0, "price": 3.0},
    Resource.TOOLS: {"mode": "pause", "rate": 0.0, "price": 6.0},
    Resource.SEEDS: {"mode": "pause", "rate": 0.0, "price": 1.8},
    Resource.WATER: {"mode": "pause", "rate": 0.0, "price": 0.5},
    Resource.GOLD: {"mode": "pause", "rate": 0.0, "price": 1.0},
    Resource.HOPS: {"mode": "pause", "rate": 0.0, "price": 2.5},
}

CAPACIDADES: Dict[Resource, float] = {
    Resource.WOOD: 500,
    Resource.STONE: 500,
    Resource.ORE: 200,
    Resource.GRAIN: 400,
    Resource.PLANK: 250,
    Resource.TOOLS: 150,
    Resource.SEEDS: 150,
    Resource.WATER: 400,
    Resource.GOLD: 1000,
    Resource.HOPS: 200,
}

# Population configuration
POPULATION_INITIAL: int = 2
POPULATION_CAPACITY: int = 20

WORKERS_INICIALES: int = POPULATION_INITIAL

STARTING_RESOURCES: Dict[Resource, float] = {resource: 0.0 for resource in ALL_RESOURCES}

STARTING_BUILDINGS: Tuple[Mapping[str, object], ...] = (
    {
        "type": WOODCUTTER_CAMP,
        "workers": 1,
        "built": True,
        "enabled": True,
    },
)

SEASON_MODIFIERS: Dict[str, Dict[str, float]] = {
    "Spring": {
        "global": 1.0,
        FARMER: 1.1,
    },
    "Summer": {
        "global": 1.0,
        FARMER: 1.2,
        MINER: 0.9,
    },
    "Autumn": {
        "global": 1.0,
        ARTISAN: 1.15,
        MINER: 1.05,
    },
    "Winter": {
        "global": 1.0,
        FARMER: 0.7,
        WOODCUTTER_CAMP: 1.1,
        LUMBER_HUT: 1.1,
        MINER: 1.05,
    },
}

NOTIFICATION_QUEUE_LIMIT = 50
