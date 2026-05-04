"""Quantum syndrome driver — pure consumer of `mpc_quantum_packs.measurements`.

Mirrors `drivers.glass_aging`. The visualizer is a viewer; all MPA math lives
in mpc-quantum:

  - Protocol primitive  : `multi_window_fdr_iter` (streaming generator)
  - Aggregation wrapper : `multi_window_fdr_run`  (consumes the iterator)
  - v8 enrichment       : `enrich_sample`         (locus geometry + regime_v8)

This driver:
  1. Calls `multi_window_fdr_iter` with the run config from the SSE query string.
  2. Calls `enrich_sample(event)` to layer locus geometry on each raw sample.
  3. Forwards events to the SSE queue.

Substrate dependency: imports from H:\\mpc-quantum read-only. The substrate
project does not know this driver exists.

Contract: H:/mpa-visualizer/docs/quantum_tab_event_protocol.md.
Substrate-conditional reading rule: mpc-quantum FOOTING F-018 — on syndrome
streams the v8 §5 hierarchy walks the τ-axis in *inverted* direction from
v8 §5's prose. Narrow τ → r_like (kernel sees iid noise); broad τ → c_like
(memory dominates). The classifier in `enrich_sample` reads `f =
ΔC_d / C_d_diag` and is direction-agnostic; the inversion is just what the
data says when read against the prose.
"""
from __future__ import annotations

import math
import os
import queue
import sys
import threading
import time
from typing import Optional

from .base import TabSpec, q_int, q_float, q_bool, q_str


def _scrub_nan(obj):
    """Recursively replace non-finite floats with None for JSON wire safety.

    The substrate's `enrich_sample` emits float('nan') for ill-defined fields
    (`local_X` when ΔC_d is too small, `frac_decorr` when C_d_diag is too
    small). Python's json.dumps allows the literal `NaN` token, but
    browser JSON.parse rejects it — every affected sample would be silently
    dropped client-side. Translate at the wire boundary."""
    if isinstance(obj, float):
        if math.isfinite(obj):
            return obj
        return None
    if isinstance(obj, dict):
        return {k: _scrub_nan(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_scrub_nan(v) for v in obj]
    return obj


# ── Wire mpc-quantum into sys.path. Lazy: only on instantiation. ──────────

_QUANTUM_ROOT = r"H:\mpc-quantum"


def _ensure_quantum_path():
    if _QUANTUM_ROOT not in sys.path:
        sys.path.insert(0, _QUANTUM_ROOT)


# ── Tab metadata ───────────────────────────────────────────────────────────

SPEC = TabSpec(
    name="quantum",
    display_name="quantum · surface-code syndromes",
    blurb=(
        "v8 multi-window FDR locus on rotated-memory-Z surface-code syndromes "
        "(distance-d Stim sims). Substrate-conditional inverted hierarchy "
        "migration (FOOTING F-018): narrow τ → r_like (iid), broad τ → c_like "
        "(memory)."
    ),
    page_path="/static/quantum/index.html",
    script_path="/static/quantum/tab.js",
    style_path="/static/quantum/tab.css",
)


# ── Worker: pure consumer of mpc-quantum's streaming primitive ────────────


class QuantumSyndromeRunner:
    """Iterates `multi_window_fdr_iter` from mpc-quantum, enriches each
    sample with v8 §5 locus geometry, and forwards events to the SSE queue.
    No local math.
    """

    def __init__(
        self,
        q: "queue.Queue[dict]",
        distance: int = 3,
        p_base: float = 1e-3,
        delta_p: float = 1e-3,
        n_shots: int = 256,
        t_w: int = 200,
        t_obs: int = 1800,
        tau_windows: list[float] | None = None,
        seed: int = 1,
        progress_every: int = 50,
    ):
        self.q = q
        self.distance = max(3, int(distance))
        self.p_base = float(p_base)
        self.delta_p = float(delta_p)
        self.n_shots = max(16, int(n_shots))
        self.t_w = max(1, int(t_w))
        self.t_obs = max(10, int(t_obs))
        self.tau_windows = (
            list(tau_windows) if tau_windows
            else [3.0, 10.0, 30.0, 100.0, 300.0, 1000.0]
        )
        self.seed = int(seed)
        self.progress_every = max(0, int(progress_every))
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
        _ensure_quantum_path()
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

        for event in multi_window_fdr_iter(
            distance=self.distance,
            p_base=self.p_base,
            delta_p=self.delta_p,
            n_shots=self.n_shots,
            t_w=self.t_w,
            t_obs=self.t_obs,
            tau_windows=self.tau_windows,
            seed=self.seed,
            progress_every=self.progress_every,
        ):
            if self._stop.is_set():
                return
            etype = event["type"]
            if etype == "sample":
                # quantum's enrich_sample returns a NEW dict (does not mutate
                # in place; differs from glass's signature). Use the return.
                event = enrich_sample(event)
            self.emit(_scrub_nan(event))


# ── Driver factory ─────────────────────────────────────────────────────────


class QuantumSyndromeFactory:
    spec = SPEC

    def make_worker(self, q: "queue.Queue[dict]", params: dict) -> QuantumSyndromeRunner:
        tau_str = q_str(params, "tau_windows", "3,10,30,100,300,1000")
        tau_windows: list[float] = []
        for s in tau_str.replace(";", ",").split(","):
            s = s.strip()
            if not s:
                continue
            try:
                tau_windows.append(float(s))
            except ValueError:
                pass
        if not tau_windows:
            tau_windows = [3.0, 10.0, 30.0, 100.0, 300.0, 1000.0]

        return QuantumSyndromeRunner(
            q,
            distance=q_int(params, "distance", 3),
            p_base=q_float(params, "p_base", 1e-3),
            delta_p=q_float(params, "delta_p", 1e-3),
            n_shots=q_int(params, "n_shots", 256),
            t_w=q_int(params, "t_w", 200),
            t_obs=q_int(params, "t_obs", 1800),
            tau_windows=tau_windows,
            seed=q_int(params, "seed", 1),
            progress_every=q_int(params, "progress_every", 50),
        )


__all__ = ["SPEC", "QuantumSyndromeFactory", "QuantumSyndromeRunner"]
