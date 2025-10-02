"""Season and time tracking for the game."""
from __future__ import annotations

from typing import Dict, List, Mapping


class SeasonClock:
    """Rotating season clock with fixed durations."""

    SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter"]
    SEASON_COLORS = {
        "Spring": "#FACC15",
        "Summer": "#22C55E",
        "Autumn": "#B45309",
        "Winter": "#38BDF8",
    }

    def __init__(
        self,
        seasons: List[str] | None = None,
        season_duration: float = 180.0,
        season_modifiers: Mapping[str, Mapping[str, float]] | None = None,
    ) -> None:
        self.seasons = list(seasons or self.SEASON_NAMES)
        self.ticks_per_season = float(season_duration)
        self.current_index = 0
        self.tick_within_season = 0.0
        self._season_modifiers: Dict[str, Dict[str, float]] = {
            season: {str(key): float(value) for key, value in modifiers.items()}
            for season, modifiers in (season_modifiers or {}).items()
        }

    # ------------------------------------------------------------------
    def update(self, dt: float) -> None:
        """Advance the clock ``dt`` ticks, rolling seasons as required."""

        if dt <= 0:
            return
        self.tick_within_season += dt
        while self.tick_within_season >= self.ticks_per_season and self.ticks_per_season > 0:
            self.tick_within_season -= self.ticks_per_season
            self.current_index = (self.current_index + 1) % len(self.seasons)

    # ------------------------------------------------------------------
    def get_current_season(self) -> str:
        return self.seasons[self.current_index]

    def get_time_left(self) -> float:
        return max(0.0, self.ticks_per_season - self.tick_within_season)

    def get_progress(self) -> float:
        if self.ticks_per_season <= 0:
            return 0.0
        progress = self.tick_within_season / self.ticks_per_season
        return min(max(progress, 0.0), 1.0)

    def get_color(self) -> str:
        return self.SEASON_COLORS.get(self.get_current_season(), "#38BDF8")

    def to_dict(self) -> Dict[str, float | int | str]:
        return {
            "season_name": self.get_current_season(),
            "season_index": self.current_index,
            "progress": self.get_progress(),
            "color_hex": self.get_color(),
        }

    # ------------------------------------------------------------------
    def get_modifiers(self, building_tag: str | None = None) -> Dict[str, float]:
        """Return the active modifier mapping for ``building_tag`` in this season."""

        season_name = self.get_current_season()
        season_modifiers = self._season_modifiers.get(season_name, {})
        modifiers: Dict[str, float] = {
            "global": float(season_modifiers.get("global", 1.0))
        }
        if building_tag:
            modifiers[building_tag] = float(season_modifiers.get(building_tag, 1.0))
        return modifiers

    def modifiers_payload(self, building_tag: str | None = None) -> Dict[str, object]:
        """Return UI-friendly data describing the modifiers applied."""

        values = self.get_modifiers(building_tag)
        total = 1.0
        breakdown = []
        payload_values: Dict[str, float] = {}
        for source, multiplier in values.items():
            factor = float(multiplier)
            payload_values[source] = factor
            breakdown.append(
                {
                    "source": source,
                    "multiplier": factor,
                    "percent": (factor - 1.0) * 100.0,
                }
            )
            total *= factor
        return {
            "season": self.get_current_season(),
            "values": payload_values,
            "breakdown": breakdown,
            "total_multiplier": total,
        }

    def export_state(self) -> Dict[str, float | int]:
        return {
            "season_index": self.current_index,
            "tick_within_season": self.tick_within_season,
            "ticks_per_season": self.ticks_per_season,
        }

    def load(self, season: str | Dict[str, float | int], time_left: float | None = None) -> None:
        """Restore state from historical data.

        The legacy format (``season`` + ``time_left``) is still supported in
        addition to the structured ``clock`` payload.
        """

        if isinstance(season, dict):
            data = season
            index = int(data.get("season_index", self.current_index))
            self.current_index = index % max(1, len(self.seasons))
            self.ticks_per_season = float(data.get("ticks_per_season", self.ticks_per_season))
            self.tick_within_season = float(data.get("tick_within_season", self.tick_within_season))
            # Clamp against negative or overflow values.
            if self.tick_within_season < 0:
                self.tick_within_season = 0.0
            if self.ticks_per_season <= 0:
                self.ticks_per_season = 1.0
            self.tick_within_season %= self.ticks_per_season
            return

        if season in self.seasons:
            self.current_index = self.seasons.index(season)
        else:
            self.seasons.insert(0, season)
            self.current_index = 0
        self.tick_within_season = 0.0
        if time_left is not None:
            inferred = max(0.0, float(time_left))
            self.tick_within_season = max(0.0, self.ticks_per_season - inferred)
