"""Centralised configuration for the management game backend."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Mapping, Optional, Tuple

from .resources import ALL_RESOURCES, Resource, normalise_mapping

# ---------------------------------------------------------------------------
# Building identifiers and normalisation helpers

WOODCUTTER_CAMP = "woodcutter_camp"
STICK_GATHERING_TENT = "stick_gathering_tent"
STONE_GATHERING_TENT = "stone_gathering_tent"
LUMBER_HUT = "lumber_hut"
MINER = "miner"
FARMER = "farmer"
ARTISAN = "artisan"

LUMBER_CAMP = "lumber_camp"
FORESTER_CAMP = "forester_camp"
SAWMILL = "sawmill"
BLACKSMITH = "blacksmith"
COOPERAGE = "cooperage"

STONECUTTER_CAMP = "stonecutter_camp"
STONEMASON_HUT = "stonemason_hut"
IRON_MINE = "iron_mine"
COAL_HUT = "coal_hut"
IRON_SMELTER = "iron_smelter"
GOLD_SMELTER = "gold_smelter"
GLASS_SMELTER = "glass_smelter"

GATHERING_HUT = "gathering_hut"
WHEAT_FARM = "wheat_farm"
WINDMILL = "windmill"
BAKERY = "bakery"
FISHERS_HUT = "fishers_hut"
HUNTERS_HUT = "hunters_hut"
DAIRY_FARM = "dairy_farm"
CHEESEMAKER = "cheesemaker"
HOP_FARM = "hop_farm"
BREWERY = "brewery"
WELL = "well"

WEAVERS_HUT = "weavers_hut"
TAILORS_WORKSHOP = "tailors_workshop"
CANDLE_WORKSHOP = "candle_workshop"
JEWELER_WORKSHOP = "jeweler_workshop"

APIARY = "apiary"
HERB_GARDEN = "herb_garden"
VINEYARD = "vineyard"
WINERY = "winery"

WAREHOUSE = "warehouse"
GRANARY = "granary"
MARKET_STALL = "market_stall"
MANOR_HOUSE = "manor_house"
TAX_OFFICE = "tax_office"
BAILIFF_OFFICE = "bailiff_office"
TAVERN = "tavern"

WOODEN_KEEP = "wooden_keep"
STONE_KEEP = "stone_keep"
BARRACKS = "barracks"
WEAPONSMITH = "weaponsmith"
SOLDIERS_TRAINING_GROUND = "soldiers_training_ground"
ARCHERS_TRAINING_GROUND = "archers_training_ground"

FOUNTAIN = "fountain"
GIANT_GATE = "giant_gate"
KNIGHT_STATUE = "knight_statue"
GOLDEN_CROSS = "golden_cross"
STAINED_GLASS = "stained_glass"
SHRINE = "shrine"
GARDEN = "garden"

BUILDING_PUBLIC_IDS: Dict[str, str] = {
    WOODCUTTER_CAMP: "woodcutter_camp",
    STICK_GATHERING_TENT: "stick_gathering_tent",
    STONE_GATHERING_TENT: "stone_gathering_tent",
    LUMBER_HUT: "lumber_hut",
    MINER: "miner",
    FARMER: "farmer",
    ARTISAN: "artisan",
    LUMBER_CAMP: "lumber_camp",
    FORESTER_CAMP: "forester_camp",
    SAWMILL: "sawmill",
    BLACKSMITH: "blacksmith",
    COOPERAGE: "cooperage",
    STONECUTTER_CAMP: "stonecutter_camp",
    STONEMASON_HUT: "stonemason_hut",
    IRON_MINE: "iron_mine",
    COAL_HUT: "coal_hut",
    IRON_SMELTER: "iron_smelter",
    GOLD_SMELTER: "gold_smelter",
    GLASS_SMELTER: "glass_smelter",
    GATHERING_HUT: "gathering_hut",
    WHEAT_FARM: "wheat_farm",
    WINDMILL: "windmill",
    BAKERY: "bakery",
    FISHERS_HUT: "fishers_hut",
    HUNTERS_HUT: "hunters_hut",
    DAIRY_FARM: "dairy_farm",
    CHEESEMAKER: "cheesemaker",
    HOP_FARM: "hop_farm",
    BREWERY: "brewery",
    WELL: "well",
    WEAVERS_HUT: "weavers_hut",
    TAILORS_WORKSHOP: "tailors_workshop",
    CANDLE_WORKSHOP: "candle_workshop",
    JEWELER_WORKSHOP: "jeweler_workshop",
    APIARY: "apiary",
    HERB_GARDEN: "herb_garden",
    VINEYARD: "vineyard",
    WINERY: "winery",
    WAREHOUSE: "warehouse",
    GRANARY: "granary",
    MARKET_STALL: "market_stall",
    MANOR_HOUSE: "manor_house",
    TAX_OFFICE: "tax_office",
    BAILIFF_OFFICE: "bailiff_office",
    TAVERN: "tavern",
    WOODEN_KEEP: "wooden_keep",
    STONE_KEEP: "stone_keep",
    BARRACKS: "barracks",
    WEAPONSMITH: "weaponsmith",
    SOLDIERS_TRAINING_GROUND: "soldiers_training_ground",
    ARCHERS_TRAINING_GROUND: "archers_training_ground",
    FOUNTAIN: "fountain",
    GIANT_GATE: "giant_gate",
    KNIGHT_STATUE: "knight_statue",
    GOLDEN_CROSS: "golden_cross",
    STAINED_GLASS: "stained_glass",
    SHRINE: "shrine",
    GARDEN: "garden",
}

_BUILDING_ID_LOOKUP: Dict[str, str] = {
    public_id: type_key for type_key, public_id in BUILDING_PUBLIC_IDS.items()
}


def normalise_building_key(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("El identificador de edificio debe ser una cadena")
    key = value.strip().lower().replace("-", "_")
    if not key:
        raise ValueError("El identificador de edificio está vacío")
    return key


def resolve_building_type(value: str) -> str:
    key = normalise_building_key(value)
    if key in BUILDING_PUBLIC_IDS:
        return key
    mapped = _BUILDING_ID_LOOKUP.get(key)
    if mapped:
        return mapped
    raise ValueError(f"Identificador de edificio desconocido: {value}")


def resolve_building_public_id(value: str) -> str:
    type_key = resolve_building_type(value)
    return BUILDING_PUBLIC_IDS[type_key]

# ---------------------------------------------------------------------------
# Building metadata

BUILDING_NAMES: Dict[str, str] = {
    WOODCUTTER_CAMP: "Woodcutter Camp",
    STICK_GATHERING_TENT: "Stick-gathering Tent",
    STONE_GATHERING_TENT: "Stone-gathering Tent",
    LUMBER_HUT: "Lumber Hut",
    MINER: "Miner",
    FARMER: "Farmer",
    ARTISAN: "Artisan Workshop",
    LUMBER_CAMP: "Lumber Camp",
    FORESTER_CAMP: "Forester Camp",
    SAWMILL: "Sawmill",
    BLACKSMITH: "Blacksmith",
    COOPERAGE: "Cooperage",
    STONECUTTER_CAMP: "Stonecutter Camp",
    STONEMASON_HUT: "Stonemason Hut",
    IRON_MINE: "Iron Mine",
    COAL_HUT: "Coal Hut",
    IRON_SMELTER: "Iron Smelter",
    GOLD_SMELTER: "Gold Smelter",
    GLASS_SMELTER: "Glass Smelter",
    GATHERING_HUT: "Gathering Hut",
    WHEAT_FARM: "Wheat Farm",
    WINDMILL: "Windmill",
    BAKERY: "Bakery",
    FISHERS_HUT: "Fisher's Hut",
    HUNTERS_HUT: "Hunter's Hut",
    DAIRY_FARM: "Dairy Farm",
    CHEESEMAKER: "Cheesemaker",
    HOP_FARM: "Hop Farm",
    BREWERY: "Brewery",
    WELL: "Well",
    WEAVERS_HUT: "Weaver's Hut",
    TAILORS_WORKSHOP: "Tailor's Workshop",
    CANDLE_WORKSHOP: "Candle Workshop",
    JEWELER_WORKSHOP: "Jeweler Workshop",
    APIARY: "Apiary",
    HERB_GARDEN: "Herb Garden",
    VINEYARD: "Vineyard",
    WINERY: "Winery",
    WAREHOUSE: "Warehouse",
    GRANARY: "Granary",
    MARKET_STALL: "Market Stall",
    MANOR_HOUSE: "Manor House",
    TAX_OFFICE: "Tax Office",
    BAILIFF_OFFICE: "Bailiff Office",
    TAVERN: "Tavern",
    WOODEN_KEEP: "Wooden Keep",
    STONE_KEEP: "Stone Keep",
    BARRACKS: "Barracks",
    WEAPONSMITH: "Weaponsmith",
    SOLDIERS_TRAINING_GROUND: "Soldier's Training Ground",
    ARCHERS_TRAINING_GROUND: "Archer's Training Ground",
    FOUNTAIN: "Fountain",
    GIANT_GATE: "Giant Gate",
    KNIGHT_STATUE: "Knight Statue",
    GOLDEN_CROSS: "Golden Cross",
    STAINED_GLASS: "Stained Glass",
    SHRINE: "Shrine",
    GARDEN: "Garden",
}

BUILD_COSTS: Dict[str, Dict[Resource, float]] = {
    key: {} for key in BUILDING_PUBLIC_IDS
}

BUILD_COSTS.update(
    {
        WOODCUTTER_CAMP: {Resource.WOOD: 10, Resource.GOLD: 5},
        STICK_GATHERING_TENT: {Resource.GOLD: 1},
        STONE_GATHERING_TENT: {Resource.GOLD: 2},
        LUMBER_HUT: {},
        MINER: {},
        FARMER: {},
        ARTISAN: {},
        LUMBER_CAMP: {Resource.WOOD: 20, Resource.TOOLS: 2},
        FORESTER_CAMP: {Resource.WOOD: 15},
        SAWMILL: {Resource.WOOD: 25, Resource.PLANK: 5},
        BLACKSMITH: {Resource.STONE: 20, Resource.PLANK: 10},
        COOPERAGE: {Resource.PLANK: 15, Resource.IRON: 5},
        STONECUTTER_CAMP: {Resource.WOOD: 15},
        STONEMASON_HUT: {Resource.STONE: 20, Resource.PLANK: 5},
        IRON_MINE: {Resource.PLANK: 10, Resource.STONE: 15},
        COAL_HUT: {Resource.WOOD: 10},
        IRON_SMELTER: {Resource.STONE: 25, Resource.PLANK: 10},
        GOLD_SMELTER: {Resource.STONE: 30, Resource.PLANK: 15},
        GLASS_SMELTER: {Resource.STONE: 20, Resource.PLANK: 10},
        GATHERING_HUT: {Resource.WOOD: 10},
        WHEAT_FARM: {Resource.WOOD: 15},
        WINDMILL: {Resource.PLANK: 15, Resource.STONE: 10},
        BAKERY: {Resource.PLANK: 10, Resource.STONE: 10},
        FISHERS_HUT: {Resource.WOOD: 12},
        HUNTERS_HUT: {Resource.WOOD: 12},
        DAIRY_FARM: {Resource.WOOD: 18},
        CHEESEMAKER: {Resource.PLANK: 10, Resource.STONE: 5},
        HOP_FARM: {Resource.WOOD: 12},
        BREWERY: {Resource.PLANK: 12, Resource.STONE: 12},
        WELL: {Resource.STONE: 15},
        WEAVERS_HUT: {Resource.WOOD: 12, Resource.PLANK: 6},
        TAILORS_WORKSHOP: {Resource.PLANK: 12, Resource.STONE: 6},
        CANDLE_WORKSHOP: {Resource.PLANK: 12, Resource.STONE: 6},
        JEWELER_WORKSHOP: {Resource.STONE: 20, Resource.PLANK: 10},
        APIARY: {Resource.WOOD: 10},
        HERB_GARDEN: {Resource.WOOD: 8},
        VINEYARD: {Resource.WOOD: 12},
        WINERY: {Resource.PLANK: 15, Resource.STONE: 10},
        WAREHOUSE: {Resource.PLANK: 20, Resource.STONE: 10},
        GRANARY: {Resource.PLANK: 15, Resource.STONE: 8},
        MARKET_STALL: {Resource.PLANK: 8},
        MANOR_HOUSE: {Resource.STONE: 30, Resource.PLANK: 20},
        TAX_OFFICE: {Resource.STONE: 25, Resource.PLANK: 15},
        BAILIFF_OFFICE: {Resource.STONE: 20, Resource.PLANK: 10},
        TAVERN: {Resource.PLANK: 20, Resource.STONE: 15},
        WOODEN_KEEP: {Resource.WOOD: 50, Resource.STONE: 20},
        STONE_KEEP: {Resource.STONE: 60, Resource.PLANK: 20},
        BARRACKS: {Resource.PLANK: 25, Resource.STONE: 15},
        WEAPONSMITH: {Resource.STONE: 20, Resource.PLANK: 10},
        SOLDIERS_TRAINING_GROUND: {Resource.PLANK: 15, Resource.STONE: 10},
        ARCHERS_TRAINING_GROUND: {Resource.PLANK: 15, Resource.STONE: 10},
        FOUNTAIN: {Resource.STONE: 15, Resource.POLISHED_STONE: 5},
        GIANT_GATE: {Resource.STONE: 40, Resource.POLISHED_STONE: 10},
        KNIGHT_STATUE: {Resource.POLISHED_STONE: 12, Resource.IRON: 6},
        GOLDEN_CROSS: {Resource.GOLD: 8, Resource.POLISHED_STONE: 6},
        STAINED_GLASS: {Resource.GLASS: 10, Resource.POLISHED_STONE: 4},
        SHRINE: {Resource.POLISHED_STONE: 8, Resource.WOOD: 6},
        GARDEN: {Resource.WOOD: 6, Resource.STONE: 4},
    }
)


@dataclass(frozen=True)
class BuildingMetadata:
    """UI-centric metadata for building presentation."""

    category: str
    icon: str
    category_label: str | None = None
    job: Optional[str] = None
    job_name: Optional[str] = None
    job_icon: Optional[str] = None
    build_label: Optional[str] = None
    role: Optional[str] = None
    level: Optional[int] = None


BUILDING_METADATA: Dict[str, BuildingMetadata] = {
    WOODCUTTER_CAMP: BuildingMetadata(
        category="wood",
        category_label="Wood",
        icon="🪓",
        job="forester",
        job_name="Forester",
        job_icon="🌲",
        build_label="Woodcutter Camp",
        role="wood_producer",
        level=2,
    ),
    STICK_GATHERING_TENT: BuildingMetadata(
        category="wood",
        category_label="Wood",
        icon="🥢",
        job="stick_gatherer",
        job_name="Stick Gatherer",
        job_icon="🥢",
        build_label="Stick-gathering Tent",
        role="stick_gatherer",
        level=1,
    ),
    STONE_GATHERING_TENT: BuildingMetadata(
        category="stone",
        category_label="Stone",
        icon="🪨",
        job="stone_gatherer",
        job_name="Stone Gatherer",
        job_icon="🪨",
        build_label="Stone-gathering Tent",
        role="stone_producer",
        level=1,
    ),
    LUMBER_HUT: BuildingMetadata(
        category="wood",
        category_label="Wood",
        icon="🏚️",
        job="artisan",
        job_name="Artisan",
        job_icon="🛠️",
        build_label="Lumber Hut",
        role="plank_crafter",
        level=3,
    ),
    MINER: BuildingMetadata(
        category="stone",
        category_label="Stone",
        icon="⛏️",
        job="miner",
        job_name="Miner",
        job_icon="⛏️",
        build_label="Miner",
        role="stone_producer",
        level=3,
    ),
    FARMER: BuildingMetadata(
        category="crops",
        category_label="Crops",
        icon="🌾",
        job="farmer",
        job_name="Farmer",
        job_icon="🌾",
        build_label="Farmer",
        role="grain_producer",
        level=2,
    ),
    ARTISAN: BuildingMetadata(
        category="crops",
        category_label="Crops",
        icon="🛠️",
        job="artisan",
        job_name="Artisan",
        job_icon="🛠️",
        build_label="Artisan Workshop",
        role="toolmaker",
        level=4,
    ),
    LUMBER_CAMP: BuildingMetadata(
        category="wood_tools",
        category_label="Wood & Tools",
        icon="🪓",
        job="woodcutter",
        job_name="Woodcutter",
        job_icon="🪓",
        build_label="Lumber Camp",
        role="wood_producer",
        level=1,
    ),
    FORESTER_CAMP: BuildingMetadata(
        category="wood_tools",
        category_label="Wood & Tools",
        icon="🌲",
        job="forester",
        job_name="Forester",
        job_icon="🌲",
        build_label="Forester Camp",
        role="forestry",
        level=1,
    ),
    SAWMILL: BuildingMetadata(
        category="wood_tools",
        category_label="Wood & Tools",
        icon="🪵",
        job="sawyer",
        job_name="Sawyer",
        job_icon="🪚",
        build_label="Sawmill",
        role="plank_crafter",
        level=2,
    ),
    BLACKSMITH: BuildingMetadata(
        category="wood_tools",
        category_label="Wood & Tools",
        icon="⚒️",
        job="blacksmith",
        job_name="Blacksmith",
        job_icon="⚒️",
        build_label="Blacksmith",
        role="toolmaker",
        level=3,
    ),
    COOPERAGE: BuildingMetadata(
        category="wood_tools",
        category_label="Wood & Tools",
        icon="🛢️",
        job="cooper",
        job_name="Cooper",
        job_icon="🛢️",
        build_label="Cooperage",
        role="barrel_maker",
        level=3,
    ),
    STONECUTTER_CAMP: BuildingMetadata(
        category="minerals",
        category_label="Minerals & Smelting",
        icon="⛏️",
        job="stonecutter",
        job_name="Stonecutter",
        job_icon="⛏️",
        build_label="Stonecutter Camp",
        role="stone_gatherer",
        level=1,
    ),
    STONEMASON_HUT: BuildingMetadata(
        category="minerals",
        category_label="Minerals & Smelting",
        icon="🧱",
        job="stonemason",
        job_name="Stonemason",
        job_icon="🧱",
        build_label="Stonemason Hut",
        role="stone_refiner",
        level=2,
    ),
    IRON_MINE: BuildingMetadata(
        category="minerals",
        category_label="Minerals & Smelting",
        icon="⚒️",
        job="miner",
        job_name="Miner",
        job_icon="⚒️",
        build_label="Iron Mine",
        role="iron_miner",
        level=2,
    ),
    COAL_HUT: BuildingMetadata(
        category="minerals",
        category_label="Minerals & Smelting",
        icon="🔥",
        job="coal_worker",
        job_name="Coal Worker",
        job_icon="🔥",
        build_label="Coal Hut",
        role="coal_maker",
        level=1,
    ),
    IRON_SMELTER: BuildingMetadata(
        category="minerals",
        category_label="Minerals & Smelting",
        icon="🏭",
        job="smelter",
        job_name="Smelter",
        job_icon="🏭",
        build_label="Iron Smelter",
        role="iron_smelter",
        level=3,
    ),
    GOLD_SMELTER: BuildingMetadata(
        category="minerals",
        category_label="Minerals & Smelting",
        icon="🪙",
        job="gold_smelter",
        job_name="Gold Smelter",
        job_icon="🪙",
        build_label="Gold Smelter",
        role="gold_smelter",
        level=3,
    ),
    GLASS_SMELTER: BuildingMetadata(
        category="minerals",
        category_label="Minerals & Smelting",
        icon="🔮",
        job="glassblower",
        job_name="Glassblower",
        job_icon="🔮",
        build_label="Glass Smelter",
        role="glassmaker",
        level=3,
    ),
    GATHERING_HUT: BuildingMetadata(
        category="food",
        category_label="Basic Food & Farming",
        icon="🍓",
        job="gatherer",
        job_name="Gatherer",
        job_icon="🍓",
        build_label="Gathering Hut",
        role="berry_gatherer",
        level=1,
    ),
    WHEAT_FARM: BuildingMetadata(
        category="food",
        category_label="Basic Food & Farming",
        icon="🌾",
        job="farmer",
        job_name="Farmer",
        job_icon="🌾",
        build_label="Wheat Farm",
        role="grain_producer",
        level=1,
    ),
    WINDMILL: BuildingMetadata(
        category="food",
        category_label="Basic Food & Farming",
        icon="🌬️",
        job="miller",
        job_name="Miller",
        job_icon="🌬️",
        build_label="Windmill",
        role="grain_processor",
        level=2,
    ),
    BAKERY: BuildingMetadata(
        category="food",
        category_label="Basic Food & Farming",
        icon="🥖",
        job="baker",
        job_name="Baker",
        job_icon="🥖",
        build_label="Bakery",
        role="bread_maker",
        level=2,
    ),
    FISHERS_HUT: BuildingMetadata(
        category="food",
        category_label="Basic Food & Farming",
        icon="🎣",
        job="fisher",
        job_name="Fisher",
        job_icon="🎣",
        build_label="Fisher's Hut",
        role="fish_producer",
        level=1,
    ),
    HUNTERS_HUT: BuildingMetadata(
        category="food",
        category_label="Basic Food & Farming",
        icon="🏹",
        job="hunter",
        job_name="Hunter",
        job_icon="🏹",
        build_label="Hunter's Hut",
        role="meat_hunter",
        level=1,
    ),
    DAIRY_FARM: BuildingMetadata(
        category="food",
        category_label="Basic Food & Farming",
        icon="🐄",
        job="dairyman",
        job_name="Dairy Farmer",
        job_icon="🐄",
        build_label="Dairy Farm",
        role="milk_producer",
        level=2,
    ),
    CHEESEMAKER: BuildingMetadata(
        category="food",
        category_label="Basic Food & Farming",
        icon="🧀",
        job="cheesemaker",
        job_name="Cheesemaker",
        job_icon="🧀",
        build_label="Cheesemaker",
        role="cheese_maker",
        level=2,
    ),
    HOP_FARM: BuildingMetadata(
        category="food",
        category_label="Basic Food & Farming",
        icon="🌱",
        job="hop_farmer",
        job_name="Hop Farmer",
        job_icon="🌱",
        build_label="Hop Farm",
        role="hop_producer",
        level=1,
    ),
    BREWERY: BuildingMetadata(
        category="food",
        category_label="Basic Food & Farming",
        icon="🍺",
        job="brewer",
        job_name="Brewer",
        job_icon="🍺",
        build_label="Brewery",
        role="beer_maker",
        level=3,
    ),
    WELL: BuildingMetadata(
        category="food",
        category_label="Basic Food & Farming",
        icon="🚰",
        job="water_carrier",
        job_name="Water Carrier",
        job_icon="🚰",
        build_label="Well",
        role="water_collector",
        level=1,
    ),
    WEAVERS_HUT: BuildingMetadata(
        category="luxury",
        category_label="Clothing & Luxury",
        icon="🧵",
        job="weaver",
        job_name="Weaver",
        job_icon="🧵",
        build_label="Weaver's Hut",
        role="cloth_maker",
        level=2,
    ),
    TAILORS_WORKSHOP: BuildingMetadata(
        category="luxury",
        category_label="Clothing & Luxury",
        icon="👗",
        job="tailor",
        job_name="Tailor",
        job_icon="👗",
        build_label="Tailor's Workshop",
        role="clothing_maker",
        level=3,
    ),
    CANDLE_WORKSHOP: BuildingMetadata(
        category="luxury",
        category_label="Clothing & Luxury",
        icon="🕯️",
        job="candlemaker",
        job_name="Candlemaker",
        job_icon="🕯️",
        build_label="Candle Workshop",
        role="candle_maker",
        level=3,
    ),
    JEWELER_WORKSHOP: BuildingMetadata(
        category="luxury",
        category_label="Clothing & Luxury",
        icon="💍",
        job="jeweler",
        job_name="Jeweler",
        job_icon="💍",
        build_label="Jeweler Workshop",
        role="jewelry_maker",
        level=4,
    ),
    APIARY: BuildingMetadata(
        category="monastery",
        category_label="Monastery",
        icon="🐝",
        job="beekeeper",
        job_name="Beekeeper",
        job_icon="🐝",
        build_label="Apiary",
        role="honey_producer",
        level=2,
    ),
    HERB_GARDEN: BuildingMetadata(
        category="monastery",
        category_label="Monastery",
        icon="🌿",
        job="herbalist",
        job_name="Herbalist",
        job_icon="🌿",
        build_label="Herb Garden",
        role="herb_grower",
        level=1,
    ),
    VINEYARD: BuildingMetadata(
        category="monastery",
        category_label="Monastery",
        icon="🍇",
        job="vigneron",
        job_name="Vigneron",
        job_icon="🍇",
        build_label="Vineyard",
        role="grape_grower",
        level=2,
    ),
    WINERY: BuildingMetadata(
        category="monastery",
        category_label="Monastery",
        icon="🍷",
        job="winemaker",
        job_name="Winemaker",
        job_icon="🍷",
        build_label="Winery",
        role="wine_maker",
        level=3,
    ),
    WAREHOUSE: BuildingMetadata(
        category="economy",
        category_label="Economy & Governance",
        icon="📦",
        job="storekeeper",
        job_name="Storekeeper",
        job_icon="📦",
        build_label="Warehouse",
        role="storage",
        level=2,
    ),
    GRANARY: BuildingMetadata(
        category="economy",
        category_label="Economy & Governance",
        icon="🧺",
        job="granary_keeper",
        job_name="Granary Keeper",
        job_icon="🧺",
        build_label="Granary",
        role="food_storage",
        level=2,
    ),
    MARKET_STALL: BuildingMetadata(
        category="economy",
        category_label="Economy & Governance",
        icon="🛒",
        job="vendor",
        job_name="Vendor",
        job_icon="🛒",
        build_label="Market Stall",
        role="market",
        level=1,
    ),
    MANOR_HOUSE: BuildingMetadata(
        category="economy",
        category_label="Economy & Governance",
        icon="🏰",
        job="lord",
        job_name="Lord",
        job_icon="🏰",
        build_label="Manor House",
        role="governance",
        level=4,
    ),
    TAX_OFFICE: BuildingMetadata(
        category="economy",
        category_label="Economy & Governance",
        icon="💰",
        job="tax_collector",
        job_name="Tax Collector",
        job_icon="💰",
        build_label="Tax Office",
        role="taxation",
        level=3,
    ),
    BAILIFF_OFFICE: BuildingMetadata(
        category="economy",
        category_label="Economy & Governance",
        icon="⚖️",
        job="bailiff",
        job_name="Bailiff",
        job_icon="⚖️",
        build_label="Bailiff Office",
        role="administration",
        level=3,
    ),
    TAVERN: BuildingMetadata(
        category="economy",
        category_label="Economy & Governance",
        icon="🍻",
        job="innkeeper",
        job_name="Innkeeper",
        job_icon="🍻",
        build_label="Tavern",
        role="hospitality",
        level=3,
    ),
    WOODEN_KEEP: BuildingMetadata(
        category="army",
        category_label="Army & Defense",
        icon="🛡️",
        job="guard",
        job_name="Guard",
        job_icon="🛡️",
        build_label="Wooden Keep",
        role="defense",
        level=3,
    ),
    STONE_KEEP: BuildingMetadata(
        category="army",
        category_label="Army & Defense",
        icon="🏯",
        job="knight",
        job_name="Knight",
        job_icon="🏯",
        build_label="Stone Keep",
        role="defense",
        level=4,
    ),
    BARRACKS: BuildingMetadata(
        category="army",
        category_label="Army & Defense",
        icon="🪖",
        job="trainer",
        job_name="Drill Sergeant",
        job_icon="🪖",
        build_label="Barracks",
        role="training",
        level=3,
    ),
    WEAPONSMITH: BuildingMetadata(
        category="army",
        category_label="Army & Defense",
        icon="⚔️",
        job="weaponsmith",
        job_name="Weaponsmith",
        job_icon="⚔️",
        build_label="Weaponsmith",
        role="weapon_maker",
        level=3,
    ),
    SOLDIERS_TRAINING_GROUND: BuildingMetadata(
        category="army",
        category_label="Army & Defense",
        icon="🗡️",
        job="soldier_trainer",
        job_name="Soldier Trainer",
        job_icon="🗡️",
        build_label="Soldier's Training Ground",
        role="soldier_training",
        level=3,
    ),
    ARCHERS_TRAINING_GROUND: BuildingMetadata(
        category="army",
        category_label="Army & Defense",
        icon="🎯",
        job="archer_trainer",
        job_name="Archer Trainer",
        job_icon="🎯",
        build_label="Archer's Training Ground",
        role="archer_training",
        level=3,
    ),
    FOUNTAIN: BuildingMetadata(
        category="decorative",
        category_label="Decorative / Monumental",
        icon="⛲",
        build_label="Fountain",
        role="decorative",
        level=1,
    ),
    GIANT_GATE: BuildingMetadata(
        category="decorative",
        category_label="Decorative / Monumental",
        icon="🚪",
        build_label="Giant Gate",
        role="decorative",
        level=2,
    ),
    KNIGHT_STATUE: BuildingMetadata(
        category="decorative",
        category_label="Decorative / Monumental",
        icon="🗿",
        build_label="Knight Statue",
        role="decorative",
        level=2,
    ),
    GOLDEN_CROSS: BuildingMetadata(
        category="decorative",
        category_label="Decorative / Monumental",
        icon="✝️",
        build_label="Golden Cross",
        role="decorative",
        level=2,
    ),
    STAINED_GLASS: BuildingMetadata(
        category="decorative",
        category_label="Decorative / Monumental",
        icon="🪟",
        build_label="Stained Glass",
        role="decorative",
        level=2,
    ),
    SHRINE: BuildingMetadata(
        category="decorative",
        category_label="Decorative / Monumental",
        icon="🛐",
        build_label="Shrine",
        role="decorative",
        level=1,
    ),
    GARDEN: BuildingMetadata(
        category="decorative",
        category_label="Decorative / Monumental",
        icon="🌼",
        build_label="Garden",
        role="decorative",
        level=1,
    ),
}


def get_building_metadata(type_key: str) -> BuildingMetadata:
    """Return the metadata for ``type_key`` with sensible defaults."""

    meta = BUILDING_METADATA.get(type_key)
    if meta is not None:
        return meta
    name = BUILDING_NAMES.get(type_key, type_key.title())
    return BuildingMetadata(
        category="general",
        category_label="General",
        icon="🏗️",
        job=None,
        job_name=None,
        job_icon=None,
        build_label=name,
    )

# Backwards compatibility alias for legacy references.
COSTOS_CONSTRUCCION: Dict[str, Dict[Resource, float]] = BUILD_COSTS

@dataclass(frozen=True)
class BuildingRecipe:
    """Structure describing how a building converts resources each cycle."""

    inputs: Mapping[Resource, float]
    outputs: Mapping[Resource, float]
    cycle_time: float
    max_workers: int
    capacity: Optional[Mapping[Resource, float]] = None
    maintenance: Mapping[Resource, float] = field(default_factory=dict)
    per_worker_output_rate: Optional[Mapping[Resource, float]] = None
    per_worker_input_rate: Optional[Mapping[Resource, float]] = None


def _recipe(
    *,
    inputs: Mapping[Resource, float] | None,
    outputs: Mapping[Resource, float],
    cycle_time: float,
    max_workers: int,
    capacity: Mapping[Resource, float] | None = None,
    maintenance: Mapping[Resource, float] | None = None,
    per_worker_output_rate: Mapping[Resource, float] | None = None,
    per_worker_input_rate: Mapping[Resource, float] | None = None,
) -> BuildingRecipe:
    return BuildingRecipe(
        inputs=normalise_mapping(inputs or {}),
        outputs=normalise_mapping(outputs),
        cycle_time=float(cycle_time),
        max_workers=int(max_workers),
        capacity=None if capacity is None else normalise_mapping(capacity),
        maintenance=normalise_mapping(maintenance or {}),
        per_worker_output_rate=None
        if per_worker_output_rate is None
        else normalise_mapping(per_worker_output_rate),
        per_worker_input_rate=None
        if per_worker_input_rate is None
        else normalise_mapping(per_worker_input_rate),
    )


BUILDING_RECIPES: Dict[str, BuildingRecipe] = {
    WOODCUTTER_CAMP: _recipe(
        inputs={},
        outputs={},
        cycle_time=1.0,
        max_workers=2,
        maintenance={},
        per_worker_output_rate={Resource.WOOD: 0.01},
        per_worker_input_rate={
            Resource.STICKS: 0.04,
            Resource.STONE: 0.04,
        },
        capacity={Resource.WOOD: 30},
    ),
    STICK_GATHERING_TENT: _recipe(
        inputs={},
        outputs={},
        cycle_time=1.0,
        max_workers=3,
        maintenance={},
        per_worker_output_rate={Resource.STICKS: 0.01},
        capacity={Resource.STICKS: 30},
    ),
    STONE_GATHERING_TENT: _recipe(
        inputs={},
        outputs={},
        cycle_time=1.0,
        max_workers=3,
        maintenance={},
        per_worker_output_rate={Resource.STONE: 0.01},
        capacity={Resource.STONE: 30},
    ),
    LUMBER_HUT: _recipe(
        inputs={Resource.WOOD: 2},
        outputs={Resource.PLANK: 1},
        cycle_time=4.0,
        max_workers=2,
        maintenance={Resource.GOLD: 0.006666666666666667},
    ),
    MINER: _recipe(
        inputs={},
        outputs={Resource.STONE: 1, Resource.ORE: 0.2},
        cycle_time=5.0,
        max_workers=3,
        maintenance={Resource.GOLD: 0.016666666666666666},
    ),
    FARMER: _recipe(
        inputs={Resource.SEEDS: 1},
        outputs={Resource.GRAIN: 3},
        cycle_time=8.0,
        max_workers=3,
        maintenance={Resource.GOLD: 0.0125},
    ),
    ARTISAN: _recipe(
        inputs={Resource.PLANK: 1, Resource.STONE: 1},
        outputs={Resource.TOOLS: 1},
        cycle_time=6.0,
        max_workers=2,
        maintenance={Resource.GOLD: 0.01},
    ),
    LUMBER_CAMP: _recipe(
        inputs={},
        outputs={Resource.WOOD: 6},
        cycle_time=60.0,
        max_workers=3,
        capacity={Resource.WOOD: 120},
    ),
    FORESTER_CAMP: _recipe(
        inputs={},
        outputs={},
        cycle_time=90.0,
        max_workers=2,
    ),
    SAWMILL: _recipe(
        inputs={Resource.WOOD: 4},
        outputs={Resource.PLANK: 4},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.PLANK: 80},
    ),
    BLACKSMITH: _recipe(
        inputs={Resource.IRON: 2, Resource.COAL: 2},
        outputs={Resource.TOOLS: 2},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.TOOLS: 60},
    ),
    COOPERAGE: _recipe(
        inputs={Resource.PLANK: 2, Resource.IRON: 1, Resource.TOOLS: 1},
        outputs={Resource.BARRELS: 2},
        cycle_time=75.0,
        max_workers=2,
        capacity={Resource.BARRELS: 40},
    ),
    STONECUTTER_CAMP: _recipe(
        inputs={},
        outputs={Resource.STONE: 6},
        cycle_time=60.0,
        max_workers=3,
        capacity={Resource.STONE: 120},
    ),
    STONEMASON_HUT: _recipe(
        inputs={Resource.STONE: 4},
        outputs={Resource.POLISHED_STONE: 2},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.POLISHED_STONE: 60},
    ),
    IRON_MINE: _recipe(
        inputs={},
        outputs={Resource.IRON_ORE: 6},
        cycle_time=60.0,
        max_workers=3,
        capacity={Resource.IRON_ORE: 120},
    ),
    COAL_HUT: _recipe(
        inputs={Resource.WOOD: 4},
        outputs={Resource.COAL: 4},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.COAL: 80},
    ),
    IRON_SMELTER: _recipe(
        inputs={Resource.IRON_ORE: 4, Resource.COAL: 2},
        outputs={Resource.IRON: 4},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.IRON: 80},
    ),
    GOLD_SMELTER: _recipe(
        inputs={Resource.GOLD_ORE: 4, Resource.COAL: 2},
        outputs={Resource.GOLD: 4},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.GOLD: 80},
    ),
    GLASS_SMELTER: _recipe(
        inputs={Resource.QUARTZ: 4, Resource.COAL: 2},
        outputs={Resource.GLASS: 4},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.GLASS: 80},
    ),
    GATHERING_HUT: _recipe(
        inputs={},
        outputs={Resource.BERRIES: 6},
        cycle_time=60.0,
        max_workers=3,
        capacity={Resource.BERRIES: 100},
    ),
    WHEAT_FARM: _recipe(
        inputs={},
        outputs={Resource.WHEAT: 6},
        cycle_time=60.0,
        max_workers=3,
        capacity={Resource.WHEAT: 120},
    ),
    WINDMILL: _recipe(
        inputs={Resource.WHEAT: 4},
        outputs={Resource.FLOUR: 4},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.FLOUR: 80},
    ),
    BAKERY: _recipe(
        inputs={Resource.FLOUR: 3, Resource.WATER: 2},
        outputs={Resource.BREAD: 5},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.BREAD: 60},
    ),
    FISHERS_HUT: _recipe(
        inputs={},
        outputs={Resource.FISH: 5},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.FISH: 100},
    ),
    HUNTERS_HUT: _recipe(
        inputs={},
        outputs={Resource.BOAR_MEAT: 4},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.BOAR_MEAT: 80},
    ),
    DAIRY_FARM: _recipe(
        inputs={},
        outputs={Resource.MILK: 5},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.MILK: 90},
    ),
    CHEESEMAKER: _recipe(
        inputs={Resource.MILK: 4},
        outputs={Resource.CHEESE: 3},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.CHEESE: 60},
    ),
    HOP_FARM: _recipe(
        inputs={},
        outputs={Resource.HOPS: 4},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.HOPS: 80},
    ),
    BREWERY: _recipe(
        inputs={Resource.WHEAT: 2, Resource.HOPS: 2, Resource.WATER: 3},
        outputs={Resource.BEER: 4},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.BEER: 60},
    ),
    WELL: _recipe(
        inputs={},
        outputs={Resource.WATER: 6},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.WATER: 120},
    ),
    WEAVERS_HUT: _recipe(
        inputs={Resource.WOOL: 4},
        outputs={Resource.CLOTH: 4},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.CLOTH: 70},
    ),
    TAILORS_WORKSHOP: _recipe(
        inputs={Resource.CLOTH: 3},
        outputs={Resource.CLOTHES: 3},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.CLOTHES: 60},
    ),
    CANDLE_WORKSHOP: _recipe(
        inputs={Resource.WAX: 2, Resource.IRON: 1, Resource.TOOLS: 1},
        outputs={Resource.CANDLES: 3},
        cycle_time=75.0,
        max_workers=2,
        capacity={Resource.CANDLES: 60},
    ),
    JEWELER_WORKSHOP: _recipe(
        inputs={Resource.GOLD: 2, Resource.GEMS: 2},
        outputs={Resource.JEWELRY: 2},
        cycle_time=75.0,
        max_workers=1,
        capacity={Resource.JEWELRY: 50},
    ),
    APIARY: _recipe(
        inputs={},
        outputs={Resource.HONEY: 4, Resource.WAX: 2},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.HONEY: 60, Resource.WAX: 40},
    ),
    HERB_GARDEN: _recipe(
        inputs={},
        outputs={Resource.HERBS: 4},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.HERBS: 80},
    ),
    VINEYARD: _recipe(
        inputs={},
        outputs={Resource.GRAPES: 5},
        cycle_time=60.0,
        max_workers=3,
        capacity={Resource.GRAPES: 90},
    ),
    WINERY: _recipe(
        inputs={Resource.GRAPES: 4},
        outputs={Resource.WINE: 3},
        cycle_time=60.0,
        max_workers=2,
        capacity={Resource.WINE: 60},
    ),
    WAREHOUSE: _recipe(
        inputs={},
        outputs={},
        cycle_time=60.0,
        max_workers=2,
    ),
    GRANARY: _recipe(
        inputs={},
        outputs={},
        cycle_time=60.0,
        max_workers=2,
    ),
    MARKET_STALL: _recipe(
        inputs={Resource.BERRIES: 2, Resource.BREAD: 1, Resource.CHEESE: 1},
        outputs={Resource.HAPPINESS: 4, Resource.GOLD: 2},
        cycle_time=60.0,
        max_workers=2,
    ),
    MANOR_HOUSE: _recipe(
        inputs={},
        outputs={},
        cycle_time=90.0,
        max_workers=1,
    ),
    TAX_OFFICE: _recipe(
        inputs={Resource.HAPPINESS: 2},
        outputs={Resource.GOLD: 3},
        cycle_time=90.0,
        max_workers=2,
    ),
    BAILIFF_OFFICE: _recipe(
        inputs={},
        outputs={},
        cycle_time=90.0,
        max_workers=1,
    ),
    TAVERN: _recipe(
        inputs={Resource.BEER: 2, Resource.BREAD: 1},
        outputs={Resource.HAPPINESS: 6},
        cycle_time=60.0,
        max_workers=3,
    ),
    WOODEN_KEEP: _recipe(
        inputs={},
        outputs={},
        cycle_time=120.0,
        max_workers=0,
    ),
    STONE_KEEP: _recipe(
        inputs={},
        outputs={},
        cycle_time=120.0,
        max_workers=0,
    ),
    BARRACKS: _recipe(
        inputs={Resource.WEAPONS: 1},
        outputs={Resource.SOLDIER: 1},
        cycle_time=90.0,
        max_workers=2,
        capacity={Resource.SOLDIER: 40},
    ),
    WEAPONSMITH: _recipe(
        inputs={Resource.IRON: 2, Resource.COAL: 1, Resource.TOOLS: 1},
        outputs={Resource.WEAPONS: 3},
        cycle_time=75.0,
        max_workers=2,
        capacity={Resource.WEAPONS: 60},
    ),
    SOLDIERS_TRAINING_GROUND: _recipe(
        inputs={Resource.WEAPONS: 2},
        outputs={Resource.SOLDIER: 2},
        cycle_time=90.0,
        max_workers=2,
        capacity={Resource.SOLDIER: 40},
    ),
    ARCHERS_TRAINING_GROUND: _recipe(
        inputs={Resource.WEAPONS: 2},
        outputs={Resource.ARCHER: 2},
        cycle_time=90.0,
        max_workers=2,
        capacity={Resource.ARCHER: 40},
    ),
    FOUNTAIN: _recipe(
        inputs={},
        outputs={},
        cycle_time=120.0,
        max_workers=0,
    ),
    GIANT_GATE: _recipe(
        inputs={},
        outputs={},
        cycle_time=120.0,
        max_workers=0,
    ),
    KNIGHT_STATUE: _recipe(
        inputs={},
        outputs={},
        cycle_time=120.0,
        max_workers=0,
    ),
    GOLDEN_CROSS: _recipe(
        inputs={},
        outputs={},
        cycle_time=120.0,
        max_workers=0,
    ),
    STAINED_GLASS: _recipe(
        inputs={},
        outputs={},
        cycle_time=120.0,
        max_workers=0,
    ),
    SHRINE: _recipe(
        inputs={},
        outputs={},
        cycle_time=120.0,
        max_workers=0,
    ),
    GARDEN: _recipe(
        inputs={},
        outputs={},
        cycle_time=120.0,
        max_workers=0,
    ),
}

TRADE_DEFAULTS: Dict[Resource, Dict[str, float | str]] = {
    Resource.WOOD: {"mode": "pause", "rate": 0.0, "price": 1.0},
    Resource.STICKS: {"mode": "pause", "rate": 0.0, "price": 0.5},
    Resource.STONE: {"mode": "pause", "rate": 0.0, "price": 1.5},
    Resource.ORE: {"mode": "pause", "rate": 0.0, "price": 2.5},
    Resource.GRAIN: {"mode": "pause", "rate": 0.0, "price": 2.0},
    Resource.PLANK: {"mode": "pause", "rate": 0.0, "price": 3.0},
    Resource.TOOLS: {"mode": "pause", "rate": 0.0, "price": 6.0},
    Resource.SEEDS: {"mode": "pause", "rate": 0.0, "price": 1.8},
    Resource.WATER: {"mode": "pause", "rate": 0.0, "price": 0.5},
    Resource.GOLD: {"mode": "pause", "rate": 0.0, "price": 1.0},
    Resource.HOPS: {"mode": "pause", "rate": 0.0, "price": 2.5},
}

CAPACIDADES: Dict[Resource, float] = {
    Resource.WOOD: 500,
    Resource.PLANK: 300,
    Resource.BARRELS: 150,
    Resource.STONE: 500,
    Resource.POLISHED_STONE: 200,
    Resource.IRON_ORE: 300,
    Resource.GOLD_ORE: 200,
    Resource.QUARTZ: 200,
    Resource.IRON: 200,
    Resource.GOLD: 1000,
    Resource.COAL: 250,
    Resource.GLASS: 150,
    Resource.BERRIES: 200,
    Resource.WHEAT: 400,
    Resource.FLOUR: 200,
    Resource.BREAD: 300,
    Resource.WATER: 400,
    Resource.FISH: 200,
    Resource.BOAR_MEAT: 200,
    Resource.MILK: 200,
    Resource.CHEESE: 150,
    Resource.HOPS: 150,
    Resource.BEER: 200,
    Resource.WOOL: 200,
    Resource.CLOTH: 150,
    Resource.CLOTHES: 150,
    Resource.WAX: 150,
    Resource.CANDLES: 120,
    Resource.GEMS: 80,
    Resource.JEWELRY: 80,
    Resource.HONEY: 200,
    Resource.HERBS: 200,
    Resource.GRAPES: 300,
    Resource.WINE: 200,
    Resource.WEAPONS: 150,
    Resource.SOLDIER: 100,
    Resource.ARCHER: 100,
    Resource.HAPPINESS: 1000,
    Resource.STICKS: 200,
    Resource.ORE: 200,
    Resource.SEEDS: 200,
}

# Population configuration
POPULATION_INITIAL: int = 4
POPULATION_CAPACITY: int = 20

WORKERS_INICIALES: int = POPULATION_INITIAL

STARTING_RESOURCES: Dict[Resource, float] = {
    resource: 0.0 for resource in ALL_RESOURCES
}
STARTING_RESOURCES[Resource.GOLD] = 10.0

STARTING_BUILDINGS: Tuple[Mapping[str, object], ...] = (
    {
        "type": WOODCUTTER_CAMP,
        "workers": 0,
        "built": True,
        "enabled": True,
    },
)

SEASON_MODIFIERS: Dict[str, Dict[str, float]] = {
    "Spring": {
        "global": 1.0,
        FARMER: 1.1,
        WHEAT_FARM: 1.1,
        HOP_FARM: 1.05,
    },
    "Summer": {
        "global": 1.0,
        FARMER: 1.2,
        WHEAT_FARM: 1.2,
        STONECUTTER_CAMP: 0.9,
        MINER: 0.9,
    },
    "Autumn": {
        "global": 1.0,
        ARTISAN: 1.15,
        BREWERY: 1.15,
        STONECUTTER_CAMP: 1.05,
        MINER: 1.05,
    },
    "Winter": {
        "global": 1.0,
        FARMER: 0.7,
        WHEAT_FARM: 0.7,
        WOODCUTTER_CAMP: 1.1,
        LUMBER_CAMP: 1.1,
        LUMBER_HUT: 1.1,
        SAWMILL: 1.1,
        STONECUTTER_CAMP: 1.05,
        MINER: 1.05,
    },
}

NOTIFICATION_QUEUE_LIMIT = 50
