"""Background scheduler for running the game tick loop."""
from __future__ import annotations

import asyncio
import threading
from typing import Optional

from .game_state import get_game_state


_loop_thread: Optional[threading.Thread] = None
_loop_lock = threading.Lock()


async def _run_tick_loop(interval: float) -> None:
    state = get_game_state()
    while True:
        try:
            state.tick(interval)
        except Exception:
            # Avoid breaking the loop on unexpected errors; log via print.
            import traceback

            traceback.print_exc()
        await asyncio.sleep(interval)


def ensure_tick_loop(interval: float = 1.0) -> None:
    """Start the asynchronous tick loop if it is not already running."""

    global _loop_thread
    with _loop_lock:
        if _loop_thread and _loop_thread.is_alive():
            return

        def runner() -> None:
            asyncio.run(_run_tick_loop(interval))

        thread = threading.Thread(target=runner, name="game-tick-loop", daemon=True)
        thread.start()
        _loop_thread = thread
