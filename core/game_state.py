"""Core singleton storing all game state."""

from __future__ import annotations

from collections import deque
from typing import Deque, Dict, List, Optional

from . import config
from .buildings import Building, build_from_config
from .inventory import Inventory
from .jobs import WorkerPool
from .resources import ALL_RESOURCES, Resource
from .timeclock import SeasonClock
from .trade import TradeManager


class GameState:
    """Central storage for all mutable game data."""

    _instance: Optional["GameState"] = None

    def __init__(self) -> None:
        self.notifications: Deque[str] = deque(maxlen=config.NOTIFICATION_QUEUE_LIMIT)
        self.season_clock = SeasonClock()
        self._sync_season_state()
        self.inventory = Inventory()
        self.inventory.set_notifier(self.add_notification)
        self.worker_pool = WorkerPool(config.WORKERS_INICIALES)
        self.buildings: Dict[int, Building] = {}
        self.trade_manager = TradeManager(config.TRADE_DEFAULTS)
        self._initialise_inventory()
        self.last_production_reports: Dict[int, Dict[str, object]] = {}

    # ------------------------------------------------------------------
    @classmethod
    def get_instance(cls) -> "GameState":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def reset(self) -> None:
        self.notifications.clear()
        self.season_clock = SeasonClock()
        self._sync_season_state()
        self.inventory = Inventory()
        self.inventory.set_notifier(self.add_notification)
        self._initialise_inventory()
        self.worker_pool = WorkerPool(config.WORKERS_INICIALES)
        self.buildings = {}
        Building.reset_ids()
        self.trade_manager = TradeManager(config.TRADE_DEFAULTS)
        self.last_production_reports = {}

    # ------------------------------------------------------------------
    def _initialise_inventory(self) -> None:
        for resource in ALL_RESOURCES:
            amount = config.STARTING_RESOURCES.get(resource, 0.0)
            self.inventory.set_amount(resource, float(amount))
            capacity = config.CAPACIDADES.get(resource)
            if capacity is not None:
                self.inventory.set_capacity(resource, float(capacity))

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
        self.season_clock.update(dt)
        self._sync_season_state()

        self.trade_manager.tick(dt, self.inventory, self.add_notification)

        self.last_production_reports = {}
        for building in list(self.buildings.values()):
            modifiers = self.get_production_modifiers(building)
            report = building.tick(dt, self.inventory, self.add_notification, modifiers)
            self.last_production_reports[building.id] = report

    def get_production_modifiers(self, building: Building) -> Dict[str, float]:
        season_mod = config.SEASON_MODIFIERS.get(self.season, {})
        return {
            "global": float(season_mod.get("global", 1.0)),
            building.type_key: float(season_mod.get(building.type_key, 1.0)),
        }

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
        return [building.to_snapshot() for building in self.buildings.values()]

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

    def snapshot_trade(self) -> Dict[str, Dict[str, float | str]]:
        return self.trade_manager.snapshot()

    def inventory_snapshot(self) -> Dict[str, Dict[str, float | None]]:
        return self.inventory.snapshot()

    # ------------------------------------------------------------------
    def _sync_season_state(self) -> None:
        self.season_snapshot = self.season_clock.to_dict()
        self.season = self.season_snapshot["season_name"]
        self.season_time_left_sec = self.season_clock.get_time_left()


def get_game_state() -> GameState:
    return GameState.get_instance()
