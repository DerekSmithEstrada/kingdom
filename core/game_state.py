"""Core singleton storing all game state."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from collections import deque
import threading
from typing import Deque, Dict, List, Mapping, Optional, Set, Tuple

from . import config
from .buildings import Building, build_from_config
from .inventory import Inventory
from .jobs import WorkerPool
from .resources import ALL_RESOURCES, Resource
from .timeclock import SeasonClock
from .trade import TradeManager


logger = logging.getLogger(__name__)


class InsufficientResourcesError(Exception):
    """Raised when an action cannot be performed due to missing resources."""

    def __init__(self, requirements: Mapping[Resource, float]):
        self.requirements = dict(requirements)
        super().__init__("INSUFFICIENT_RESOURCES")


class NothingToDemolishError(Exception):
    """Raised when attempting to demolish an unbuilt structure."""


class GameState:
    """Central storage for all mutable game data."""

    _instance: Optional["GameState"] = None

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._tick_count = 0
        self._state_version = 0
        self.notifications: Deque[str] = deque(maxlen=config.NOTIFICATION_QUEUE_LIMIT)
        self.last_production_reports: Dict[str, Dict[str, object]] = {}
        self._active_missing_notifications: Dict[Tuple[str, Resource], str] = {}
        self.wood: float = 0.0
        self.woodcutter_camps_built: int = 0
        self.workers_assigned_woodcutter: int = 0
        self.max_workers_woodcutter: int = 0
        self.wood_max_capacity: float = 0.0
        self.wood_production_per_second: float = 0.0
        self._initialise_state()

    # ------------------------------------------------------------------
    @classmethod
    def get_instance(cls) -> "GameState":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def reset(self) -> None:
        self._initialise_state()

    def _initialise_state(self) -> None:
        with self._lock:
            self._tick_count = 0
            self._state_version = 0
            self.notifications.clear()
            self.season_clock = SeasonClock(season_modifiers=config.SEASON_MODIFIERS)
            self._sync_season_state()
            self.inventory = Inventory()
            self.inventory.set_notifier(self.add_notification)
            self.population_current = int(config.POPULATION_INITIAL)
            self.population_capacity = int(config.POPULATION_CAPACITY)
            self.worker_pool = WorkerPool(self.population_current)
            self.buildings: Dict[str, Building] = {}
            Building.reset_ids()
            self.trade_manager = TradeManager(config.TRADE_DEFAULTS)
            self._initialise_inventory()
            self.last_production_reports = {}
            self._active_missing_notifications = {}
            self._initialise_starting_buildings()
            self.wood = 0.0
            self.woodcutter_camps_built = 0
            self.workers_assigned_woodcutter = 0
            self.max_workers_woodcutter = 0
            self.wood_max_capacity = 0.0
            self.wood_production_per_second = 0.0
            self.recompute_wood_caps()

    # ------------------------------------------------------------------
    def _initialise_inventory(self) -> None:
        for resource in ALL_RESOURCES:
            amount = config.STARTING_RESOURCES.get(resource, 0.0)
            self.inventory.set_amount(resource, float(amount))
            capacity = config.CAPACIDADES.get(resource)
            if capacity is not None:
                self.inventory.set_capacity(resource, float(capacity))

    @staticmethod
    def _normalise_built_value(value: object, *, default: int = 0) -> int:
        if value is None:
            return max(0, int(default))
        if isinstance(value, bool):
            return 1 if value else 0
        if isinstance(value, (int, float)):
            return max(0, int(value))
        if isinstance(value, str):
            try:
                numeric = float(value)
            except ValueError:
                return 1 if value.strip() else max(0, int(default))
            return max(0, int(numeric))
        return 1 if bool(value) else 0

    def _initialise_starting_buildings(self) -> None:
        for entry in config.STARTING_BUILDINGS:
            type_key: Optional[str] = None
            workers = 0
            enabled = True
            built_value: object = None

            if isinstance(entry, Mapping):
                raw_type = entry.get("type")
                if isinstance(raw_type, str):
                    type_key = raw_type
                if "workers" in entry:
                    try:
                        workers = int(entry.get("workers", 0))
                    except (TypeError, ValueError):
                        workers = 0
                if "enabled" in entry:
                    enabled = bool(entry.get("enabled", True))
                built_value = entry.get("built") if "built" in entry else None
            elif isinstance(entry, (tuple, list)) and entry:
                raw_type = entry[0]
                if isinstance(raw_type, str):
                    type_key = raw_type
                if len(entry) > 1:
                    try:
                        workers = int(entry[1])
                    except (TypeError, ValueError):
                        workers = 0
                if len(entry) > 2:
                    built_value = entry[2]
            elif isinstance(entry, str):
                type_key = entry
                built_value = None

            if not type_key or type_key not in config.BUILDING_RECIPES:
                continue

            building = build_from_config(type_key)
            building.enabled = enabled
            built_count = self._normalise_built_value(
                built_value,
                default=1 if enabled else 0,
            )
            building.built = built_count
            if built_count <= 0:
                building.enabled = False
            assigned = max(0, min(int(workers), building.max_workers))
            building.assigned_workers = assigned
            self.buildings[building.id] = building
            self.worker_pool.register_building(building)
            if assigned > 0:
                self.worker_pool.set_assignment(building, assigned)
            self.last_production_reports[building.id] = building.production_report

    def add_notification(self, message: str) -> None:
        self.notifications.append(message)

    def consume_notification(self) -> Optional[str]:
        if not self.notifications:
            return None
        return self.notifications.popleft()

    def list_notifications(self) -> List[str]:
        return list(self.notifications)

    # ------------------------------------------------------------------
    def tick(self, dt: float) -> None:
        seconds = max(0.0, float(dt))
        self.season_clock.update(seconds)
        self._sync_season_state()

        self.trade_manager.tick(seconds, self.inventory, self.add_notification)

        self.last_production_reports = {}
        active_missing: Set[Tuple[str, Resource]] = set()
        woodcutter_building = self.get_building_by_type(config.WOODCUTTER_CAMP)
        for building in list(self.buildings.values()):
            if woodcutter_building is not None and building.id == woodcutter_building.id:
                continue
            modifiers = self.get_production_modifiers(building)
            report = building.tick(seconds, self.inventory, self.add_notification, modifiers)
            self.last_production_reports[building.id] = report
            self._update_missing_input_notifications(building, report, active_missing)
        self._cleanup_missing_notifications(active_missing)
        produced_wood = self._apply_wood_tick(seconds)
        if woodcutter_building is not None:
            wood_state = self.wood_state_snapshot()
            produced = max(0.0, float(produced_wood))
            max_capacity = float(wood_state["wood_max_capacity"])
            current_wood = float(wood_state["wood"])
            workers_assigned = int(wood_state["workers_assigned_woodcutter"])
            if wood_state["woodcutter_camps_built"] <= 0:
                status = "inactive"
                reason = "inactive"
            elif workers_assigned <= 0:
                status = "inactive"
                reason = "no_workers"
            elif max_capacity > 0 and current_wood >= max_capacity - 1e-9:
                status = "stalled"
                reason = "no_capacity"
            elif produced > 0:
                status = "produced"
                reason = None
            else:
                status = "inactive"
                reason = "inactive"

            produced_payload = {"wood": produced} if produced > 0 else {}
            wood_report = {
                "status": status,
                "reason": reason,
                "detail": None,
                "consumed": {},
                "produced": produced_payload,
            }
            woodcutter_building.production_report = dict(wood_report)
            if wood_state["woodcutter_camps_built"] <= 0:
                woodcutter_building.status = "no_construido"
            elif status == "produced":
                woodcutter_building.status = "ok"
            elif status == "stalled":
                woodcutter_building.status = "capacidad_llena"
            else:
                woodcutter_building.status = "pausado"
            self.last_production_reports[woodcutter_building.id] = wood_report
        with self._lock:
            self._tick_count += 1
            if self._tick_count % 5 == 0:
                wood_amount = self.inventory.get_amount(Resource.WOOD)
                woodcutter = self.get_building_by_type(config.WOODCUTTER_CAMP)
                workers = woodcutter.assigned_workers if woodcutter else 0
                built = woodcutter.built_count if woodcutter else 0
                logger.debug(
                    "Tick %s summary: wood=%.1f built=%s workers=%s",
                    self._tick_count,
                    round(wood_amount, 1),
                    built,
                    workers,
                )

    def get_production_modifiers(self, building: Building) -> Dict[str, float]:
        return self.season_clock.get_modifiers(building.type_key)

    # ------------------------------------------------------------------
    def build_building(self, type_key: str) -> Building:
        if type_key not in config.BUILDING_RECIPES:
            raise ValueError(f"Tipo de edificio desconocido: {type_key}")

        canonical_id = config.resolve_building_public_id(type_key)

        with self._lock:
            building = self.buildings.get(canonical_id)

            cost = config.BUILD_COSTS.get(type_key, {})
            if cost and not self.inventory.has(cost):
                raise InsufficientResourcesError(cost)
            if cost and not self.inventory.consume(cost):
                raise InsufficientResourcesError(cost)

            if building is None:
                building = build_from_config(type_key)
                building.built = 0
                building.assigned_workers = max(0, int(building.assigned_workers))
                self.buildings[building.id] = building
                self.last_production_reports[building.id] = building.production_report

            self.worker_pool.register_building(building)

            building.built = building.built_count + 1
            building.enabled = True

            max_workers = building.max_workers
            if building.assigned_workers > max_workers:
                building.assigned_workers = max_workers

            if building.type_key == config.WOODCUTTER_CAMP:
                self._recompute_wood_state_locked()

            self._state_version += 1

        self.add_notification(f"Construido {building.name}")
        return building

    def demolish_building(self, building_id: str, refund_rate: float = 0.5) -> Building:
        canonical_id = self._canonical_building_id(building_id)

        with self._lock:
            building = self.buildings.get(canonical_id)
            if building is None:
                raise ValueError("Edificio inexistente")

            built_count = building.built_count
            if built_count <= 0:
                raise NothingToDemolishError("NOTHING_TO_DEMOLISH")

            building.built = built_count - 1
            if building.built <= 0:
                building.enabled = False

            max_workers = building.max_workers
            if building.assigned_workers > max_workers:
                building.assigned_workers = max_workers

            effective_refund_rate = refund_rate
            if building.type_key == config.WOODCUTTER_CAMP:
                effective_refund_rate = 0.0

            if effective_refund_rate > 0:
                refund = {
                    resource: amount * effective_refund_rate
                    for resource, amount in config.BUILD_COSTS.get(building.type_key, {}).items()
                }
            else:
                refund = {}
            if refund:
                self.inventory.add(refund)

            self.worker_pool.register_building(building)
            if building.type_key == config.WOODCUTTER_CAMP:
                self._recompute_wood_state_locked()
            self._state_version += 1

        self.add_notification(f"{building.name} demolido")
        return building

    def toggle_building(self, building_id: str, enabled: bool) -> None:
        canonical_id = self._canonical_building_id(building_id)
        building = self.buildings.get(canonical_id)
        if building is None:
            raise ValueError("Edificio inexistente")
        building.enabled = enabled
        if not enabled:
            building.status = "pausado"
        self.add_notification(
            f"{building.name} {'activado' if enabled else 'desactivado'}"
        )

    # ------------------------------------------------------------------
    def _missing_resources(self, cost: Dict[Resource, float]) -> str:
        for resource, required in cost.items():
            available = self.inventory.get_amount(resource)
            if available + 1e-9 < required:
                return (
                    f"Falta {resource.value}: {available:.1f}/{required:.1f}"
                )
        return ""

    def _canonical_building_id(self, building_id: str) -> str:
        try:
            return config.resolve_building_public_id(building_id)
        except ValueError as exc:  # pragma: no cover - error path exercised via API
            raise ValueError("Edificio inexistente") from exc

    # ------------------------------------------------------------------
    def apply_worker_delta(self, building_id: str, delta: int) -> Dict[str, int]:
        with self._lock:
            canonical_id = self._canonical_building_id(building_id)
            building = self.buildings.get(canonical_id)
            if building is None:
                raise ValueError("Edificio inexistente")

            change = int(delta)
            if change == 0:
                return {
                    "before": int(building.assigned_workers),
                    "delta": 0,
                    "assigned": int(building.assigned_workers),
                }

            before = int(building.assigned_workers)

            if change > 0:
                applied = self.worker_pool.assign_workers(building, change)
            else:
                removed = self.worker_pool.unassign_workers(building, abs(change))
                applied = -removed

            wood_changed = False
            if building.type_key == config.WOODCUTTER_CAMP:
                wood_changed = self._recompute_wood_state_locked()

            if applied != 0 or wood_changed:
                self._state_version += 1

            return {
                "before": before,
                "delta": int(applied),
                "assigned": int(building.assigned_workers),
            }

    def assign_workers(self, building_id: str, number: int) -> int:
        result = self.apply_worker_delta(building_id, number)
        return max(0, result["delta"])

    def unassign_workers(self, building_id: str, number: int) -> int:
        result = self.apply_worker_delta(building_id, -number)
        return abs(min(0, result["delta"]))

    def get_building(self, building_id: str) -> Optional[Building]:
        try:
            canonical_id = self._canonical_building_id(building_id)
        except ValueError:
            return None
        return self.buildings.get(canonical_id)

    def get_building_by_type(self, type_key: str) -> Optional[Building]:
        for building in self.buildings.values():
            if building.type_key == type_key:
                return building
        return None

    def wood_state_snapshot(self) -> Dict[str, object]:
        with self._lock:
            return self._wood_state_payload_unlocked()

    def _wood_state_payload_unlocked(self) -> Dict[str, object]:
        return {
            "wood": float(self.wood),
            "woodcutter_camps_built": int(self.woodcutter_camps_built),
            "workers_assigned_woodcutter": int(self.workers_assigned_woodcutter),
            "max_workers_woodcutter": int(self.max_workers_woodcutter),
            "wood_max_capacity": float(self.wood_max_capacity),
            "wood_production_per_second": float(self.wood_production_per_second),
        }

    def basic_state_snapshot(self) -> Dict[str, object]:
        with self._lock:
            items = {
                resource.value.lower(): round(
                    self.inventory.get_amount(resource), 1
                )
                for resource in ALL_RESOURCES
            }
            woodcutter = self.get_building_by_type(config.WOODCUTTER_CAMP)
            population = self.population_snapshot()
            version = int(self._state_version)
            wood_state = self._wood_state_payload_unlocked()

            if woodcutter is None:
                built = 0
                workers = 0
                total_capacity = 0
            else:
                built = woodcutter.built_count
                workers = max(0, int(woodcutter.assigned_workers))
                total_capacity = int(woodcutter.max_workers)

        active_workers = min(workers, built) if built > 0 else 0
        jobs_payload = {
            "assigned": workers,
            "capacity": total_capacity,
        }

        snapshot = {
            "items": items,
            "buildings": {
                config.WOODCUTTER_CAMP: {
                    "built": built,
                    "workers": workers,
                    "capacity": total_capacity,
                    "active": active_workers,
                }
            },
            "jobs": {"forester": jobs_payload},
            "population": population,
            "version": version,
            "wood_state": wood_state,
        }

        snapshot.update(self.response_metadata(version))
        return snapshot

    def response_metadata(self, version: Optional[int] = None) -> Dict[str, object]:
        if version is None:
            with self._lock:
                version_value = int(self._state_version)
        else:
            version_value = int(version)
        timestamp = (
            datetime.now(timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
        )
        return {
            "request_id": uuid.uuid4().hex,
            "server_time": timestamp,
            "version": version_value,
        }

    def game_tick(self, dt_seconds: float) -> None:
        """Alias for :meth:`tick` matching the wood subsystem naming."""

        self.tick(dt_seconds)

    def assign_workers_to_woodcutter(self, number: int) -> int:
        """Assign workers to the woodcutter ensuring clamps are respected."""

        with self._lock:
            initial_change = self._recompute_wood_state_locked()
            woodcutter = self.get_building_by_type(config.WOODCUTTER_CAMP)
            current_assigned = 0 if woodcutter is None else max(0, int(woodcutter.assigned_workers))
            max_assignable = current_assigned + self.worker_pool.available_workers
            target = max(0, int(number))
            target = min(target, self.max_workers_woodcutter, max_assignable)

            if woodcutter is None or self.woodcutter_camps_built <= 0:
                target = 0
            if woodcutter is not None:
                self.worker_pool.set_assignment(woodcutter, target)

            changed = self._recompute_wood_state_locked() or initial_change
            if changed:
                self._state_version += 1
            return self.workers_assigned_woodcutter

    def recompute_wood_caps(self) -> None:
        """Recalculate wood capacity and worker clamps."""

        with self._lock:
            if self._recompute_wood_state_locked():
                self._state_version += 1

    def build_woodcutter_camp(self) -> bool:
        """Attempt to build a woodcutter camp respecting the wood cost."""

        try:
            self.build_building(config.WOODCUTTER_CAMP)
            return True
        except InsufficientResourcesError:
            return False

    def demolish_woodcutter_camp(self) -> bool:
        """Demolish a woodcutter camp if present."""

        woodcutter = self.get_building_by_type(config.WOODCUTTER_CAMP)
        if woodcutter is None or woodcutter.built_count <= 0:
            return False
        self.demolish_building(woodcutter.id, refund_rate=0.0)
        return True

    def _apply_wood_tick(self, dt: float) -> float:
        seconds = max(0.0, float(dt))
        produced_amount = 0.0
        with self._lock:
            changed = self._recompute_wood_state_locked()
            if seconds <= 0:
                if changed:
                    self._state_version += 1
                return produced_amount

            if self.wood_production_per_second <= 0 or self.wood_max_capacity <= 0:
                if changed:
                    self._state_version += 1
                return produced_amount

            potential = self.wood_production_per_second * seconds
            if potential <= 0:
                if changed:
                    self._state_version += 1
                return produced_amount

            current_amount = self.wood
            new_amount = min(current_amount + potential, self.wood_max_capacity)
            new_amount = max(0.0, new_amount)
            if abs(new_amount - current_amount) > 1e-9:
                produced_amount = max(0.0, new_amount - current_amount)
                self.wood = new_amount
                self.inventory.set_amount(Resource.WOOD, new_amount)
                changed = True

            if changed:
                self._state_version += 1
        return produced_amount

    def _recompute_wood_state_locked(self) -> bool:
        """Synchronise derived wood values.

        Returns ``True`` when any of the tracked values changed as part of the
        recomputation. Callers are responsible for bumping the state version when
        ``True`` is returned.
        """

        woodcutter = self.get_building_by_type(config.WOODCUTTER_CAMP)
        previous_built = self.woodcutter_camps_built
        previous_workers = self.workers_assigned_woodcutter
        previous_capacity = self.wood_max_capacity
        previous_max_workers = self.max_workers_woodcutter
        previous_wood = self.wood
        previous_rate = self.wood_production_per_second

        built = woodcutter.built_count if woodcutter else 0
        built = max(0, int(built))
        self.woodcutter_camps_built = built

        max_workers = built * 2
        self.max_workers_woodcutter = max_workers

        assigned = max(0, int(woodcutter.assigned_workers)) if woodcutter else 0
        if assigned > max_workers:
            assigned = max_workers
            if woodcutter:
                woodcutter.assigned_workers = assigned
        if built == 0:
            if woodcutter and woodcutter.assigned_workers != 0:
                woodcutter.assigned_workers = 0
            assigned = 0
        self.workers_assigned_woodcutter = assigned

        capacity = 50.0 * built
        current_capacity = self.inventory.get_capacity(Resource.WOOD) or 0.0
        if abs(current_capacity - capacity) > 1e-9:
            self.inventory.set_capacity(Resource.WOOD, capacity)
        self.wood_max_capacity = capacity

        current_amount = max(0.0, self.inventory.get_amount(Resource.WOOD))
        limit = capacity
        if current_amount > limit + 1e-9:
            current_amount = limit
            self.inventory.set_amount(Resource.WOOD, current_amount)
        if built == 0 and current_amount > 0.0:
            current_amount = 0.0
            self.inventory.set_amount(Resource.WOOD, 0.0)
        self.wood = current_amount

        rate = assigned * 0.1 if built > 0 else 0.0
        self.wood_production_per_second = rate

        return (
            previous_built != self.woodcutter_camps_built
            or previous_workers != self.workers_assigned_woodcutter
            or abs(previous_capacity - self.wood_max_capacity) > 1e-9
            or previous_max_workers != self.max_workers_woodcutter
            or abs(previous_wood - self.wood) > 1e-9
            or abs(previous_rate - self.wood_production_per_second) > 1e-9
        )

    # ------------------------------------------------------------------
    def snapshot_hud(self) -> Dict[str, object]:
        return {
            "season": self.season_snapshot,
            "resources": [
                {
                    "key": resource.value,
                    "amount": self.inventory.get_amount(resource),
                    "capacity": self.inventory.get_capacity(resource),
                }
                for resource in ALL_RESOURCES
            ],
            "warnings": list(self.notifications),
        }

    def snapshot_buildings(self) -> List[Dict[str, object]]:
        return [self._build_building_snapshot(building) for building in self.buildings.values()]

    def snapshot_building(self, building_id: str) -> Dict[str, object]:
        canonical_id = self._canonical_building_id(building_id)
        building = self.buildings.get(canonical_id)
        if building is None:
            raise ValueError("Edificio inexistente")
        return self._build_building_snapshot(building)

    def snapshot_state(self) -> Dict[str, object]:
        with self._lock:
            version = int(self._state_version)
        return {
            "season": self.season_clock.to_dict(),
            "buildings": self.snapshot_buildings(),
            "inventory": self.inventory_snapshot(),
            "resources": self.resources_snapshot(),
            "jobs": self.snapshot_jobs(),
            "trade": self.snapshot_trade(),
            "notifications": self.list_notifications(),
            "population": self.population_snapshot(),
            "wood_state": self.wood_state_snapshot(),
            "version": version,
        }

    def production_reports_snapshot(self) -> Dict[int, Dict[str, object]]:
        snapshot: Dict[int, Dict[str, object]] = {}
        for building in self.buildings.values():
            snapshot[building.id] = self._building_last_report(building)
        return snapshot

    def snapshot_jobs(self) -> Dict[str, object]:
        return {
            "available_workers": self.worker_pool.available_workers,
            "total_workers": self.worker_pool.total_workers,
            "buildings": {
                building_id: {
                    "assigned": building.assigned_workers,
                    "max": building.max_workers,
                }
                for building_id, building in self.buildings.items()
            },
        }

    def population_snapshot(self) -> Dict[str, int]:
        with self._lock:
            current = int(self.population_current)
            capacity = int(self.population_capacity)
            available = int(self.worker_pool.available_workers)
        available = max(0, min(current, available))
        return {"current": current, "capacity": capacity, "available": available}

    def snapshot_trade(self) -> Dict[str, Dict[str, float | str]]:
        return self.trade_manager.snapshot()

    def inventory_snapshot(self) -> Dict[str, Dict[str, float | None]]:
        return self.inventory.snapshot()

    def resources_snapshot(self) -> Dict[str, float]:
        return {
            resource.value: self.inventory.get_amount(resource)
            for resource in ALL_RESOURCES
        }

    # ------------------------------------------------------------------
    def _sync_season_state(self) -> None:
        self.season_snapshot = self.season_clock.to_dict()
        self.season = self.season_snapshot["season_name"]
        self.season_time_left_sec = self.season_clock.get_time_left()

    # ------------------------------------------------------------------
    def _build_building_snapshot(self, building: Building) -> Dict[str, object]:
        snapshot = building.to_snapshot()
        modifiers = self.get_production_modifiers(building)
        effective_rate = building.effective_rate(building.assigned_workers, modifiers)
        modifier_payload = self.season_clock.modifiers_payload(building.type_key)
        modifier_payload["total_multiplier"] = float(modifier_payload["total_multiplier"])
        can_produce, reason = self._building_can_produce(building, effective_rate)
        pending_eta = self._building_pending_eta(building, effective_rate)
        last_report = self._building_last_report(building)

        snapshot.update(
            {
                "effective_rate": effective_rate,
                "can_produce": can_produce,
                "reason": reason,
                "pending_eta": pending_eta,
                "last_report": last_report,
                "production_report": last_report,
                "modifiers_applied": modifier_payload,
            }
        )
        per_minute_output = building.per_minute_output()
        if per_minute_output:
            snapshot["per_minute_output"] = {
                resource.value: amount for resource, amount in per_minute_output.items()
            }
            wood_rate = per_minute_output.get(Resource.WOOD)
            if wood_rate is not None:
                snapshot["produces_per_min"] = float(wood_rate)
                snapshot["produces_unit"] = "wood/min"
        return snapshot

    def _building_last_report(self, building: Building) -> Dict[str, object]:
        report = self.last_production_reports.get(building.id, building.production_report)
        return {
            "status": report.get("status"),
            "reason": report.get("reason"),
            "detail": report.get("detail"),
            "consumed": dict(report.get("consumed", {})),
            "produced": dict(report.get("produced", {})),
        }

    # ------------------------------------------------------------------
    def _update_missing_input_notifications(
        self,
        building: Building,
        report: Dict[str, object],
        active_missing: Set[Tuple[str, Resource]],
    ) -> None:
        if report.get("status") != "stalled" or report.get("reason") != "missing_input":
            return

        detail = report.get("detail")
        resource = self._resolve_missing_resource(building, detail)
        if resource is None:
            return

        key = (building.type_key, resource)
        active_missing.add(key)
        message = self._format_missing_notification(building, resource)
        existing = self._active_missing_notifications.get(key)
        if existing == message:
            return
        if existing:
            self._remove_notification_message(existing)
        self._enqueue_unique_notification(message)
        self._active_missing_notifications[key] = message

    def _cleanup_missing_notifications(self, active_missing: Set[Tuple[str, Resource]]) -> None:
        for key, message in list(self._active_missing_notifications.items()):
            if key not in active_missing:
                self._active_missing_notifications.pop(key, None)
                self._remove_notification_message(message)

    def _resolve_missing_resource(
        self, building: Building, detail: object
    ) -> Optional[Resource]:
        if isinstance(detail, str):
            try:
                return Resource(detail)
            except ValueError:
                pass
        if isinstance(detail, Resource):
            return detail

        for resource, amount in building.inputs_per_cycle.items():
            if amount <= 0:
                continue
            if self.inventory.get_amount(resource) + 1e-9 < amount:
                return resource
        for resource, amount in building.maintenance_per_cycle.items():
            if amount <= 0:
                continue
            if self.inventory.get_amount(resource) + 1e-9 < amount:
                return resource
        return None

    def _format_missing_notification(self, building: Building, resource: Resource) -> str:
        readable_resource = resource.value.title()
        message = f"{building.name} parado: falta {readable_resource}"
        channel = self.trade_manager.channels.get(resource)
        if channel and channel.mode == "import":
            message += " (resoluble via import)"
        return message

    def _enqueue_unique_notification(self, message: str) -> None:
        if message in self.notifications:
            return
        self.notifications.append(message)

    def _remove_notification_message(self, message: str) -> None:
        try:
            self.notifications.remove(message)
        except ValueError:
            pass

    def _building_pending_eta(self, building: Building, effective_rate: float) -> Optional[float]:
        if effective_rate <= 0:
            return None
        remaining_progress = max(0.0, building.cycle_time_sec - building.cycle_progress)
        return remaining_progress / effective_rate if remaining_progress > 0 else 0.0

    def _building_can_produce(
        self, building: Building, effective_rate: float
    ) -> Tuple[bool, Optional[str]]:
        inactive_reason = building._inactive_reason()
        if inactive_reason:
            return False, inactive_reason

        if effective_rate <= 0:
            return False, "inactive"

        maintenance = dict(building.maintenance_per_cycle)
        inputs = dict(building.inputs_per_cycle)

        if maintenance and not self.inventory.has(maintenance):
            return False, "missing_maintenance"
        if inputs and not self.inventory.has(inputs):
            return False, "missing_input"

        combined = Building._combine_resources(inputs, maintenance)
        if combined and not self.inventory.has(combined):
            return False, "missing_input"

        outputs = dict(building.outputs_per_cycle)
        if outputs and not self.inventory.can_add(outputs):
            return False, "no_capacity"

        return True, None


def get_game_state() -> GameState:
    return GameState.get_instance()
