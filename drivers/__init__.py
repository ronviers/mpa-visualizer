"""Per-substrate driver pack for the mpa-visualizer.

Each driver wraps one substrate (mpc-glass aging, mpc-quantum syndrome
batches, mpa-brain spectrum, ...) behind the `TabDriver` protocol defined
in `base.py`. The visualizer's `server.py` is a thin router; drivers are
the place where substrate-specific imports, simulators, and adapters live.

Discipline (RULES.md rule 4 — substrate produces, visualizer consumes,
one direction):
- Substrate projects do not know the visualizer exists. Drivers reach in.
- Adapters break here when substrate code changes; the visualizer fixes its
  driver, never asks the substrate to accommodate.
- Each driver is loaded lazily in `server._DRIVER_MODULES` so that a
  missing/broken substrate import only disables its own tab, not the
  whole shell.
"""
from __future__ import annotations

from . import base

__all__ = ["base"]
