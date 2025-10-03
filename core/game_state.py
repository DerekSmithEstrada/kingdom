"""Core game state implementing the stacked building system."""

from __future__ import annotations

from collections import defaultdict
import threading
from typing import Dict, Iterable, List, Mapping, Optional

from .building_catalog import load_default_catalog
from .building_models import (
    BuildingInstance,
    BuildingType,
    InstanceReport,
    StackReport,
)
from .resource_ledger import ResourceLedger


DEFAULT_STARTING_RESOURCES: Dict[str, float] = {
    "wood": 200.0,
    "tools": 40.0,
    "planks": 120.0,
    "stone": 80.0,
    "wheat": 120.0,
    "water": 120.0,
    "hops": 60.0,
    "iron": 80.0,
    "coal": 80.0,
    "flour": 60.0,
}

DEFAULT_TOTAL_WORKERS = 40
DEFAULT_REFUND_RATIO = 0.6


class GameStateError(Exception):
    """Base class for game state errors."""


class InsufficientResourcesError(GameStateError):
    def __init__(self, missing: Mapping[str, float]):
        self.missing = dict(missing)
        super().__init__("INSUFFICIENT_RESOURCES")


class InstanceNotFoundError(GameStateError):
    pass


class BuildingOperationError(GameStateError):
    pass


