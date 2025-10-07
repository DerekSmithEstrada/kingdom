from typing import Set

import pytest

from core import config
from core.game_state import GameState
from core.resources import ALL_RESOURCES, Resource


def _fresh_state() -> GameState:
    GameState._instance = None  # type: ignore[attr-defined]
    state = GameState()
    return state


def _collect_inputs(recipe) -> Set[Resource]:
    inputs = {resource for resource, amount in recipe.inputs.items() if amount > 0}
    if recipe.per_worker_input_rate:
        inputs.update(
            resource for resource, amount in recipe.per_worker_input_rate.items() if amount > 0
        )
    return inputs


def _collect_outputs(recipe) -> Set[Resource]:
    outputs = {resource for resource, amount in recipe.outputs.items() if amount > 0}
    if recipe.per_worker_output_rate:
        outputs.update(
            resource for resource, amount in recipe.per_worker_output_rate.items() if amount > 0
        )
    return outputs


@pytest.mark.parametrize("resource", list(ALL_RESOURCES))
def test_reset_initialises_resources_to_ten(resource: Resource) -> None:
    state = _fresh_state()
    try:
        amount = state.inventory.get_amount(resource)
        assert amount == pytest.approx(10.0)
    finally:
        GameState._instance = None  # type: ignore[attr-defined]


def test_passive_tick_increases_all_resources() -> None:
    original_flag = config.TEST_PASSIVE_TICK
    config.TEST_PASSIVE_TICK = True
    state = _fresh_state()
    initial_amounts = {
        resource: state.inventory.get_amount(resource) for resource in ALL_RESOURCES
    }
    population = state.population_total()

    try:
        state.advance_time(10.0)
        for resource in ALL_RESOURCES:
            amount = state.inventory.get_amount(resource)
            delta = amount - initial_amounts[resource]
            expected = 0.1 * 10.0
            if resource is Resource.GOLD:
                expected += population * 0.01 * 10.0
            assert delta == pytest.approx(expected, rel=1e-3, abs=1e-3)
    finally:
        config.TEST_PASSIVE_TICK = original_flag
        GameState._instance = None  # type: ignore[attr-defined]


def test_stick_gatherer_production_without_passive_tick() -> None:
    original_flag = config.TEST_PASSIVE_TICK
    config.TEST_PASSIVE_TICK = False
    state = _fresh_state()
    try:
        state._grant_new_villagers(10)
        building = state.build_building(config.STICK_GATHERER)
        state.build_building(config.STICK_GATHERER)
        state.worker_pool.set_assignment(building, 6)

        before = state.inventory.get_amount(Resource.STICKS)
        state.advance_time(60.0)
        after = state.inventory.get_amount(Resource.STICKS)

        assert after - before == pytest.approx(36.0, rel=0.05, abs=0.05)
    finally:
        config.TEST_PASSIVE_TICK = original_flag
        GameState._instance = None  # type: ignore[attr-defined]


def test_all_required_resources_have_tier_zero_producer() -> None:
    state = _fresh_state()
    try:
        tier_zero = {}
        for type_key, recipe in config.BUILDING_RECIPES.items():
            outputs = _collect_outputs(recipe)
            inputs = _collect_inputs(recipe)
            if not outputs:
                continue
            if not inputs:
                for resource in outputs:
                    tier_zero.setdefault(resource, set()).add(type_key)

        missing = set()
        for recipe in config.BUILDING_RECIPES.values():
            for resource in _collect_inputs(recipe):
                if not tier_zero.get(resource):
                    missing.add(resource)

        assert not missing, f"Recursos sin extractor TIER 0: {[res.value for res in missing]}"
    finally:
        GameState._instance = None  # type: ignore[attr-defined]


def test_multiple_instances_allowed_for_tier_zero() -> None:
    state = _fresh_state()
    try:
        quarry = state.build_building(config.QUARRY)
        state.build_building(config.QUARRY)
        assert quarry.built_count == 2
    finally:
        GameState._instance = None  # type: ignore[attr-defined]
