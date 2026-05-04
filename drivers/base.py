"""TabDriver protocol — the spine of the dedicated visualizer.

A driver is a substrate-specific worker that:
- accepts a config dict (parsed from query string),
- streams JSON-serialisable events into a queue,
- and tears down cleanly when asked.

The HTTP server in `server.py` knows nothing about substrates. It picks a
driver by tab name, hands it a config + a queue, runs `worker.run()` on a
thread, and forwards events to the SSE client.

Every driver:
- has a stable `name` (URL slug) and `display_name`,
- declares the static assets its tab page consumes (`page_path`, etc.),
- and implements `run(self) -> None` (blocking; pushes events into `self.q`)
  plus `stop(self) -> None` (idempotent).

Events are plain dicts with a `"type"` key. Two reserved types:
- `error`: `{"type": "error", "msg": "..."}` — terminal.
- `shutdown`: `{"type": "shutdown"}` — driver exited cleanly.

Everything else is driver-specific and rendered by `tab.js`.
"""
from __future__ import annotations

import queue
import threading
from dataclasses import dataclass
from typing import Optional, Protocol


@dataclass(frozen=True)
class TabSpec:
    """Static metadata about a tab. Surfaced by `GET /tabs.json` so the shell
    can build a tab nav without knowing what substrates exist."""
    name: str           # URL slug, e.g. "brain" or "glass"
    display_name: str   # human label, e.g. "Brain · maze trajectory"
    blurb: str          # one-line description for the tab nav tooltip
    page_path: str      # static path to the tab's HTML snippet (loaded into shell)
    script_path: str    # static path to the tab's JS module
    style_path: str     # static path to the tab's CSS


class DriverWorker(Protocol):
    """A running substrate worker. Created per-stream by a driver factory.

    `run()` is invoked on a worker thread; it MUST push events into `self.q`
    (a queue.Queue) until either `_stop` is set or the run finishes naturally.
    On exit it MUST emit a `shutdown` event so the SSE handler can close the
    connection cleanly.
    """
    q: "queue.Queue[dict]"
    _stop: threading.Event

    def run(self) -> None: ...
    def stop(self) -> None: ...


class DriverFactory(Protocol):
    """Builds a worker for a single SSE connection.

    Implementations parse the per-tab query string (a dict[str, list[str]]
    from urllib.parse.parse_qs) into config and instantiate the worker.
    The factory itself is stateless; per-run state lives on the worker.
    """
    spec: TabSpec

    def make_worker(
        self,
        q: "queue.Queue[dict]",
        params: dict,
    ) -> DriverWorker: ...


# ── Helpers shared by all drivers ──────────────────────────────────────────


def q_int(qs: dict, name: str, default: int) -> int:
    """Pull an int from a parse_qs-style dict; tolerate junk."""
    try:
        return int(qs.get(name, [str(default)])[0])
    except (ValueError, TypeError):
        return default


def q_float(qs: dict, name: str, default: float) -> float:
    try:
        return float(qs.get(name, [str(default)])[0])
    except (ValueError, TypeError):
        return default


def q_bool(qs: dict, name: str, default: bool) -> bool:
    raw = qs.get(name, [str(int(default))])[0]
    return raw not in ("0", "false", "False", "")


def q_str(qs: dict, name: str, default: str) -> str:
    return qs.get(name, [default])[0]


__all__ = [
    "TabSpec",
    "DriverWorker",
    "DriverFactory",
    "q_int",
    "q_float",
    "q_bool",
    "q_str",
]
