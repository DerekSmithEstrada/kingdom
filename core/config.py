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
STICK_GATHERING_TENT = "stick_gathering_tent"
STONE_GATHERING_TENT = "stone_gathering_tent"

BUILDING_PUBLIC_IDS: Dict[str, str] = {
    WOODCUTTER_CAMP: "woodcutter_camp",
    LUMBER_HUT: "lumber_hut",
    MINER: "miner",
    FARMER: "farmer",
    ARTISAN: "artisan",
    STICK_GATHERING_TENT: "stick_gathering_tent",
    STONE_GATHERING_TENT: "stone_gathering_tent",
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
    STICK_GATHERING_TENT: "Stick-gathering Tent",
    STONE_GATHERING_TENT: "Stone-gathering Tent",
}

BUILD_COSTS: Dict[str, Dict[Resource, float]] = {
    WOODCUTTER_CAMP: {
        Resource.WOOD: 10,
        Resource.GOLD: 5,
    },
    STICK_GATHERING_TENT: {Resource.GOLD: 1},
    STONE_GATHERING_TENT: {Resource.GOLD: 2},
    LUMBER_HUT: {},
    MINER: {},
    FARMER: {},
    ARTISAN: {},
}


@dataclass(frozen=True)
class BuildingMetadata:
    """UI-centric metadata for building presentation."""

    category: str
    icon: str
    category_label: str | None = None
    job: Optional[str] = None
    job_name: Optional[str] = None
    job_icon: Optional[str] = None
    build_label: Optional[str] = None
    role: Optional[str] = None
    level: Optional[int] = None


BUILDING_METADATA: Dict[str, BuildingMetadata] = {
    WOODCUTTER_CAMP: BuildingMetadata(
        category="wood",
        category_label="Wood",
        icon="🪓",
        job="forester",
        job_name="Forester",
        job_icon="🌲",
        build_label="Woodcutter Camp",
        role="wood_producer",
        level=2,
    ),
    STICK_GATHERING_TENT: BuildingMetadata(
        category="wood",
        category_label="Wood",
        icon="🥢",
        job="stick_gatherer",
        job_name="Stick Gatherer",
        job_icon="🥢",
        build_label="Stick-gathering Tent",
        role="stick_gatherer",
        level=1,
    ),
    STONE_GATHERING_TENT: BuildingMetadata(
        category="stone",
        category_label="Stone",
        icon="🪨",
        job="stone_gatherer",
        job_name="Stone Gatherer",
        job_icon="🪨",
        build_label="Stone-gathering Tent",
        role="stone_producer",
        level=1,
    ),
    LUMBER_HUT: BuildingMetadata(
        category="wood",
        category_label="Wood",
        icon="🏚️",
        job="artisan",
        job_name="Artisan",
        job_icon="🛠️",
        build_label="Lumber Hut",
        role="plank_crafter",
        level=3,
    ),
    MINER: BuildingMetadata(
        category="stone",
        category_label="Stone",
        icon="⛏️",
        job="miner",
        job_name="Miner",
        job_icon="⛏️",
        build_label="Miner",
        role="stone_producer",
        level=3,
    ),
    FARMER: BuildingMetadata(
        category="crops",
        category_label="Crops",
        icon="🌾",
        job="farmer",
        job_name="Farmer",
        job_icon="🌾",
        build_label="Farmer",
        role="grain_producer",
        level=2,
    ),
    ARTISAN: BuildingMetadata(
        category="crops",
        category_label="Crops",
        icon="🛠️",
        job="artisan",
        job_name="Artisan",
        job_icon="🛠️",
        build_label="Artisan Workshop",
        role="toolmaker",
        level=4,
    ),
}


def get_building_metadata(type_key: str) -> BuildingMetadata:
    """Return the metadata for ``type_key`` with sensible defaults."""

    meta = BUILDING_METADATA.get(type_key)
    if meta is not None:
        return meta
    name = BUILDING_NAMES.get(type_key, type_key.title())
    return BuildingMetadata(
        category="general",
        category_label="General",
        icon="🏗️",
        job=None,
        job_name=None,
        job_icon=None,
        build_label=name,
    )

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
    per_worker_input_rate: Optional[Mapping[Resource, float]] = None


def _recipe(
    *,
    inputs: Mapping[Resource, float] | None,
    outputs: Mapping[Resource, float],
    cycle_time: float,
    max_workers: int,
    capacity: Mapping[Resource, float] | None = None,
    maintenance: Mapping[Resource, float] | None = None,
    per_worker_output_rate: Mapping[Resource, float] | None = None,
    per_worker_input_rate: Mapping[Resource, float] | None = None,
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
        per_worker_input_rate=None
        if per_worker_input_rate is None
        else normalise_mapping(per_worker_input_rate),
    )


BUILDING_RECIPES: Dict[str, BuildingRecipe] = {
    WOODCUTTER_CAMP: _recipe(
        inputs={},
        outputs={},
        cycle_time=1.0,
        max_workers=2,
        maintenance={},
        per_worker_output_rate={Resource.WOOD: 0.01},
        per_worker_input_rate={
            Resource.STICKS: 0.04,
            Resource.STONE: 0.04,
        },
        capacity={Resource.WOOD: 30},
    ),
    STICK_GATHERING_TENT: _recipe(
        inputs={},
        outputs={},
        cycle_time=1.0,
        max_workers=3,
        maintenance={},
        per_worker_output_rate={Resource.STICKS: 0.01},
        capacity={Resource.STICKS: 30},
    ),
    STONE_GATHERING_TENT: _recipe(
        inputs={},
        outputs={},
        cycle_time=1.0,
        max_workers=3,
        maintenance={},
        per_worker_output_rate={Resource.STONE: 0.01},
        capacity={Resource.STONE: 30},
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
    Resource.STICKS: {"mode": "pause", "rate": 0.0, "price": 0.5},
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
    Resource.STICKS: 500,
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
POPULATION_INITIAL: int = 4
POPULATION_CAPACITY: int = 20

WORKERS_INICIALES: int = POPULATION_INITIAL

STARTING_RESOURCES: Dict[Resource, float] = {
    resource: 0.0 for resource in ALL_RESOURCES
}
STARTING_RESOURCES[Resource.GOLD] = 10.0

STARTING_BUILDINGS: Tuple[Mapping[str, object], ...] = (
    {
        "type": WOODCUTTER_CAMP,
        "workers": 0,
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
