"""Data models for the stacked building system."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass(slots=True)
class LevelDef:
    """Definition for a single building level."""

    level: int
    mult: float
    upgrade_cost: Dict[str, float]
    upkeep: Dict[str, float] = field(default_factory=dict)


@dataclass(slots=True)
class InputDef:
    """Input resource consumed per worker per minute."""

    resource: str
    rate_per_worker: float


@dataclass(slots=True)
class ConsolidateRule:
    """Rule describing how many buildings of a level can be merged."""

    from_level: int
    count: int
    to_level: int


@dataclass(slots=True)
class BuildingType:
    """Catalogue entry describing a building type."""

    id: str
    category: str
    output: Optional[str]
    base_per_worker: float
    inputs: List[InputDef]
    build_cost: Dict[str, float]
    level_defs: Dict[int, LevelDef]
    consolidate_rule: Optional[ConsolidateRule] = None
    has_decay: bool = False
    priority: int = 0
    optional_global_stack_mult: bool = False
    stack_penalty: float = 0.05

    def get_level(self, level: int) -> LevelDef:
        try:
            return self.level_defs[level]
        except KeyError as exc:  # pragma: no cover - defensive guard
            raise ValueError(f"Level {level} is not defined for {self.id}") from exc


@dataclass(slots=True)
class BuildingInstance:
    """Single player-owned building."""

    id: str
    type_id: str
    level: int = 1
    active: bool = True
    workers_assigned: int = 0

    def clone(self) -> "BuildingInstance":
        return BuildingInstance(
            id=self.id,
            type_id=self.type_id,
            level=self.level,
            active=self.active,
            workers_assigned=self.workers_assigned,
        )


@dataclass(slots=True)
class InstanceReport:
    """Transient data for UI reporting."""

    instance_id: str
    level: int
    active: bool
    workers: int
    input_factor: float
    produced_per_min: float
    consumed_inputs_per_min: Dict[str, float]


@dataclass(slots=True)
class StackReport:
    """Aggregated production data for a stack."""

    type_id: str
    total_output_per_min: float
    total_workers: int
    input_status: str
    missing_inputs: Dict[str, float]
    consumed_inputs_per_min: Dict[str, float]
    instances: List[InstanceReport]

