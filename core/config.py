"""Centralised configuration for the management game backend."""
from __future__ import annotations

from typing import Dict

from .resources import Resource

# Building identifiers used across the backend.
WOODCUTTER_CAMP = "woodcutter_camp"
LUMBER_HUT = "lumber_hut"
STONE_QUARRY = "stone_quarry"
WHEAT_FARM = "wheat_farm"
BREWERY = "brewery"

BUILDING_NAMES: Dict[str, str] = {
    WOODCUTTER_CAMP: "Woodcutter Camp",
    LUMBER_HUT: "Lumber Hut",
    STONE_QUARRY: "Stone Quarry",
    WHEAT_FARM: "Wheat Farm",
    BREWERY: "Brewery",
}

COSTOS_CONSTRUCCION: Dict[str, Dict[Resource, float]] = {
    WOODCUTTER_CAMP: {Resource.WOOD: 10, Resource.STONE: 5},
    LUMBER_HUT: {Resource.WOOD: 25, Resource.STONE: 10},
    STONE_QUARRY: {Resource.WOOD: 15, Resource.STONE: 10},
    WHEAT_FARM: {Resource.WOOD: 20, Resource.STONE: 15, Resource.WATER: 10},
    BREWERY: {Resource.WOOD: 30, Resource.STONE: 20, Resource.GRAIN: 10},
}

RECETAS: Dict[str, Dict[str, Dict[Resource, float] | float | int]] = {
    WOODCUTTER_CAMP: {
        "inputs": {},
        "outputs": {Resource.WOOD: 1},
        "cycle_time": 3.0,
        "max_workers": 3,
        "maintenance_per_min": {Resource.GOLD: 0.1},
    },
    LUMBER_HUT: {
        "inputs": {Resource.WOOD: 2},
        "outputs": {Resource.WOOD: 3},
        "cycle_time": 4.0,
        "max_workers": 2,
        "maintenance_per_min": {Resource.GOLD: 0.1},
    },
    STONE_QUARRY: {
        "inputs": {},
        "outputs": {Resource.STONE: 1},
        "cycle_time": 5.0,
        "max_workers": 3,
        "maintenance_per_min": {Resource.GOLD: 0.2},
    },
    WHEAT_FARM: {
        "inputs": {Resource.WATER: 1},
        "outputs": {Resource.GRAIN: 2},
        "cycle_time": 5.0,
        "max_workers": 3,
        "maintenance_per_min": {Resource.GOLD: 0.15},
    },
    BREWERY: {
        "inputs": {Resource.GRAIN: 2, Resource.HOPS: 1, Resource.WATER: 1},
        "outputs": {Resource.GOLD: 3},
        "cycle_time": 6.0,
        "max_workers": 2,
        "maintenance_per_min": {Resource.GOLD: 0.1},
    },
}

TRADE_DEFAULTS: Dict[Resource, Dict[str, float | str]] = {
    Resource.WOOD: {"mode": "pause", "rate": 0.0, "price": 1.0},
    Resource.STONE: {"mode": "pause", "rate": 0.0, "price": 1.5},
    Resource.GRAIN: {"mode": "pause", "rate": 0.0, "price": 2.0},
    Resource.WATER: {"mode": "pause", "rate": 0.0, "price": 0.5},
    Resource.GOLD: {"mode": "pause", "rate": 0.0, "price": 1.0},
    Resource.HOPS: {"mode": "pause", "rate": 0.0, "price": 2.5},
}

CAPACIDADES: Dict[Resource, float] = {
    Resource.WOOD: 500,
    Resource.STONE: 500,
    Resource.GRAIN: 400,
    Resource.WATER: 400,
    Resource.GOLD: 1000,
    Resource.HOPS: 200,
}

WORKERS_INICIALES: int = 20

STARTING_RESOURCES: Dict[Resource, float] = {
    Resource.WOOD: 50,
    Resource.STONE: 30,
    Resource.GRAIN: 20,
    Resource.WATER: 40,
    Resource.GOLD: 100,
    Resource.HOPS: 10,
}

SEASON_MODIFIERS: Dict[str, Dict[str, float]] = {
    "primavera": {"global": 1.0, WHEAT_FARM: 1.05},
    "verano": {"global": 1.0, WHEAT_FARM: 1.1},
    "otoño": {"global": 1.0, BREWERY: 1.05},
    "invierno": {"global": 0.95},
}

NOTIFICATION_QUEUE_LIMIT = 50
