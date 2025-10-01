"""Resource definitions for the kingdom management backend."""
from __future__ import annotations

from enum import Enum
from typing import List


class Resource(str, Enum):
    """Enumeration of all resource keys used in the game."""

    WOOD = "WOOD"
    STONE = "STONE"
    GRAIN = "GRAIN"
    WATER = "WATER"
    GOLD = "GOLD"
    HOPS = "HOPS"


ALL_RESOURCES: List[Resource] = [
    Resource.WOOD,
    Resource.STONE,
    Resource.GRAIN,
    Resource.WATER,
    Resource.GOLD,
    Resource.HOPS,
]
