"""Worker pool management for buildings.""" 
from __future__ import annotations

from typing import Dict

from .buildings import Building


class WorkerAllocationError(Exception):
    """Raised when a worker assignment request cannot be fulfilled."""


class WorkerPool:
    """Controls worker assignments across buildings."""

    def __init__(self, total_workers: int) -> None:
        self.total_workers = total_workers
        self._buildings: Dict[int, Building] = {}

    # ------------------------------------------------------------------
    @property
    def available_workers(self) -> int:
        assigned = sum(
            max(0, building.assigned_workers) for building in self._buildings.values()
        )
        return max(0, self.total_workers - assigned)

    def register_building(self, building: Building) -> None:
        self._buildings[building.id] = building

    def unregister_building(self, building_id: int) -> int:
        building = self._buildings.pop(building_id, None)
        if building is None:
            return 0
        removed = max(0, building.assigned_workers)
        building.assigned_workers = 0
        return removed

    def get_assignment(self, building_id: int) -> int:
        building = self._buildings.get(building_id)
        if building is None:
            return 0
        return max(0, building.assigned_workers)

    # ------------------------------------------------------------------
    def assign_workers(self, building: Building, number: int) -> int:
        if number <= 0:
            return 0
        self.register_building(building)
        room = building.max_workers - building.assigned_workers
        if room <= 0:
            raise WorkerAllocationError("Capacidad máxima del edificio alcanzada")
        available = self.available_workers
        if available <= 0:
            raise WorkerAllocationError("No hay población disponible")
        if number > available:
            raise WorkerAllocationError("No hay suficientes trabajadores disponibles")
        if number > room:
            raise WorkerAllocationError("Capacidad máxima del edificio alcanzada")
        building.assigned_workers += number
        return number

    def unassign_workers(self, building: Building, number: int) -> int:
        if number <= 0:
            return 0
        current = self.get_assignment(building.id)
        removed = min(number, current)
        if removed <= 0:
            return 0
        building.assigned_workers = max(0, building.assigned_workers - removed)
        return removed

    def set_assignment(self, building: Building, number: int) -> None:
        value = max(0, min(int(number), building.max_workers))
        self.register_building(building)
        building.assigned_workers = value

    # ------------------------------------------------------------------
    def snapshot(self) -> Dict[int, Dict[str, int]]:
        return {
            building_id: {"assigned": max(0, building.assigned_workers)}
            for building_id, building in self._buildings.items()
        }

    def set_total_workers(self, total: int) -> None:
        self.total_workers = max(0, total)

    def bulk_load_assignments(self, assignments: Dict[int, int]) -> None:
        if not assignments:
            self._buildings = {}
            return
        for building_id, value in assignments.items():
            building = self._buildings.get(int(building_id))
            if building is None:
                continue
            self.set_assignment(building, int(value))

    def bulk_export_assignments(self) -> Dict[int, int]:
        return {
            building_id: max(0, building.assigned_workers)
            for building_id, building in self._buildings.items()
        }
