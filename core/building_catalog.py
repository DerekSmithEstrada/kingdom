"""Catalogue helpers for the stacked building system."""

from __future__ import annotations

from typing import Dict

from .building_models import (
    BuildingType,
    ConsolidateRule,
    InputDef,
    LevelDef,
)


DEFAULT_BUILDING_DATA = {
    "building_types": [
        {
            "id": "lumber_camp",
            "category": "Wood",
            "output": "wood",
            "base_per_worker": 6,
            "inputs": [],
            "build_cost": {"tools": 2},
            "level_defs": [
                {"level": 1, "mult": 1, "upgrade_cost": {"tools": 1}},
                {"level": 2, "mult": 2, "upgrade_cost": {"tools": 2, "planks": 5}},
                {"level": 3, "mult": 5, "upgrade_cost": {"tools": 3, "planks": 10}},
                {"level": 4, "mult": 10, "upgrade_cost": {"tools": 5, "planks": 20}},
                {"level": 5, "mult": 20, "upgrade_cost": {"tools": 8, "planks": 40}},
            ],
            "optional_global_stack_mult": True,
        },
        {
            "id": "sawmill",
            "category": "Wood",
            "output": "planks",
            "base_per_worker": 4,
            "inputs": [{"resource": "wood", "rate_per_worker": 6}],
            "build_cost": {"wood": 10, "tools": 2},
            "level_defs": [
                {"level": 1, "mult": 1, "upgrade_cost": {"planks": 5, "tools": 1}},
                {"level": 2, "mult": 2, "upgrade_cost": {"planks": 10, "tools": 1}},
                {"level": 3, "mult": 5, "upgrade_cost": {"planks": 20, "tools": 2}},
                {"level": 4, "mult": 10, "upgrade_cost": {"planks": 40, "tools": 3}},
                {"level": 5, "mult": 20, "upgrade_cost": {"planks": 80, "tools": 5}},
            ],
            "consolidate_rule": {"from_level": 2, "count": 3, "to_level": 3},
        },
        {
            "id": "bakery",
            "category": "ProcessedFood",
            "output": "bread",
            "base_per_worker": 2,
            "inputs": [
                {"resource": "flour", "rate_per_worker": 2},
                {"resource": "water", "rate_per_worker": 2},
            ],
            "build_cost": {"planks": 15, "tools": 3},
            "level_defs": [
                {"level": 1, "mult": 1, "upgrade_cost": {"planks": 10, "tools": 1}},
                {"level": 2, "mult": 2, "upgrade_cost": {"planks": 20, "tools": 1}},
                {"level": 3, "mult": 5, "upgrade_cost": {"planks": 40, "tools": 2}},
                {"level": 4, "mult": 10, "upgrade_cost": {"planks": 80, "tools": 3}},
                {"level": 5, "mult": 20, "upgrade_cost": {"planks": 120, "tools": 5}},
            ],
            "priority": 90,
        },
        {
            "id": "windmill",
            "category": "ProcessedFood",
            "output": "flour",
            "base_per_worker": 3,
            "inputs": [{"resource": "wheat", "rate_per_worker": 3}],
            "build_cost": {"planks": 10, "stone": 5, "tools": 2},
            "level_defs": [
                {"level": 1, "mult": 1, "upgrade_cost": {"planks": 8, "stone": 4}},
                {"level": 2, "mult": 2, "upgrade_cost": {"planks": 16, "stone": 8}},
                {"level": 3, "mult": 5, "upgrade_cost": {"planks": 32, "stone": 16}},
                {"level": 4, "mult": 10, "upgrade_cost": {"planks": 64, "stone": 32}},
                {"level": 5, "mult": 20, "upgrade_cost": {"planks": 96, "stone": 48}},
            ],
        },
        {
            "id": "brewery",
            "category": "ProcessedFood",
            "output": "beer",
            "base_per_worker": 1.5,
            "inputs": [
                {"resource": "wheat", "rate_per_worker": 2},
                {"resource": "hops", "rate_per_worker": 2},
                {"resource": "water", "rate_per_worker": 1},
            ],
            "build_cost": {"planks": 20, "stone": 10, "tools": 3},
            "level_defs": [
                {"level": 1, "mult": 1, "upgrade_cost": {"planks": 10}},
                {"level": 2, "mult": 2, "upgrade_cost": {"planks": 20}},
                {"level": 3, "mult": 5, "upgrade_cost": {"planks": 40}},
                {"level": 4, "mult": 10, "upgrade_cost": {"planks": 80}},
                {"level": 5, "mult": 20, "upgrade_cost": {"planks": 120}},
            ],
        },
        {
            "id": "blacksmith",
            "category": "Tools",
            "output": "tools",
            "base_per_worker": 1.2,
            "inputs": [
                {"resource": "iron", "rate_per_worker": 1},
                {"resource": "coal", "rate_per_worker": 1},
            ],
            "build_cost": {"planks": 15, "stone": 10, "tools": 2},
            "level_defs": [
                {"level": 1, "mult": 1, "upgrade_cost": {"planks": 10, "iron": 5}},
                {"level": 2, "mult": 2, "upgrade_cost": {"planks": 20, "iron": 10}},
                {"level": 3, "mult": 5, "upgrade_cost": {"planks": 40, "iron": 20}},
                {"level": 4, "mult": 10, "upgrade_cost": {"planks": 80, "iron": 40}},
                {"level": 5, "mult": 20, "upgrade_cost": {"planks": 120, "iron": 60}},
            ],
        },
    ]
}


def load_default_catalog() -> Dict[str, BuildingType]:
    """Return the default catalogue loaded from the prompt configuration."""

    catalogue: Dict[str, BuildingType] = {}
    for entry in DEFAULT_BUILDING_DATA["building_types"]:
        level_defs = {
            level_data["level"]: LevelDef(
                level=level_data["level"],
                mult=float(level_data.get("mult", 1.0)),
                upgrade_cost={k: float(v) for k, v in level_data.get("upgrade_cost", {}).items()},
                upkeep={k: float(v) for k, v in level_data.get("upkeep", {}).items()},
            )
            for level_data in entry.get("level_defs", [])
        }

        inputs = [
            InputDef(resource=item["resource"], rate_per_worker=float(item.get("rate_per_worker", 0.0)))
            for item in entry.get("inputs", [])
        ]

        consolidate_rule = None
        if entry.get("consolidate_rule"):
            raw = entry["consolidate_rule"]
            consolidate_rule = ConsolidateRule(
                from_level=int(raw["from_level"]),
                count=int(raw["count"]),
                to_level=int(raw["to_level"]),
            )

        building_type = BuildingType(
            id=entry["id"],
            category=entry.get("category", "Other"),
            output=entry.get("output"),
            base_per_worker=float(entry.get("base_per_worker", 0.0)),
            inputs=inputs,
            build_cost={k: float(v) for k, v in entry.get("build_cost", {}).items()},
            level_defs=level_defs,
            consolidate_rule=consolidate_rule,
            has_decay=bool(entry.get("has_decay", False)),
            priority=int(entry.get("priority", 0)),
            optional_global_stack_mult=bool(entry.get("optional_global_stack_mult", False)),
            stack_penalty=float(entry.get("stack_penalty", 0.05)),
        )
        catalogue[building_type.id] = building_type

    return catalogue

