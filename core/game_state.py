"""Core singleton storing all game state."""

from __future__ import annotations

import logging
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


class GameState:
    """Central storage for all mutable game data."""

    _instance: Optional["GameState"] = None

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._wood_tick_residual = 0.0
        self._wood_tick_anchor: Optional[float] = None
        self._tick_count = 0
        self.notifications: Deque[str] = deque(maxlen=config.NOTIFICATION_QUEUE_LIMIT)
        self.last_production_reports: Dict[int, Dict[str, object]] = {}
        self._active_missing_notifications: Dict[Tuple[str, Resource], str] = {}
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
        self._wood_tick_residual = 0.0
        self._wood_tick_anchor = None
        self._tick_count = 0
        self.notifications.clear()
        self.season_clock = SeasonClock(season_modifiers=config.SEASON_MODIFIERS)
        self._sync_season_state()
        self.inventory = Inventory()
        self.inventory.set_notifier(self.add_notification)
        self.population_current = int(config.POPULATION_INITIAL)
        self.population_capacity = int(config.POPULATION_CAPACITY)
        self.worker_pool = WorkerPool(self.population_current)
        self.buildings = {}
        Building.reset_ids()
        self.trade_manager = TradeManager(config.TRADE_DEFAULTS)
        self._initialise_inventory()
        self.last_production_reports = {}
        self._active_missing_notifications = {}
        self._initialise_starting_buildings()

    # ------------------------------------------------------------------
    def _initialise_inventory(self) -> None:
        for resource in ALL_RESOURCES:
            amount = config.STARTING_RESOURCES.get(resource, 0.0)
            self.inventory.set_amount(resource, float(amount))
            capacity = config.CAPACIDADES.get(resource)
            if capacity is not None:
                self.inventory.set_capacity(resource, float(capacity))

    def _initialise_starting_buildings(self) -> None:
        for entry in config.STARTING_BUILDINGS:
            type_key: Optional[str] = None
            workers = 0
            enabled = True

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
            elif isinstance(entry, (tuple, list)) and entry:
                raw_type = entry[0]
                if isinstance(raw_type, str):
                    type_key = raw_type
                if len(entry) > 1:
                    try:
                        workers = int(entry[1])
                    except (TypeError, ValueError):
                        workers = 0
            elif isinstance(entry, str):
                type_key = entry

            if not type_key or type_key not in config.BUILDING_RECIPES:
                continue

            building = build_from_config(type_key)
            building.enabled = enabled
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
        wood_baseline = self.inventory.get_amount(Resource.WOOD)
        self.season_clock.update(dt)
        self._sync_season_state()

        self.trade_manager.tick(dt, self.inventory, self.add_notification)

        self.last_production_reports = {}
        active_missing: Set[Tuple[str, Resource]] = set()
        for building in list(self.buildings.values()):
            modifiers = self.get_production_modifiers(building)
            report = building.tick(dt, self.inventory, self.add_notification, modifiers)
            self.last_production_reports[building.id] = report
            self._update_missing_input_notifications(building, report, active_missing)
        self._cleanup_missing_notifications(active_missing)
        self._apply_simple_resource_tick(dt, wood_baseline)
        with self._lock:
            self._tick_count += 1
            if self._tick_count % 5 == 0:
                wood_amount = self.inventory.get_amount(Resource.WOOD)
                woodcutter = self.get_building_by_type(config.WOODCUTTER_CAMP)
                workers = woodcutter.assigned_workers if woodcutter else 0
                logger.info(
                    "Tick %s summary: wood=%.1f workers=%s",
                    self._tick_count,
                    round(wood_amount, 1),
                    workers,
                )

    def get_production_modifiers(self, building: Building) -> Dict[str, float]:
        return self.season_clock.get_modifiers(building.type_key)

    # ------------------------------------------------------------------
    def build_building(self, type_key: str) -> Building:
        if type_key not in config.BUILDING_RECIPES:
            raise ValueError(f"Tipo de edificio desconocido: {type_key}")
        cost = config.COSTOS_CONSTRUCCION.get(type_key, {})
        missing = self._missing_resources(cost)
        if missing:
            raise ValueError(missing)
        if cost:
            self.inventory.consume(cost)
        building = build_from_config(type_key)
        self.buildings[building.id] = building
        self.worker_pool.register_building(building)
        self.add_notification(f"Construido {building.name}")
        return building

    def demolish_building(self, building_id: int, refund_rate: float = 0.5) -> Building:
        building = self.buildings.pop(building_id, None)
        if building is None:
            raise ValueError("Edificio inexistente")
        refund = {
            resource: amount * refund_rate
            for resource, amount in config.COSTOS_CONSTRUCCION.get(building.type_key, {}).items()
        }
        if refund:
            self.inventory.add(refund)
        self.worker_pool.unregister_building(building_id)
        building.assigned_workers = 0
        self.add_notification(f"{building.name} demolido")
        return building

    def toggle_building(self, building_id: int, enabled: bool) -> None:
        building = self.buildings.get(building_id)
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

    # ------------------------------------------------------------------
    def assign_workers(self, building_id: int, number: int) -> int:
        building = self.buildings.get(building_id)
        if building is None:
            raise ValueError("Edificio inexistente")
        return self.worker_pool.assign_workers(building, number)

    def unassign_workers(self, building_id: int, number: int) -> int:
        building = self.buildings.get(building_id)
        if building is None:
            raise ValueError("Edificio inexistente")
        return self.worker_pool.unassign_workers(building, number)

    def get_building(self, building_id: int) -> Optional[Building]:
        return self.buildings.get(building_id)

    def get_building_by_type(self, type_key: str) -> Optional[Building]:
        for building in self.buildings.values():
            if building.type_key == type_key:
                return building
        return None

    def basic_state_snapshot(self) -> Dict[str, object]:
        with self._lock:
            items = {
                resource.value.lower(): round(
                    self.inventory.get_amount(resource), 1
                )
                for resource in ALL_RESOURCES
            }
            woodcutter = self.get_building_by_type(config.WOODCUTTER_CAMP)
            workers = woodcutter.assigned_workers if woodcutter else 0
            population = self.population_snapshot()
        return {
            "items": items,
            "buildings": {
                config.WOODCUTTER_CAMP: {
                    "workers": int(workers),
                }
            },
            "population": population,
        }

    def _apply_simple_resource_tick(self, dt: float, baseline: float) -> None:
        if dt is None:
            return
        seconds = float(dt)
        if seconds <= 0:
            return
        with self._lock:
            if self._wood_tick_anchor is None:
                self._wood_tick_anchor = round(float(baseline), 1)
                self.inventory.set_amount(Resource.WOOD, self._wood_tick_anchor)
            self._wood_tick_residual += seconds
            whole_seconds = int(self._wood_tick_residual)
            if whole_seconds <= 0:
                return
            self._wood_tick_residual -= whole_seconds
            current = self._wood_tick_anchor
            for _ in range(whole_seconds):
                current = self._increment_wood_locked(current)
            self._wood_tick_anchor = current
            self.inventory.set_amount(Resource.WOOD, current)
            if self._wood_tick_residual <= 1e-9:
                self._wood_tick_residual = 0.0
                self._wood_tick_anchor = None

    def _increment_wood_locked(self, current: float) -> float:
        woodcutter = self.get_building_by_type(config.WOODCUTTER_CAMP)
        if woodcutter and woodcutter.assigned_workers >= 1:
            current += 0.1
        return round(current, 1)

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

    def snapshot_building(self, building_id: int) -> Dict[str, object]:
        building = self.buildings.get(building_id)
        if building is None:
            raise ValueError("Edificio inexistente")
        return self._build_building_snapshot(building)

    def snapshot_state(self) -> Dict[str, object]:
        return {
            "season": self.season_clock.to_dict(),
            "buildings": self.snapshot_buildings(),
            "inventory": self.inventory_snapshot(),
            "resources": self.resources_snapshot(),
            "jobs": self.snapshot_jobs(),
            "trade": self.snapshot_trade(),
            "notifications": self.list_notifications(),
            "population": self.population_snapshot(),
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
        return {"current": current, "capacity": capacity}

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
