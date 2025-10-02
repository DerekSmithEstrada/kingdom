"""Centralised configuration for the management game backend."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Mapping, Optional, Tuple

from .resources import ALL_RESOURCES, Resource, normalise_mapping

# Building identifiers used across the backend.
WOODCUTTER_CAMP = "woodcutter_camp"
LUMBER_HUT = "lumber_hut"
MINER = "miner"
FARMER = "farmer"
ARTISAN = "artisan"

BUILDING_NAMES: Dict[str, str] = {
    WOODCUTTER_CAMP: "Woodcutter Camp",
    LUMBER_HUT: "Lumber Hut",
    MINER: "Miner",
    FARMER: "Farmer",
    ARTISAN: "Artisan Workshop",
}

COSTOS_CONSTRUCCION: Dict[str, Dict[Resource, float]] = {
    WOODCUTTER_CAMP: {Resource.WOOD: 12, Resource.STONE: 4},
    LUMBER_HUT: {Resource.WOOD: 25, Resource.STONE: 12},
    MINER: {Resource.WOOD: 18, Resource.STONE: 14},
    FARMER: {Resource.WOOD: 20, Resource.STONE: 15, Resource.SEEDS: 5},
    ARTISAN: {Resource.WOOD: 15, Resource.STONE: 20, Resource.PLANK: 4},
}

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
        max_workers=10,
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

WORKERS_INICIALES: int = 20

STARTING_RESOURCES: Dict[Resource, float] = {resource: 0.0 for resource in ALL_RESOURCES}

STARTING_BUILDINGS: Tuple[Mapping[str, object], ...] = (
    {"type": WOODCUTTER_CAMP, "workers": 0, "enabled": True},
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
