"""Cross-substrate driver — runs glass then quantum back-to-back, tags events.

Step 4 of the v8 cross-substrate dial-in. Surface the F-018 inverted hierarchy
walk on two substrates simultaneously. The visualizer is a viewer; both
streaming primitives belong to their substrates.

Design:
  1. Run mpc-glass `multi_window_fdr_iter` to completion.
  2. Run mpc-quantum `multi_window_fdr_iter` to completion.
  3. Every forwarded event is tagged with `substrate ∈ {"glass", "quantum"}`
     so the frontend can route it.
  4. Emit framing events `substrate_start` and `substrate_complete` around
     each substrate's stream.

Single-thread sequential by design: the verification doesn't need them
concurrent, and threading complicates teardown. Stop is honored between
substrates and at every iterator step.
"""
from __future__ import annotations

import math
import queue
import sys
import threading
from typing import Optional

from .base import TabSpec, q_int, q_float, q_str


_GLASS_ROOT = r"H:\mpc-glass"
_QUANTUM_ROOT = r"H:\mpc-quantum"


def _ensure_path(p: str) -> None:
    if p not in sys.path:
        sys.path.insert(0, p)


def _scrub_nan(obj):
    """Translate non-finite floats to None for JSON wire safety. Browser
    JSON.parse rejects bare NaN; Python's json.dumps emits it. quantum's
    enrich_sample can yield NaN on degenerate samples (small ΔC_d / C_d_diag);
    glass shouldn't but the cost of being defensive is negligible."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: _scrub_nan(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_scrub_nan(v) for v in obj]
    return obj


SPEC = TabSpec(
    name="cross",
    display_name="cross · glass + quantum",
    blurb=(
        "Cross-substrate F-018 verification: surface the v8 §5 hierarchy "
        "walk on glass aging and surface-code syndromes side-by-side. "
        "Same inverted direction (narrow τ → r_like, broad τ → c_like) on "
        "two distinct substrates is the cross-substrate transfer claim."
    ),
    page_path="/static/cross/index.html",
    script_path="/static/cross/tab.js",
    style_path="/static/cross/tab.css",
)


class CrossSubstrateRunner:
    """Composite worker. Runs glass, then quantum, both as pure consumers
    of their substrates' streaming primitives. No local math.
    """

    def __init__(
        self,
        q: "queue.Queue[dict]",
        # glass knobs
        g_L: int = 8,
        g_T: float = 0.66,
        g_t_w: int = 200,
        g_t_obs: int = 3000,
        g_tau_windows: list[int] | None = None,
        g_h_field: float = 0.10,
        g_seed: int = 0,
        g_progress_every: int = 100,
        # quantum knobs
        q_distance: int = 3,
        q_p_base: float = 1e-3,
        q_delta_p: float = 1e-3,
        q_n_shots: int = 128,
        q_t_w: int = 200,
        q_t_obs: int = 3000,
        q_tau_windows: list[float] | None = None,
        q_seed: int = 1,
        q_progress_every: int = 100,
    ):
        self.q = q
        self.g_L = max(4, int(g_L))
        self.g_T = float(g_T)
        self.g_t_w = max(1, int(g_t_w))
        self.g_t_obs = max(10, int(g_t_obs))
        self.g_tau_windows = list(g_tau_windows) if g_tau_windows else [10, 30, 100, 300]
        self.g_h_field = float(g_h_field)
        self.g_seed = int(g_seed)
        self.g_progress_every = max(0, int(g_progress_every))

        self.q_distance = max(3, int(q_distance))
        self.q_p_base = float(q_p_base)
        self.q_delta_p = float(q_delta_p)
        self.q_n_shots = max(16, int(q_n_shots))
        self.q_t_w = max(1, int(q_t_w))
        self.q_t_obs = max(10, int(q_t_obs))
        self.q_tau_windows = (
            list(q_tau_windows) if q_tau_windows
            else [3.0, 10.0, 30.0, 100.0, 300.0]
        )
        self.q_seed = int(q_seed)
        self.q_progress_every = max(0, int(q_progress_every))

        self._stop = threading.Event()

    def stop(self) -> None:
        self._stop.set()

    def emit(self, event: dict) -> None:
        try:
            self.q.put_nowait(event)
        except queue.Full:
            pass

    def run(self) -> None:
        try:
            self._run_inner()
        except Exception as exc:
            import traceback
            self.emit({
                "type": "error",
                "msg": f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}",
            })
            return
        self.emit({"type": "shutdown"})

    def _run_inner(self) -> None:
        # Run glass first — usually faster than quantum at the same budget,
        # so the user sees something on screen sooner.
        if not self._stop.is_set():
            self._run_glass()
        if not self._stop.is_set():
            self._run_quantum()

    # ── glass ──────────────────────────────────────────────────────────────

    def _run_glass(self) -> None:
        _ensure_path(_GLASS_ROOT)
        try:
            from mpc_glass_packs.measurements import (
                multi_window_fdr_iter,
                enrich_sample,
            )
        except Exception as exc:
            self.emit({
                "type": "error",
                "msg": (
                    f"glass substrate import failed: {type(exc).__name__}: "
                    f"{exc}. Check that {_GLASS_ROOT} is reachable and "
                    "mpc_glass_packs.measurements exposes "
                    "`multi_window_fdr_iter` and `enrich_sample`."
                ),
            })
            return

        self.emit({
            "type": "substrate_start",
            "substrate": "glass",
            "config": {
                "L": self.g_L, "T": self.g_T,
                "t_w": self.g_t_w, "t_obs": self.g_t_obs,
                "tau_windows": list(self.g_tau_windows),
                "h_field": self.g_h_field, "seed": self.g_seed,
            },
        })

        for event in multi_window_fdr_iter(
            L=self.g_L, T=self.g_T,
            t_w=self.g_t_w, t_obs=self.g_t_obs,
            tau_windows=self.g_tau_windows, h_field=self.g_h_field,
            seed=self.g_seed, progress_every=self.g_progress_every,
        ):
            if self._stop.is_set():
                return
            event = dict(event)
            event["substrate"] = "glass"
            if event["type"] == "sample":
                event["per_window"] = [dict(w) for w in event["per_window"]]
                # glass's enrich_sample mutates in place.
                enrich_sample(event, self.g_T)
            self.emit(_scrub_nan(event))

        self.emit({"type": "substrate_complete", "substrate": "glass"})

    # ── quantum ────────────────────────────────────────────────────────────

    def _run_quantum(self) -> None:
        _ensure_path(_QUANTUM_ROOT)
        try:
            from mpc_quantum_packs.measurements import (
                multi_window_fdr_iter,
                enrich_sample,
            )
        except Exception as exc:
            self.emit({
                "type": "error",
                "msg": (
                    f"quantum substrate import failed: {type(exc).__name__}: "
                    f"{exc}. Check that {_QUANTUM_ROOT} is reachable, "
                    "mpc_quantum_packs.measurements exposes "
                    "`multi_window_fdr_iter` and `enrich_sample`, and "
                    "`stim` is installed."
                ),
            })
            return

        self.emit({
            "type": "substrate_start",
            "substrate": "quantum",
            "config": {
                "distance": self.q_distance,
                "p_base": self.q_p_base, "delta_p": self.q_delta_p,
                "n_shots": self.q_n_shots,
                "t_w": self.q_t_w, "t_obs": self.q_t_obs,
                "tau_windows": list(self.q_tau_windows),
                "seed": self.q_seed,
            },
        })

        for event in multi_window_fdr_iter(
            distance=self.q_distance,
            p_base=self.q_p_base, delta_p=self.q_delta_p,
            n_shots=self.q_n_shots,
            t_w=self.q_t_w, t_obs=self.q_t_obs,
            tau_windows=self.q_tau_windows,
            seed=self.q_seed, progress_every=self.q_progress_every,
        ):
            if self._stop.is_set():
                return
            if event["type"] == "sample":
                # quantum's enrich_sample returns a NEW dict.
                event = enrich_sample(event)
            event = dict(event)
            event["substrate"] = "quantum"
            self.emit(_scrub_nan(event))

        self.emit({"type": "substrate_complete", "substrate": "quantum"})


class CrossSubstrateFactory:
    spec = SPEC

    @staticmethod
    def _parse_int_taus(raw: str, fallback: list[int]) -> list[int]:
        out: list[int] = []
        for s in raw.replace(";", ",").split(","):
            s = s.strip()
            if not s:
                continue
            try:
                out.append(int(float(s)))
            except ValueError:
                pass
        return out or list(fallback)

    @staticmethod
    def _parse_float_taus(raw: str, fallback: list[float]) -> list[float]:
        out: list[float] = []
        for s in raw.replace(";", ",").split(","):
            s = s.strip()
            if not s:
                continue
            try:
                out.append(float(s))
            except ValueError:
                pass
        return out or list(fallback)

    def make_worker(self, q: "queue.Queue[dict]", params: dict) -> CrossSubstrateRunner:
        g_tau = self._parse_int_taus(
            q_str(params, "g_tau", "10,30,100,300"),
            [10, 30, 100, 300],
        )
        q_tau = self._parse_float_taus(
            q_str(params, "q_tau", "3,10,30,100,300"),
            [3.0, 10.0, 30.0, 100.0, 300.0],
        )
        return CrossSubstrateRunner(
            q,
            g_L=q_int(params, "g_L", 8),
            g_T=q_float(params, "g_T", 0.66),
            g_t_w=q_int(params, "g_t_w", 200),
            g_t_obs=q_int(params, "g_t_obs", 3000),
            g_tau_windows=g_tau,
            g_h_field=q_float(params, "g_h", 0.10),
            g_seed=q_int(params, "g_seed", 0),
            g_progress_every=q_int(params, "g_progress_every", 100),
            q_distance=q_int(params, "q_distance", 3),
            q_p_base=q_float(params, "q_p_base", 1e-3),
            q_delta_p=q_float(params, "q_delta_p", 1e-3),
            q_n_shots=q_int(params, "q_n_shots", 128),
            q_t_w=q_int(params, "q_t_w", 200),
            q_t_obs=q_int(params, "q_t_obs", 3000),
            q_tau_windows=q_tau,
            q_seed=q_int(params, "q_seed", 1),
            q_progress_every=q_int(params, "q_progress_every", 100),
        )


__all__ = ["SPEC", "CrossSubstrateFactory", "CrossSubstrateRunner"]
