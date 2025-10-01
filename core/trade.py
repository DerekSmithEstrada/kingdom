"""Trading system management."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

from .inventory import Inventory
from .resources import Resource


@dataclass
class TradeChannel:
    resource: Resource
    mode: str
    rate_per_min: float
    price_per_unit: float

    def set_mode(self, mode: str) -> None:
        if mode not in {"pause", "import", "export"}:
            raise ValueError(f"Modo de comercio desconocido: {mode}")
        self.mode = mode

    def set_rate(self, rate: float) -> None:
        self.rate_per_min = max(0.0, rate)

    def tick(self, dt: float, inventory: Inventory, notify) -> None:
        amount = self.rate_per_min * dt / 60.0
        if self.mode == "pause" or amount <= 0:
            return
        if self.mode == "import":
            self._handle_import(amount, inventory, notify)
        elif self.mode == "export":
            self._handle_export(amount, inventory, notify)

    def _handle_import(self, amount: float, inventory: Inventory, notify) -> None:
        cost = amount * self.price_per_unit
        available_gold = inventory.get_amount(Resource.GOLD)
        if cost > available_gold + 1e-9:
            if self.price_per_unit <= 0:
                return
            possible_amount = available_gold / self.price_per_unit
            if possible_amount <= 1e-6:
                self.mode = "pause"
                notify(f"Comercio de {self.resource.value} pausado: falta GOLD")
                return
            amount = possible_amount
            cost = amount * self.price_per_unit
            notify(
                f"Comercio de {self.resource.value}: importación reducida por falta de GOLD"
            )
        if cost > 0:
            inventory.consume({Resource.GOLD: cost})
        residual = inventory.add({self.resource: amount})
        leftover = residual.get(self.resource, 0.0)
        if leftover > 1e-6:
            refund = leftover * self.price_per_unit
            if refund > 0:
                inventory.add({Resource.GOLD: refund})
            if leftover >= amount - 1e-6:
                self.mode = "pause"
                notify(
                    f"Comercio de {self.resource.value} pausado: almacén sin espacio"
                )
            else:
                notify(
                    f"Comercio de {self.resource.value}: importación limitada por capacidad"
                )

    def _handle_export(self, amount: float, inventory: Inventory, notify) -> None:
        available = inventory.get_amount(self.resource)
        if available <= 1e-6:
            self.mode = "pause"
            notify(f"Comercio de {self.resource.value} pausado: sin stock")
            return
        actual = min(amount, available)
        inventory.consume({self.resource: actual})
        gold_gain = actual * self.price_per_unit
        inventory.add({Resource.GOLD: gold_gain})
        if actual < amount - 1e-6:
            notify(
                f"Comercio de {self.resource.value}: exportación limitada por bajo stock"
            )


class TradeManager:
    """Manages trade channels for all resources."""

    def __init__(self, defaults: Dict[Resource, Dict[str, float | str]]) -> None:
        self.channels: Dict[Resource, TradeChannel] = {}
        for resource, info in defaults.items():
            self.channels[resource] = TradeChannel(
                resource=resource,
                mode=str(info.get("mode", "pause")),
                rate_per_min=float(info.get("rate", 0.0)),
                price_per_unit=float(info.get("price", 0.0)),
            )

    def tick(self, dt: float, inventory: Inventory, notify) -> None:
        for channel in self.channels.values():
            channel.tick(dt, inventory, notify)

    def get_channel(self, resource: Resource) -> TradeChannel:
        return self.channels[resource]

    def snapshot(self) -> Dict[str, Dict[str, float | str]]:
        snapshot: Dict[str, Dict[str, float | str]] = {}
        for resource, channel in self.channels.items():
            estimate = 0.0
            if channel.mode == "import":
                estimate = channel.rate_per_min
            elif channel.mode == "export":
                estimate = -channel.rate_per_min
            snapshot[resource.value] = {
                "mode": channel.mode,
                "rate_per_min": channel.rate_per_min,
                "price": channel.price_per_unit,
                "estimate_per_min": estimate,
            }
        return snapshot

    def bulk_load(self, data: Dict[str, Dict[str, float | str]]) -> None:
        for key, info in data.items():
            resource = Resource(key)
            channel = self.channels.get(resource)
            if channel is None:
                continue
            channel.mode = str(info.get("mode", channel.mode))
            channel.rate_per_min = float(info.get("rate", channel.rate_per_min))
            channel.price_per_unit = float(info.get("price", channel.price_per_unit))

    def bulk_export(self) -> Dict[str, Dict[str, float | str]]:
        return {
            resource.value: {
                "mode": channel.mode,
                "rate": channel.rate_per_min,
                "price": channel.price_per_unit,
            }
            for resource, channel in self.channels.items()
        }
