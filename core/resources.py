"""Resource definitions for the kingdom management backend."""
from __future__ import annotations

from enum import Enum
from typing import Dict, Iterable, List, Mapping


class Resource(str, Enum):
    """Enumeration of all resource keys used in the game."""

    WOOD = "WOOD"
    STICKS = "STICKS"
    STONE = "STONE"
    POLISHED_STONE = "POLISHED_STONE"
    GRAIN = "GRAIN"
    WHEAT = "WHEAT"
    FLOUR = "FLOUR"
    BREAD = "BREAD"
    BERRIES = "BERRIES"
    FISH = "FISH"
    BOAR_MEAT = "BOAR_MEAT"
    MILK = "MILK"
    CHEESE = "CHEESE"
    HOPS = "HOPS"
    BEER = "BEER"
    HONEY = "HONEY"
    HERBS = "HERBS"
    GRAPES = "GRAPES"
    WINE = "WINE"
    PLANK = "PLANK"
    TOOLS = "TOOLS"
    BARRELS = "BARRELS"
    CANDLES = "CANDLES"
    CLOTH = "CLOTH"
    CLOTHES = "CLOTHES"
    WAX = "WAX"
    WOOL = "WOOL"
    ORE = "ORE"
    IRON_ORE = "IRON_ORE"
    GOLD_ORE = "GOLD_ORE"
    QUARTZ = "QUARTZ"
    IRON = "IRON"
    GOLD = "GOLD"
    COAL = "COAL"
    GLASS = "GLASS"
    JEWELRY = "JEWELRY"
    GEMS = "GEMS"
    WEAPONS = "WEAPONS"
    SOLDIER = "SOLDIER"
    ARCHER = "ARCHER"
    WATER = "WATER"
    SEEDS = "SEEDS"
    HAPPINESS = "HAPPINESS"


ALL_RESOURCES: List[Resource] = [
    Resource.WOOD,
    Resource.STICKS,
    Resource.STONE,
    Resource.POLISHED_STONE,
    Resource.GRAIN,
    Resource.WHEAT,
    Resource.FLOUR,
    Resource.BREAD,
    Resource.BERRIES,
    Resource.FISH,
    Resource.BOAR_MEAT,
    Resource.MILK,
    Resource.CHEESE,
    Resource.HOPS,
    Resource.BEER,
    Resource.HONEY,
    Resource.HERBS,
    Resource.GRAPES,
    Resource.WINE,
    Resource.PLANK,
    Resource.TOOLS,
    Resource.BARRELS,
    Resource.CANDLES,
    Resource.CLOTH,
    Resource.CLOTHES,
    Resource.WAX,
    Resource.WOOL,
    Resource.ORE,
    Resource.IRON_ORE,
    Resource.GOLD_ORE,
    Resource.QUARTZ,
    Resource.IRON,
    Resource.GOLD,
    Resource.COAL,
    Resource.GLASS,
    Resource.JEWELRY,
    Resource.GEMS,
    Resource.WEAPONS,
    Resource.SOLDIER,
    Resource.ARCHER,
    Resource.WATER,
    Resource.SEEDS,
    Resource.HAPPINESS,
]


_RESOURCE_BY_ID: Dict[str, Resource] = {resource.value: resource for resource in ALL_RESOURCES}
_RESOURCE_BY_NAME: Dict[str, Resource] = {
    resource.name: resource for resource in ALL_RESOURCES
}
_RESOURCE_LOOKUP: Dict[str, Resource] = {
    key.lower(): resource for mapping in (_RESOURCE_BY_ID, _RESOURCE_BY_NAME)
    for key, resource in mapping.items()
}


def resource_from_id(identifier: str) -> Resource:
    """Return the resource associated with ``identifier``.

    The lookup accepts the canonical identifier (``Resource.value``) regardless of
    capitalisation. A :class:`KeyError` is raised if the identifier is unknown.
    """

    resource = _RESOURCE_LOOKUP.get(str(identifier).strip().lower())
    if resource is None:
        raise KeyError(f"Recurso desconocido: {identifier}")
    return resource


def resource_from_name(name: str) -> Resource:
    """Return the resource associated with a human readable ``name``.

    ``name`` can be either the enum name or the stored identifier. The lookup is
    case-insensitive to avoid discrepancies between UI and persistence layers.
    """

    return resource_from_id(name)


def normalise_resource(value: Resource | str) -> Resource:
    """Coerce ``value`` into a :class:`Resource` instance."""

    if isinstance(value, Resource):
        return value
    return resource_from_id(value)


def normalise_mapping(mapping: Mapping[Resource | str, float]) -> Dict[Resource, float]:
    """Return a new mapping with normalised resource keys."""

    return {normalise_resource(key): float(amount) for key, amount in mapping.items()}


def ensure_resources(iterable: Iterable[Resource | str]) -> List[Resource]:
    """Return the sequence of resources ensuring each entry is canonical."""

    return [normalise_resource(entry) for entry in iterable]


__all__ = [
    "ALL_RESOURCES",
    "Resource",
    "ensure_resources",
    "normalise_mapping",
    "normalise_resource",
    "resource_from_id",
    "resource_from_name",
]
