"""Inventory handling for all game resources."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Dict, Iterable, Optional

from .resources import ALL_RESOURCES, Resource

Notifier = Optional[Callable[[str], None]]


@dataclass
class Inventory:
    """Represents resource storage and capacities."""

    quantities: Dict[Resource, float] = field(default_factory=dict)
    capacities: Dict[Resource, float] = field(default_factory=dict)
    notifier: Notifier = None

    def __post_init__(self) -> None:
        for resource in ALL_RESOURCES:
            self.quantities.setdefault(resource, 0.0)

    # Utility methods -------------------------------------------------
    def _notify(self, message: str) -> None:
        if self.notifier:
            self.notifier(message)

    def set_notifier(self, notifier: Notifier) -> None:
        """Assign a notifier callback used to communicate events."""

        self.notifier = notifier

    # Capacity helpers ------------------------------------------------
    def get_capacity(self, resource: Resource) -> Optional[float]:
        return self.capacities.get(resource)

    def set_capacity(self, resource: Resource, capacity: float) -> None:
        self.capacities[resource] = max(0.0, capacity)
        current = self.quantities.get(resource, 0.0)
        if current > capacity:
            self.quantities[resource] = capacity
            self._notify(f"Capacidad ajustada para {resource.value}: excedente descartado")

    def _remaining_capacity(self, resource: Resource) -> Optional[float]:
        capacity = self.get_capacity(resource)
        if capacity is None:
            return None
        return max(0.0, capacity - self.quantities.get(resource, 0.0))

    # Quantities ------------------------------------------------------
    def get_amount(self, resource: Resource) -> float:
        return self.quantities.get(resource, 0.0)

    def set_amount(self, resource: Resource, amount: float) -> None:
        self.quantities[resource] = max(0.0, amount)

    def has(self, requirements: Dict[Resource, float]) -> bool:
        return all(self.get_amount(res) + 1e-9 >= amount for res, amount in requirements.items())

    def consume(self, resources: Dict[Resource, float]) -> bool:
        if not self.has(resources):
            return False
        for resource, amount in resources.items():
            if amount <= 0:
                continue
            self.quantities[resource] = max(0.0, self.quantities.get(resource, 0.0) - amount)
        return True

    def add(self, resources: Dict[Resource, float]) -> Dict[Resource, float]:
        residual: Dict[Resource, float] = {}
        for resource, amount in resources.items():
            if amount <= 0:
                continue
            current = self.quantities.get(resource, 0.0)
            capacity = self.get_capacity(resource)
            if capacity is None:
                self.quantities[resource] = max(0.0, current + amount)
                continue

            allowed = min(amount, max(0.0, capacity - current))
            self.quantities[resource] = max(0.0, current + allowed)
            leftover = amount - allowed
            if leftover > 1e-9:
                residual[resource] = leftover
            if self.quantities[resource] >= capacity - 1e-6:
                self._notify(f"Almacén lleno para {resource.value}")
        return residual

    def snapshot(self) -> Dict[str, Dict[str, float | None]]:
        data: Dict[str, Dict[str, float | None]] = {}
        for resource in ALL_RESOURCES:
            data[resource.value] = {
                "amount": self.get_amount(resource),
                "capacity": self.get_capacity(resource),
            }
        return data

    def bulk_load(self, quantities: Dict[str, float], capacities: Dict[str, float]) -> None:
        for key, amount in quantities.items():
            resource = Resource(key)
            self.quantities[resource] = max(0.0, float(amount))
        for key, capacity in capacities.items():
            resource = Resource(key)
            self.capacities[resource] = max(0.0, float(capacity))

    def bulk_export(self) -> Dict[str, Dict[str, float]]:
        return {
            "quantities": {res.value: amount for res, amount in self.quantities.items()},
            "capacities": {res.value: cap for res, cap in self.capacities.items()},
        }

    def ensure_resources(self, resources: Iterable[Resource]) -> None:
        for resource in resources:
            self.quantities.setdefault(resource, 0.0)
