"""Building logic and production handling."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

from . import config
from .inventory import Inventory
from .resources import Resource


@dataclass
class Building:
    """Represents a production building."""

    type_key: str
    name: str
    max_workers: int
    inputs_per_cycle: Dict[Resource, float]
    outputs_per_cycle: Dict[Resource, float]
    cycle_time_sec: float
    maintenance_per_min: Dict[Resource, float]
    built: bool = True
    enabled: bool = True
    assigned_workers: int = 0
    cycle_progress: float = 0.0
    status: str = "pausado"
    id: int = field(init=False)

    _next_id: int = 1

    def __post_init__(self) -> None:
        self.id = Building._next_id
        Building._next_id += 1
        self._maintenance_per_sec = {
            resource: amount / 60.0 for resource, amount in self.maintenance_per_min.items()
        }
        self._maintenance_notified = False

    # ------------------------------------------------------------------
    def tick(
        self,
        dt: float,
        inventory: Inventory,
        notify,
        production_modifier: float,
    ) -> None:
        """Advance the building logic by ``dt`` seconds."""

        if not self.built:
            return
        if not self.enabled:
            self.status = "pausado"
            return
        if self.assigned_workers <= 0 or self.max_workers <= 0:
            self.status = "pausado"
            return

        maintenance_cost = {
            resource: rate * dt for resource, rate in self._maintenance_per_sec.items()
        }
        if maintenance_cost and not inventory.has(maintenance_cost):
            if not self._maintenance_notified:
                notify(f"{self.name} en pausa: falta mantenimiento")
                self._maintenance_notified = True
            self.status = "pausado"
            return
        if maintenance_cost:
            inventory.consume(maintenance_cost)
            self._maintenance_notified = False

        if self.inputs_per_cycle and not inventory.has(self.inputs_per_cycle):
            self.status = "falta_insumos"
            return

        for resource, amount in self.outputs_per_cycle.items():
            capacity = inventory.get_capacity(resource)
            if capacity is None:
                continue
            if inventory.get_amount(resource) + amount > capacity + 1e-9:
                self.status = "capacidad_llena"
                return

        efficiency = min(1.0, max(0.0, self.assigned_workers / self.max_workers))
        efficiency *= production_modifier
        if efficiency <= 0:
            self.status = "pausado"
            return

        self.cycle_progress += dt * efficiency

        produced_cycle = False
        while self.cycle_progress >= self.cycle_time_sec:
            if self.inputs_per_cycle and not inventory.consume(self.inputs_per_cycle):
                self.status = "falta_insumos"
                self.cycle_progress = 0.0
                return
            residual = inventory.add(self.outputs_per_cycle)
            if residual:
                self.status = "capacidad_llena"
                return
            self.cycle_progress -= self.cycle_time_sec
            produced_cycle = True

        if produced_cycle or self.status != "ok":
            self.status = "ok"

    # ------------------------------------------------------------------
    def to_snapshot(self) -> Dict[str, object]:
        return {
            "id": self.id,
            "type": self.type_key,
            "name": self.name,
            "built": self.built,
            "active_workers": self.assigned_workers,
            "max_workers": self.max_workers,
            "inputs": {res.value: amt for res, amt in self.inputs_per_cycle.items()},
            "outputs": {res.value: amt for res, amt in self.outputs_per_cycle.items()},
            "cycle_time": self.cycle_time_sec,
            "maintenance": {res.value: amt for res, amt in self.maintenance_per_min.items()},
            "status": self.status,
            "enabled": self.enabled,
        }

    def to_dict(self) -> Dict[str, object]:
        return {
            "id": self.id,
            "type": self.type_key,
            "enabled": self.enabled,
            "assigned_workers": self.assigned_workers,
            "cycle_progress": self.cycle_progress,
        }

    @classmethod
    def reset_ids(cls, next_id: int = 1) -> None:
        cls._next_id = next_id


def _coerce_resource_key(key) -> Resource:
    if isinstance(key, Resource):
        return key
    return Resource(key)


def build_from_config(type_key: str) -> Building:
    recipe = config.RECETAS[type_key]
    name = config.BUILDING_NAMES.get(type_key, type_key.title())
    inputs = {_coerce_resource_key(res): float(amount) for res, amount in recipe["inputs"].items()}
    outputs = {_coerce_resource_key(res): float(amount) for res, amount in recipe["outputs"].items()}
    maintenance = {
        _coerce_resource_key(res): float(amount)
        for res, amount in recipe.get("maintenance_per_min", {}).items()
    }
    return Building(
        type_key=type_key,
        name=name,
        max_workers=int(recipe["max_workers"]),
        inputs_per_cycle=inputs,
        outputs_per_cycle=outputs,
        cycle_time_sec=float(recipe["cycle_time"]),
        maintenance_per_min=maintenance,
    )
