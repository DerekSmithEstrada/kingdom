"""Worker pool management for buildings.""" 
from __future__ import annotations

from typing import Dict

from .buildings import Building


class WorkerPool:
    """Controls worker assignments across buildings."""

    def __init__(self, total_workers: int) -> None:
        self.total_workers = total_workers
        self._assignments: Dict[int, int] = {}

    # ------------------------------------------------------------------
    @property
    def available_workers(self) -> int:
        assigned = sum(self._assignments.values())
        return max(0, self.total_workers - assigned)

    def register_building(self, building: Building) -> None:
        self._assignments.setdefault(building.id, building.assigned_workers)

    def unregister_building(self, building_id: int) -> int:
        return self._assignments.pop(building_id, 0)

    def get_assignment(self, building_id: int) -> int:
        return self._assignments.get(building_id, 0)

    # ------------------------------------------------------------------
    def assign_workers(self, building: Building, number: int) -> int:
        if number <= 0:
            return 0
        self.register_building(building)
        room = building.max_workers - building.assigned_workers
        if room <= 0:
            return 0
        allowed = min(number, room, self.available_workers)
        if allowed <= 0:
            return 0
        building.assigned_workers += allowed
        self._assignments[building.id] = building.assigned_workers
        return allowed

    def unassign_workers(self, building: Building, number: int) -> int:
        if number <= 0:
            return 0
        current = self.get_assignment(building.id)
        removed = min(number, current)
        if removed <= 0:
            return 0
        building.assigned_workers = max(0, building.assigned_workers - removed)
        self._assignments[building.id] = building.assigned_workers
        return removed

    def set_assignment(self, building: Building, number: int) -> None:
        value = max(0, min(int(number), building.max_workers))
        building.assigned_workers = value
        self._assignments[building.id] = value

    # ------------------------------------------------------------------
    def snapshot(self) -> Dict[int, Dict[str, int]]:
        return {
            building_id: {"assigned": assigned}
            for building_id, assigned in self._assignments.items()
        }

    def set_total_workers(self, total: int) -> None:
        self.total_workers = max(0, total)

    def bulk_load_assignments(self, assignments: Dict[int, int]) -> None:
        self._assignments = {int(k): int(v) for k, v in assignments.items()}

    def bulk_export_assignments(self) -> Dict[int, int]:
        return dict(self._assignments)