class GameState:
    """Singleton-like state container for the stacked system."""

    _instance: Optional["GameState"] = None

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.catalog: Dict[str, BuildingType] = {}
        self.inventory = ResourceLedger()
        self.instances_by_type: Dict[str, List[BuildingInstance]] = {}
        self.instances: Dict[str, BuildingInstance] = {}
        self.stack_reports: Dict[str, StackReport] = {}
        self._next_instance_id = 1
        self.time = 0.0
        self.workers_total = DEFAULT_TOTAL_WORKERS
        self.workers_free = DEFAULT_TOTAL_WORKERS
        self.reset()

    # ------------------------------------------------------------------
    @classmethod
    def get_instance(cls) -> "GameState":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def reset(self) -> None:
        with self._lock:
            self.catalog = load_default_catalog()
            self.inventory = ResourceLedger(DEFAULT_STARTING_RESOURCES)
            self.instances_by_type = {type_id: [] for type_id in self.catalog.keys()}
            self.instances = {}
            self.stack_reports = {}
            self._next_instance_id = 1
            self.time = 0.0
            self.workers_total = DEFAULT_TOTAL_WORKERS
            self.workers_free = DEFAULT_TOTAL_WORKERS
            for type_id in self.catalog:
                self._compute_stack_report(type_id, 0.0)

    # ------------------------------------------------------------------
    def snapshot_state(self) -> Dict[str, object]:
        with self._lock:
            return {
                "time": self.time,
                "inventory": self.inventory.snapshot(),
                "workers": {
                    "total": self.workers_total,
                    "free": self.workers_free,
                },
                "stacks": [self._stack_snapshot(type_id) for type_id in self._ordered_types()],
            }

    # ------------------------------------------------------------------
    def advance_time(self, dt: float) -> None:
        if dt <= 0:
            return
        with self._lock:
            self.time += dt
            for type_id in self._ordered_types():
                self._compute_stack_report(type_id, dt)

    # ------------------------------------------------------------------
    def build_instance(self, type_id: str) -> BuildingInstance:
        with self._lock:
            building_type = self._get_type(type_id)
            if not self.inventory.consume(building_type.build_cost):
                raise InsufficientResourcesError(building_type.build_cost)
            instance = BuildingInstance(
                id=self._next_id(type_id),
                type_id=type_id,
                level=1,
                active=True,
                workers_assigned=0,
            )
            self._register_instance(instance)
            self._compute_stack_report(type_id, 0.0)
            return instance

    def upgrade_instance(self, instance_id: str) -> BuildingInstance:
        with self._lock:
            instance = self._get_instance(instance_id)
            building_type = self._get_type(instance.type_id)
            next_level = instance.level + 1
            if next_level not in building_type.level_defs:
                raise BuildingOperationError("MAX_LEVEL")
            level_def = building_type.get_level(next_level)
            if not self.inventory.consume(level_def.upgrade_cost):
                raise InsufficientResourcesError(level_def.upgrade_cost)
            instance.level = next_level
            self._auto_manage_obsolete(instance.type_id)
            self._compute_stack_report(instance.type_id, 0.0)
            return instance

    def consolidate(self, type_id: str) -> BuildingInstance:
        with self._lock:
            building_type = self._get_type(type_id)
            rule = building_type.consolidate_rule
            if not rule:
                raise BuildingOperationError("NO_RULE")

            candidates = [
                inst
                for inst in self.instances_by_type[type_id]
                if inst.level == rule.from_level
            ]
            if len(candidates) < rule.count:
                raise BuildingOperationError("NOT_ENOUGH_INSTANCES")

            candidates.sort(key=lambda inst: (inst.active, inst.workers_assigned), reverse=False)
            selected = candidates[: rule.count]

            workers_recovered = sum(inst.workers_assigned for inst in selected)
            new_active = any(inst.active for inst in selected)

            for inst in selected:
                self._remove_instance(inst.id)

            new_instance = BuildingInstance(
                id=self._next_id(type_id),
                type_id=type_id,
                level=rule.to_level,
                active=new_active,
                workers_assigned=0,
            )
            self._register_instance(new_instance)

            self.workers_free += workers_recovered
            if new_active and workers_recovered > 0:
                assigned = min(workers_recovered, self.workers_free)
                new_instance.workers_assigned = assigned
                self.workers_free -= assigned

            self._auto_manage_obsolete(type_id)
            self._compute_stack_report(type_id, 0.0)
            return new_instance

    def toggle_instance(self, instance_id: str) -> BuildingInstance:
        with self._lock:
            instance = self._get_instance(instance_id)
            if instance.active:
                self.workers_free += instance.workers_assigned
                instance.workers_assigned = 0
                instance.active = False
            else:
                instance.active = True
                self._auto_manage_obsolete(instance.type_id)
            self._compute_stack_report(instance.type_id, 0.0)
            return instance

    def demolish_instance(self, instance_id: str) -> None:
        with self._lock:
            instance = self._get_instance(instance_id)
            building_type = self._get_type(instance.type_id)
            refund = {resource: amount * DEFAULT_REFUND_RATIO for resource, amount in building_type.build_cost.items()}
            self.workers_free += instance.workers_assigned
            self._remove_instance(instance_id)
            if refund:
                self.inventory.add(refund)
            self._compute_stack_report(building_type.id, 0.0)

    def assign_workers(self, instance_id: str, workers: int) -> BuildingInstance:
        with self._lock:
            instance = self._get_instance(instance_id)
            workers = max(0, int(workers))
            delta = workers - instance.workers_assigned
            if delta > self.workers_free:
                raise BuildingOperationError("NOT_ENOUGH_WORKERS")
            instance.workers_assigned += delta
            self.workers_free -= delta
            if instance.workers_assigned == 0:
                instance.active = False
            elif not instance.active:
                instance.active = True
            self._auto_manage_obsolete(instance.type_id)
            self._compute_stack_report(instance.type_id, 0.0)
            return instance

    def optimize_workers(self, type_id: Optional[str] = None) -> None:
        with self._lock:
            type_ids = [type_id] if type_id else list(self.catalog.keys())
            for tid in type_ids:
                self._optimize_type_workers(tid)
                self._compute_stack_report(tid, 0.0)

    # ------------------------------------------------------------------
    def _optimize_type_workers(self, type_id: str) -> None:
        instances = [inst for inst in self.instances_by_type.get(type_id, []) if inst.active]
        if not instances:
            return

        building_type = self._get_type(type_id)
        available_workers = self.workers_free + sum(inst.workers_assigned for inst in instances)
        for inst in instances:
            self.workers_free += inst.workers_assigned
            inst.workers_assigned = 0

        active_instances = sorted(instances, key=lambda inst: inst.level, reverse=True)
        while available_workers > 0 and active_instances:
            best = max(
                active_instances,
                key=lambda inst: building_type.base_per_worker * building_type.get_level(inst.level).mult,
            )
            best.workers_assigned += 1
            available_workers -= 1

        allocated = sum(inst.workers_assigned for inst in active_instances)
        self.workers_free = max(0, self.workers_free - allocated)

    # ------------------------------------------------------------------
    def _compute_stack_report(self, type_id: str, dt: float) -> None:
        building_type = self._get_type(type_id)
        instances = list(self.instances_by_type.get(type_id, []))

        reports: Dict[str, InstanceReport] = {}
        missing_per_min: Dict[str, float] = defaultdict(float)
        consumed_per_min: Dict[str, float] = defaultdict(float)

        active_instances = [inst for inst in instances if inst.active and inst.workers_assigned > 0]
        active_sorted = sorted(active_instances, key=lambda inst: inst.level, reverse=True)
        active_count = len(active_sorted)
        penalty = building_type.stack_penalty
        stack_mult = 1.0
        if building_type.optional_global_stack_mult and active_count > 0:
            stack_mult = 1.0 / (1.0 + penalty * max(0, active_count - 1))

        available_inputs = {input_def.resource: self.inventory.get(input_def.resource) for input_def in building_type.inputs}

        total_output_per_min = 0.0

        for instance in active_sorted:
            level_def = building_type.get_level(instance.level)
            workers = max(0, instance.workers_assigned)

            required_per_min = {
                input_def.resource: workers * input_def.rate_per_worker * level_def.mult
                for input_def in building_type.inputs
            }
            required_per_tick = {
                resource: rate * dt / 60.0 if dt > 0 else rate
                for resource, rate in required_per_min.items()
            }

            supply_factor = 1.0
            if required_per_min:
                factors = []
                for resource, required in required_per_tick.items():
                    if required <= 0:
                        factors.append(1.0)
                        continue
                    available = available_inputs.get(resource, 0.0)
                    if available <= 0:
                        factors.append(0.0)
                    else:
                        factors.append(min(1.0, available / required))
                supply_factor = min(factors) if factors else 1.0
            supply_factor = max(0.0, min(1.0, supply_factor))

            consumed_tick: Dict[str, float] = {}
            provided_per_min = {}
            for resource, required_tick in required_per_tick.items():
                provided_tick = required_tick * supply_factor
                consumed_tick[resource] = provided_tick
                available_inputs[resource] = max(0.0, available_inputs.get(resource, 0.0) - provided_tick)
                provided_per_min[resource] = required_per_min[resource] * supply_factor
                consumed_per_min[resource] += provided_per_min[resource]
                missing_per_min[resource] += max(0.0, required_per_min[resource] - provided_per_min[resource])

            output_per_min = (
                workers
                * building_type.base_per_worker
                * level_def.mult
                * supply_factor
                * stack_mult
            )
            total_output_per_min += output_per_min

            consumed_inputs_per_min = {resource: value for resource, value in provided_per_min.items() if value > 0}
            reports[instance.id] = InstanceReport(
                instance_id=instance.id,
                level=instance.level,
                active=True,
                workers=workers,
                input_factor=supply_factor,
                produced_per_min=output_per_min,
                consumed_inputs_per_min=consumed_inputs_per_min,
            )

        ordered_instances = sorted(instances, key=lambda inst: (-inst.level, inst.id))
        for instance in ordered_instances:
            if instance.id not in reports:
                reports[instance.id] = InstanceReport(
                    instance_id=instance.id,
                    level=instance.level,
                    active=bool(instance.active),
                    workers=max(0, instance.workers_assigned),
                    input_factor=0.0,
                    produced_per_min=0.0,
                    consumed_inputs_per_min={},
                )

        consumed_totals_tick = {
            resource: value * dt / 60.0 if dt > 0 else 0.0
            for resource, value in consumed_per_min.items()
        }
        if dt > 0 and consumed_totals_tick:
            self.inventory.consume(consumed_totals_tick)

        if dt > 0 and building_type.output and total_output_per_min > 0:
            produced_tick = total_output_per_min * dt / 60.0
            self.inventory.add({building_type.output: produced_tick})

        total_workers = sum(inst.workers_assigned for inst in instances)

        missing_clean = {resource: value for resource, value in missing_per_min.items() if value > 1e-6}
        consumed_clean = {resource: value for resource, value in consumed_per_min.items() if value > 1e-6}

        if not building_type.inputs:
            input_status = "ok"
        else:
            consumed_total = sum(consumed_clean.values())
            if not missing_clean:
                input_status = "ok"
            elif consumed_total <= 1e-6:
                input_status = "none"
            else:
                input_status = "partial"

        stack_report = StackReport(
            type_id=type_id,
            total_output_per_min=total_output_per_min,
            total_workers=total_workers,
            input_status=input_status,
            missing_inputs=missing_clean,
            consumed_inputs_per_min=consumed_clean,
            instances=[reports[instance.id] for instance in ordered_instances],
        )

        self.stack_reports[type_id] = stack_report

    # ------------------------------------------------------------------
    def _stack_snapshot(self, type_id: str) -> Dict[str, object]:
        building_type = self._get_type(type_id)
        instances = list(self.instances_by_type.get(type_id, []))
        report = self.stack_reports.get(type_id)

        level_breakdown: Dict[int, Dict[str, int]] = {}
        for inst in instances:
            entry = level_breakdown.setdefault(inst.level, {"level": inst.level, "count": 0, "active": 0})
            entry["count"] += 1
            if inst.active and inst.workers_assigned > 0:
                entry["active"] += 1

        level_summary = sorted(level_breakdown.values(), key=lambda entry: entry["level"])

        instance_payload = [
            {
                "id": inst.id,
                "level": inst.level,
                "active": inst.active,
                "workers": inst.workers_assigned,
            }
            for inst in sorted(instances, key=lambda inst: (-inst.level, inst.id))
        ]

        return {
            "type_id": type_id,
            "name": type_id.replace("_", " ").title(),
            "category": building_type.category,
            "count": len(instances),
            "active_count": sum(1 for inst in instances if inst.active),
            "workers_total": sum(inst.workers_assigned for inst in instances),
            "level_breakdown": level_summary,
            "report": {
                "output_per_min": report.total_output_per_min if report else 0.0,
                "input_status": report.input_status if report else "ok",
                "missing_inputs": report.missing_inputs if report else {},
                "consumed_inputs": report.consumed_inputs_per_min if report else {},
                "instances": [
                    {
                        "id": entry.instance_id,
                        "input_factor": entry.input_factor,
                        "produced_per_min": entry.produced_per_min,
                        "consumed_inputs_per_min": entry.consumed_inputs_per_min,
                        "workers": entry.workers,
                        "level": entry.level,
                        "active": entry.active,
                    }
                    for entry in (report.instances if report else [])
                ],
            },
            "instances": instance_payload,
            "consolidate_rule": (
                {
                    "from_level": building_type.consolidate_rule.from_level,
                    "count": building_type.consolidate_rule.count,
                    "to_level": building_type.consolidate_rule.to_level,
                }
                if building_type.consolidate_rule
                else None
            ),
        }

    # ------------------------------------------------------------------
    def _ordered_types(self) -> Iterable[str]:
        return [
            item[0]
            for item in sorted(
                ((type_id, building.priority, building.category) for type_id, building in self.catalog.items()),
                key=lambda entry: (-entry[1], entry[2], entry[0]),
            )
        ]

    def _next_id(self, type_id: str) -> str:
        value = f"{type_id}-{self._next_instance_id:04d}"
        self._next_instance_id += 1
        return value

    def _register_instance(self, instance: BuildingInstance) -> None:
        self.instances[instance.id] = instance
        self.instances_by_type.setdefault(instance.type_id, []).append(instance)

    def _remove_instance(self, instance_id: str) -> None:
        instance = self._get_instance(instance_id)
        self.instances.pop(instance_id, None)
        bucket = self.instances_by_type.get(instance.type_id)
        if bucket is not None:
            bucket[:] = [inst for inst in bucket if inst.id != instance_id]

    def _get_type(self, type_id: str) -> BuildingType:
        if type_id not in self.catalog:
            raise BuildingOperationError("UNKNOWN_TYPE")
        return self.catalog[type_id]

    def _get_instance(self, instance_id: str) -> BuildingInstance:
        try:
            return self.instances[instance_id]
        except KeyError as exc:
            raise InstanceNotFoundError(instance_id) from exc

    def _auto_manage_obsolete(self, type_id: str) -> None:
        instances = [inst for inst in self.instances_by_type.get(type_id, []) if inst.active]
        if not instances:
            return

        total_assigned = sum(inst.workers_assigned for inst in instances)
        if total_assigned > self.workers_total:
            overflow = total_assigned - self.workers_total
            for inst in sorted(instances, key=lambda inst: inst.level):
                if overflow <= 0:
                    break
                removed = min(inst.workers_assigned, overflow)
                inst.workers_assigned -= removed
                overflow -= removed
                self.workers_free += removed
                if inst.workers_assigned <= 0:
                    inst.active = False

    # ------------------------------------------------------------------
    def get_stack_report(self, type_id: str) -> StackReport:
        return self.stack_reports[type_id]


def get_game_state() -> GameState:
    return GameState.get_instance()
