"""Building logic and production handling."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Mapping, Optional, Tuple

from . import config
from .inventory import Inventory
from .resources import Resource


Reason = Optional[str]


@dataclass
class Building:
    """Represents a production building."""

    type_key: str
    recipe: config.BuildingRecipe
    name: str
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
        self._maintenance_notified = False
        self._last_effective_rate = 0.0

    # ------------------------------------------------------------------
    @property
    def max_workers(self) -> int:
        return self.recipe.max_workers

    @property
    def inputs_per_cycle(self) -> Mapping[Resource, float]:
        return self.recipe.inputs

    @property
    def outputs_per_cycle(self) -> Mapping[Resource, float]:
        return self.recipe.outputs

    @property
    def maintenance_per_cycle(self) -> Mapping[Resource, float]:
        return self.recipe.maintenance

    @property
    def cycle_time_sec(self) -> float:
        return self.recipe.cycle_time

    # ------------------------------------------------------------------
    def can_produce(self, inventory: Inventory) -> Tuple[bool, Reason]:
        """Return whether the building can run another production cycle."""

        if not self.built:
            return False, "not_built"
        if not self.enabled:
            return False, "disabled"
        if self.assigned_workers <= 0 or self.max_workers <= 0:
            return False, "no_workers"
        if self.maintenance_per_cycle and not inventory.has(self.maintenance_per_cycle):
            return False, "missing_maintenance"
        if self.inputs_per_cycle and not inventory.has(self.inputs_per_cycle):
            return False, "missing_inputs"
        for resource, amount in self.outputs_per_cycle.items():
            capacity = inventory.get_capacity(resource)
            if capacity is None:
                continue
            if inventory.get_amount(resource) + amount > capacity + 1e-9:
                return False, "capacity_full"
        return True, None

    def effective_rate(
        self,
        workers: int,
        modifiers: Mapping[str, float] | float | None,
    ) -> float:
        """Return the effective production rate for ``workers`` and ``modifiers``."""

        if self.max_workers <= 0:
            base = 0.0
        else:
            base = min(1.0, max(0.0, workers / self.max_workers))

        if isinstance(modifiers, Mapping):
            season_mod = float(modifiers.get("global", 1.0))
            building_mod = float(modifiers.get(self.type_key, 1.0))
            modifier_value = season_mod * building_mod
        elif modifiers is None:
            modifier_value = 1.0
        else:
            modifier_value = float(modifiers)
        return base * modifier_value

    def next_cycle_eta(self) -> Optional[float]:
        """Return the estimated time until the next cycle completes."""

        remaining_progress = max(0.0, self.cycle_time_sec - self.cycle_progress)
        if self._last_effective_rate <= 0:
            return None
        return remaining_progress / self._last_effective_rate

    # ------------------------------------------------------------------
    def tick(
        self,
        dt: float,
        inventory: Inventory,
        notify,
        modifiers: Mapping[str, float] | float | None,
    ) -> None:
        """Advance the building logic by ``dt`` seconds."""

        can_produce, reason = self.can_produce(inventory)
        if not can_produce:
            self._handle_inactive_state(reason, notify)
            self._last_effective_rate = 0.0
            return

        rate = self.effective_rate(self.assigned_workers, modifiers)
        self._last_effective_rate = rate
        if rate <= 0:
            self.status = "pausado"
            return

        self._maintenance_notified = False

        self.cycle_progress += dt * rate
        produced_cycle = False

        while self.cycle_progress >= self.cycle_time_sec:
            if self.inputs_per_cycle and not inventory.consume(self.inputs_per_cycle):
                self.status = "falta_insumos"
                self.cycle_progress = 0.0
                return
            if self.maintenance_per_cycle and not inventory.consume(
                self.maintenance_per_cycle
            ):
                self.status = "falta_mantenimiento"
                if not self._maintenance_notified:
                    notify(f"{self.name} en pausa: falta mantenimiento")
                    self._maintenance_notified = True
                self.cycle_progress = 0.0
                return
            residual = inventory.add(self.outputs_per_cycle)
            if residual:
                self.status = "capacidad_llena"
                # Keep progress so the cycle can retry once there is room
                self.cycle_progress = self.cycle_time_sec
                return
            self.cycle_progress -= self.cycle_time_sec
            produced_cycle = True

        if produced_cycle or self.status != "ok":
            self.status = "ok"

    # ------------------------------------------------------------------
    def _handle_inactive_state(self, reason: Reason, notify) -> None:
        status_map = {
            "not_built": "no_construido",
            "disabled": "pausado",
            "no_workers": "pausado",
            "missing_inputs": "falta_insumos",
            "capacity_full": "capacidad_llena",
            "missing_maintenance": "falta_mantenimiento",
        }
        if reason == "missing_maintenance" and not self._maintenance_notified:
            notify(f"{self.name} en pausa: falta mantenimiento")
            self._maintenance_notified = True
        elif reason != "missing_maintenance":
            self._maintenance_notified = False
        self.status = status_map.get(reason, "pausado")

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
            "maintenance": {
                res.value: amt for res, amt in self.maintenance_per_cycle.items()
            },
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


def build_from_config(type_key: str) -> Building:
    recipe = config.BUILDING_RECIPES[type_key]
    name = config.BUILDING_NAMES.get(type_key, type_key.title())
    return Building(type_key=type_key, recipe=recipe, name=name)
