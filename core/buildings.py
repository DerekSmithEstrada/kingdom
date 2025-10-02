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

    @property
    def per_worker_output_rate(self) -> Optional[Mapping[Resource, float]]:
        return self.recipe.per_worker_output_rate

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

        modifier_value = self._modifier_multiplier(modifiers)
        return base * modifier_value

    def _modifier_multiplier(
        self, modifiers: Mapping[str, float] | float | None
    ) -> float:
        if isinstance(modifiers, Mapping):
            modifier_value = 1.0
            for value in modifiers.values():
                modifier_value *= float(value)
            return modifier_value
        if modifiers is None:
            return 1.0
        return float(modifiers)

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

        if self.per_worker_output_rate:
            report = self._tick_continuous(dt, inventory, modifiers)
            self.production_report = {
                "status": report.get("status"),
                "reason": report.get("reason"),
                "detail": report.get("detail"),
                "consumed": dict(report.get("consumed", {})),
                "produced": dict(report.get("produced", {})),
            }
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
        final_detail: Optional[object] = None

        while cycles_to_attempt > 0:
            (
                success,
                consumed,
                produced,
                failure_reason,
                failure_detail,
            ) = self._attempt_cycle(
                inventory
            )
            if not success:
                if failure_reason == "missing_input":
                    self._apply_missing_input_status(failure_detail, notify)
                    final_status = "stalled"
                    final_reason = "missing_input"
                    final_detail = failure_detail
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
        report["detail"] = final_detail

        if final_status == "produced":
            self.status = "ok"
        self.production_report = {
            "status": report["status"],
            "reason": report["reason"],
            "detail": report["detail"],
            "consumed": dict(report["consumed"]),
            "produced": dict(report["produced"]),
        }
        return report

    def _tick_continuous(
        self,
        dt: float,
        inventory: Inventory,
        modifiers: Mapping[str, float] | float | None,
    ) -> Dict[str, object]:
        report = self._new_report()
        multiplier = self._modifier_multiplier(modifiers)
        if multiplier <= 0:
            self._apply_inactive_status("inactive")
            report["status"] = "inactive"
            report["reason"] = "inactive"
            self._last_effective_rate = 0.0
            self.cycle_progress = 0.0
            return report

        workers = max(0, self.assigned_workers)
        produced_amounts: Dict[Resource, float] = {}
        for resource, rate in (self.per_worker_output_rate or {}).items():
            amount = workers * rate * multiplier * dt
            if amount > 0:
                produced_amounts[resource] = amount

        self._last_effective_rate = multiplier
        self.cycle_progress = 0.0

        if not produced_amounts:
            report["status"] = "inactive"
            report["reason"] = "inactive"
            return report

        if not inventory.can_add(produced_amounts):
            self.status = "capacidad_llena"
            report["status"] = "stalled"
            report["reason"] = "no_capacity"
            report["consumed"] = {}
            report["produced"] = {}
            return report

        residual = inventory.add(produced_amounts)
        if residual:
            self.status = "capacidad_llena"
            report["status"] = "stalled"
            report["reason"] = "no_capacity"
            report["consumed"] = {}
            report["produced"] = {}
            return report

        self.status = "ok"
        self._maintenance_notified = False
        report["status"] = "produced"
        report["reason"] = None
        report["consumed"] = {}
        report["produced"] = self._resources_to_payload(produced_amounts)
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
            missing = self._first_missing_resource(maintenance, inventory)
            detail = missing.value if isinstance(missing, Resource) else "maintenance"
            return False, {}, {}, "missing_input", detail
        if inputs and not inventory.has(inputs):
            missing = self._first_missing_resource(inputs, inventory)
            detail = missing.value if isinstance(missing, Resource) else "inputs"
            return False, {}, {}, "missing_input", detail

        combined_inputs = self._combine_resources(inputs, maintenance)
        outputs = dict(self.outputs_per_cycle)

        if outputs and not inventory.can_add(outputs):
            return False, {}, {}, "no_capacity", None

        touched = set(combined_inputs) | set(outputs)
        before = {resource: inventory.get_amount(resource) for resource in touched}

        if combined_inputs and not inventory.consume(combined_inputs):
            self._restore_inventory(inventory, before)
            missing = self._first_missing_resource(combined_inputs, inventory)
            detail = missing.value if isinstance(missing, Resource) else None
            return False, {}, {}, "missing_input", detail

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
            "detail": None,
        }

    @staticmethod
    def _first_missing_resource(
        requirements: Mapping[Resource, float], inventory: Inventory
    ) -> Optional[Resource]:
        for resource, amount in requirements.items():
            if amount <= 0:
                continue
            if inventory.get_amount(resource) + 1e-9 < amount:
                return resource
        for resource, amount in requirements.items():
            if amount > 0:
                return resource
        return None

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
