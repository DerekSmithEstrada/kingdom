import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import config
from core.buildings import build_from_config
from core.inventory import Inventory
from core.resources import Resource


def _inventory_with_capacities() -> Inventory:
    inventory = Inventory()
    for resource, capacity in config.CAPACIDADES.items():
        inventory.set_capacity(resource, capacity)
    return inventory


def _tick(building, inventory, seconds=60.0):
    return building.tick(seconds, inventory, lambda *_: None, modifiers=1.0)


def test_lumber_camp_produces_wood():
    inventory = _inventory_with_capacities()
    building = build_from_config(config.LUMBER_CAMP)
    building.built = 1
    building.assigned_workers = building.max_workers

    report = _tick(building, inventory)

    assert report["status"] == "produced"
    assert inventory.get_amount(Resource.WOOD) == pytest.approx(6.0)


def test_sawmill_requires_wood_and_produces_planks():
    inventory = _inventory_with_capacities()
    building = build_from_config(config.SAWMILL)
    building.built = 1
    building.assigned_workers = building.max_workers

    report = _tick(building, inventory)
    assert report["status"] == "stalled"
    assert report["reason"] == "missing_input"
    assert inventory.get_amount(Resource.PLANK) == pytest.approx(0.0)

    inventory.set_amount(Resource.WOOD, 10.0)
    building = build_from_config(config.SAWMILL)
    building.built = 1
    building.assigned_workers = building.max_workers
    report = _tick(building, inventory)

    assert report["status"] == "produced"
    assert inventory.get_amount(Resource.WOOD) == pytest.approx(6.0)
    assert inventory.get_amount(Resource.PLANK) == pytest.approx(4.0)


def test_brewery_consumes_multiple_inputs():
    inventory = _inventory_with_capacities()
    building = build_from_config(config.BREWERY)
    building.built = 1
    building.assigned_workers = building.max_workers

    inventory.set_amount(Resource.WHEAT, 5.0)
    inventory.set_amount(Resource.HOPS, 5.0)
    inventory.set_amount(Resource.WATER, 10.0)

    report = _tick(building, inventory)

    assert report["status"] == "produced"
    assert inventory.get_amount(Resource.BEER) == pytest.approx(4.0)
    assert inventory.get_amount(Resource.WHEAT) == pytest.approx(3.0)
    assert inventory.get_amount(Resource.HOPS) == pytest.approx(3.0)
    assert inventory.get_amount(Resource.WATER) == pytest.approx(7.0)


def test_market_stall_converts_goods_into_happiness_and_gold():
    inventory = _inventory_with_capacities()
    building = build_from_config(config.MARKET_STALL)
    building.built = 1
    building.assigned_workers = building.max_workers

    inventory.set_amount(Resource.BERRIES, 5.0)
    inventory.set_amount(Resource.BREAD, 3.0)
    inventory.set_amount(Resource.CHEESE, 2.0)

    report = _tick(building, inventory)

    assert report["status"] == "produced"
    assert inventory.get_amount(Resource.HAPPINESS) == pytest.approx(4.0)
    assert inventory.get_amount(Resource.GOLD) == pytest.approx(2.0)


def test_apiary_produces_multiple_outputs():
    inventory = _inventory_with_capacities()
    building = build_from_config(config.APIARY)
    building.built = 1
    building.assigned_workers = building.max_workers

    report = _tick(building, inventory)

    assert report["status"] == "produced"
    assert inventory.get_amount(Resource.HONEY) == pytest.approx(4.0)
    assert inventory.get_amount(Resource.WAX) == pytest.approx(2.0)


def test_multiple_instances_scale_production():
    inventory = _inventory_with_capacities()
    building_one = build_from_config(config.BREWERY)
    building_two = build_from_config(config.BREWERY)

    for building in (building_one, building_two):
        building.built = 1
        building.assigned_workers = building.max_workers

    inventory.set_amount(Resource.WHEAT, 20.0)
    inventory.set_amount(Resource.HOPS, 20.0)
    inventory.set_amount(Resource.WATER, 30.0)

    report_one = _tick(building_one, inventory)
    report_two = _tick(building_two, inventory)

    assert report_one["status"] == "produced"
    assert report_two["status"] == "produced"
    assert inventory.get_amount(Resource.BEER) == pytest.approx(8.0)
    assert inventory.get_amount(Resource.WHEAT) == pytest.approx(16.0)
    assert inventory.get_amount(Resource.HOPS) == pytest.approx(16.0)
