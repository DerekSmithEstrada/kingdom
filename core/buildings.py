"""Building logic and production handling."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Mapping, Optional, Tuple

from . import config
from .inventory import Inventory
from .resources import Resource


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
    production_report: Dict[str, object] = field(default_factory=dict)

    _next_id: int = 1

    def __post_init__(self) -> None:
        self.id = Building._next_id
        Building._next_id += 1
        self._maintenance_notified = False
        self._last_effective_rate = 0.0
        self.production_report = self._new_report()

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
            modifier_value = 1.0
            for value in modifiers.values():
                modifier_value *= float(value)
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
    ) -> Dict[str, object]:
        """Advance the building logic by ``dt`` seconds."""

        report = self._new_report()
        inactive_reason = self._inactive_reason()
        if inactive_reason:
            self._apply_inactive_status(inactive_reason)
            report["status"] = "inactive"
            report["reason"] = inactive_reason
            self._last_effective_rate = 0.0
            self.production_report = report
            return report

        rate = self.effective_rate(self.assigned_workers, modifiers)
        self._last_effective_rate = rate
        if rate <= 0:
            self._apply_inactive_status("inactive")
            report["status"] = "inactive"
            report["reason"] = "inactive"
            self.production_report = report
            return report

        self.cycle_progress += dt * rate

        cycles_to_attempt = int(self.cycle_progress // self.cycle_time_sec)
        if cycles_to_attempt <= 0:
            report["status"] = "inactive"
            report["reason"] = "inactive"
            self.production_report = report
            return report

        total_consumed: Dict[Resource, float] = {}
        total_produced: Dict[Resource, float] = {}
        final_status = "inactive"
        final_reason: Optional[str] = "inactive"

        while cycles_to_attempt > 0:
            success, consumed, produced, failure_reason, failure_detail = self._attempt_cycle(
                inventory
            )
            if not success:
                if failure_reason == "missing_input":
                    self._apply_missing_input_status(failure_detail, notify)
                    final_status = "stalled"
                    final_reason = "missing_input"
                    self.cycle_progress = min(self.cycle_progress, self.cycle_time_sec)
                elif failure_reason == "no_capacity":
                    self.status = "capacidad_llena"
                    final_status = "stalled"
                    final_reason = "no_capacity"
                    self.cycle_progress = min(self.cycle_progress, self.cycle_time_sec)
                else:
                    final_status = "inactive"
                    final_reason = failure_reason
                break

            self._maintenance_notified = False
            self._accumulate(total_consumed, consumed)
            self._accumulate(total_produced, produced)
            self.cycle_progress -= self.cycle_time_sec
            cycles_to_attempt -= 1
            final_status = "produced"
            final_reason = None

        report["status"] = final_status
        report["reason"] = final_reason
        report["consumed"] = self._resources_to_payload(total_consumed)
        report["produced"] = self._resources_to_payload(total_produced)

        if final_status == "produced":
            self.status = "ok"
        self.production_report = {
            "status": report["status"],
            "reason": report["reason"],
            "consumed": dict(report["consumed"]),
            "produced": dict(report["produced"]),
        }
        return report

    # ------------------------------------------------------------------
    def _inactive_reason(self) -> Optional[str]:
        if not self.built:
            return "inactive"
        if not self.enabled:
            return "inactive"
        if self.assigned_workers <= 0 or self.max_workers <= 0:
            return "no_workers"
        return None

    def _apply_inactive_status(self, reason: str) -> None:
        if reason == "inactive" and not self.built:
            self.status = "no_construido"
        elif reason == "inactive":
            self.status = "pausado"
        elif reason == "no_workers":
            self.status = "pausado"
        else:
            self.status = "pausado"
        if reason != "missing_input":
            self._maintenance_notified = False
        self.cycle_progress = 0.0

    def _apply_missing_input_status(self, detail: Optional[str], notify) -> None:
        if detail == "maintenance":
            self.status = "falta_mantenimiento"
            if not self._maintenance_notified:
                notify(f"{self.name} en pausa: falta mantenimiento")
                self._maintenance_notified = True
        else:
            self.status = "falta_insumos"
            self._maintenance_notified = False

    def _attempt_cycle(
        self,
        inventory: Inventory,
    ) -> Tuple[bool, Dict[Resource, float], Dict[Resource, float], Optional[str], Optional[str]]:
        maintenance = dict(self.maintenance_per_cycle)
        inputs = dict(self.inputs_per_cycle)

        if maintenance and not inventory.has(maintenance):
            return False, {}, {}, "missing_input", "maintenance"
        if inputs and not inventory.has(inputs):
            return False, {}, {}, "missing_input", "inputs"

        combined_inputs = self._combine_resources(inputs, maintenance)
        outputs = dict(self.outputs_per_cycle)

        if outputs and not inventory.can_add(outputs):
            return False, {}, {}, "no_capacity", None

        touched = set(combined_inputs) | set(outputs)
        before = {resource: inventory.get_amount(resource) for resource in touched}

        if combined_inputs and not inventory.consume(combined_inputs):
            self._restore_inventory(inventory, before)
            return False, {}, {}, "missing_input", None

        residual = inventory.add(outputs)
        if residual:
            self._restore_inventory(inventory, before)
            return False, {}, {}, "no_capacity", None

        return True, combined_inputs, outputs, None, None

    @staticmethod
    def _combine_resources(*dicts: Mapping[Resource, float]) -> Dict[Resource, float]:
        combined: Dict[Resource, float] = {}
        for mapping in dicts:
            for resource, amount in mapping.items():
                if amount <= 0:
                    continue
                combined[resource] = combined.get(resource, 0.0) + amount
        return combined

    @staticmethod
    def _accumulate(target: Dict[Resource, float], addition: Mapping[Resource, float]) -> None:
        for resource, amount in addition.items():
            if amount <= 0:
                continue
            target[resource] = target.get(resource, 0.0) + amount

    @staticmethod
    def _restore_inventory(inventory: Inventory, snapshot: Mapping[Resource, float]) -> None:
        for resource, amount in snapshot.items():
            inventory.set_amount(resource, amount)

    @staticmethod
    def _resources_to_payload(resources: Mapping[Resource, float]) -> Dict[str, float]:
        return {resource.value: amount for resource, amount in resources.items() if amount > 0}

    @staticmethod
    def _new_report() -> Dict[str, object]:
        return {
            "status": "inactive",
            "consumed": {},
            "produced": {},
            "reason": "inactive",
        }

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
            "production_report": self.production_report,
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
