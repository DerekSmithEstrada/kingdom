"""Simple resource ledger used by the new building system."""

from __future__ import annotations

from collections import defaultdict
from typing import Dict, Iterable, Mapping


class ResourceLedger:
    """Minimal helper to manage resources with no capacity limits."""

    def __init__(self, initial: Mapping[str, float] | None = None) -> None:
        self._amounts: Dict[str, float] = defaultdict(float)
        if initial:
            for resource, amount in initial.items():
                self._amounts[resource] = float(amount)

    # ------------------------------------------------------------------
    def snapshot(self) -> Dict[str, float]:
        return {key: float(amount) for key, amount in self._amounts.items() if amount}

    def get(self, resource: str) -> float:
        return float(self._amounts.get(resource, 0.0))

    def add(self, delta: Mapping[str, float]) -> None:
        for resource, amount in delta.items():
            if amount == 0:
                continue
            self._amounts[resource] = self.get(resource) + float(amount)

    def has(self, requirements: Mapping[str, float]) -> bool:
        return all(self.get(res) + 1e-9 >= amount for res, amount in requirements.items())

    def consume(self, requirements: Mapping[str, float]) -> bool:
        if not self.has(requirements):
            return False
        for resource, amount in requirements.items():
            if amount == 0:
                continue
            self._amounts[resource] = max(0.0, self.get(resource) - float(amount))
        return True

    def ensure(self, resources: Iterable[str]) -> None:
        for resource in resources:
            self._amounts.setdefault(resource, 0.0)

    def set_amount(self, resource: str, amount: float) -> None:
        self._amounts[resource] = max(0.0, float(amount))

