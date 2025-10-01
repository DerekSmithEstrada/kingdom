"""Season and time tracking for the game."""
from __future__ import annotations

from typing import List


class SeasonClock:
    """Rotating season clock with fixed durations."""

    def __init__(self, seasons: List[str] | None = None, season_duration: float = 180.0) -> None:
        self.seasons = seasons or ["primavera", "verano", "otoño", "invierno"]
        self.season_duration = season_duration
        self.current_index = 0
        self.time_left = season_duration

    def update(self, dt: float) -> None:
        self.time_left -= dt
        while self.time_left <= 0:
            self.current_index = (self.current_index + 1) % len(self.seasons)
            self.time_left += self.season_duration

    def get_current_season(self) -> str:
        return self.seasons[self.current_index]

    def get_time_left(self) -> float:
        return max(0.0, self.time_left)

    def to_dict(self) -> dict:
        return {
            "current_season": self.get_current_season(),
            "time_left": self.get_time_left(),
        }

    def load(self, season: str, time_left: float) -> None:
        if season in self.seasons:
            self.current_index = self.seasons.index(season)
        else:
            self.seasons.insert(0, season)
            self.current_index = 0
        self.time_left = max(0.0, time_left)
