"""Resource definitions for the kingdom management backend."""
from __future__ import annotations

from enum import Enum
from typing import Dict, Iterable, List, Mapping


class Resource(str, Enum):
    """Enumeration of all resource keys used in the game."""

    WOOD = "WOOD"
    STICKS = "STICKS"
    STONE = "STONE"
    GRAIN = "GRAIN"
    PLANK = "PLANK"
    TOOLS = "TOOLS"
    ORE = "ORE"
    SEEDS = "SEEDS"
    WATER = "WATER"
    GOLD = "GOLD"
    HOPS = "HOPS"


ALL_RESOURCES: List[Resource] = [
    Resource.WOOD,
    Resource.STICKS,
    Resource.STONE,
    Resource.GRAIN,
    Resource.PLANK,
    Resource.TOOLS,
    Resource.ORE,
    Resource.SEEDS,
    Resource.WATER,
    Resource.GOLD,
    Resource.HOPS,
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
