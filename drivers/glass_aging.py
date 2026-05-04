"""Glass · 3D EA aging driver — pure consumer of `mpc_glass_packs.measurements`.

The visualizer is a viewer. All MPA math lives in `mpc-glass`:

  - Protocol primitive  : `multi_window_fdr_iter` (streaming generator)
  - Aggregation wrapper : `multi_window_fdr_run`  (consumes the iterator)
  - v8-aligned regime   : `classify_fdr_shape`    (FDR-shape classifier; v8 §5)
  - v8-aligned envelope : `regime_envelope`       (parametric (ΔC, χ) curve)
  - Sample enrichment   : `enrich_sample`         (adds regime, R, Z, envelope)

This driver:
  1. Calls `multi_window_fdr_iter` with the run config from the SSE query string.
  2. Calls `enrich_sample` to layer regime classification + envelope geometry on
     each raw sample event.
  3. Forwards events to the SSE queue.

That is the entire substantive content. No EMA bookkeeping, no FDR observable
computation, no regime classifier, no envelope shape generator — those are
mpc-glass's job and they live there.

Substrate dependency: imports from `H:\\mpc-glass` read-only. The substrate
project does not know this driver exists.
"""
from __future__ import annotations

import os
import queue
import sys
import threading
import time
from typing import Optional

from .base import TabSpec, q_int, q_float, q_bool, q_str


# ── Wire mpc-glass into sys.path. Lazy: only on instantiation, so a missing
#    mpc-glass doesn't disable the brain tab. ──────────────────────────────

_GLASS_ROOT = r"H:\mpc-glass"


def _ensure_glass_path():
    if _GLASS_ROOT not in sys.path:
        sys.path.insert(0, _GLASS_ROOT)


# ── Tab metadata ───────────────────────────────────────────────────────────

SPEC = TabSpec(
    name="glass",
    display_name="glass · 3D EA aging",
    blurb=(
        "Multi-window FDR locus on 3D Edwards–Anderson aging dynamics. "
        "Lockstep MPA classifier in real time; ribbon view of empirical vs "
        "predicted envelopes."
    ),
    page_path="/static/glass/index.html",
    script_path="/static/glass/tab.js",
    style_path="/static/glass/tab.css",
)


# ── Worker: pure consumer of mpc-glass's streaming primitive ──────────────


class GlassAgingRunner:
    """Iterates `multi_window_fdr_iter` from mpc-glass, enriches each sample
    with v8 §5 regime + envelope geometry, and forwards events to the SSE
    queue. No local math.
    """

    def __init__(
        self,
        q: "queue.Queue[dict]",
        L: int = 8,
        T: float = 0.66,
        t_w: int = 100,
        t_obs: int = 1000,
        tau_windows: list[int] | None = None,
        h_field: float = 0.10,
        seed: int = 0,
        progress_every: int = 25,
        n_realizations: int = 1,
    ):
        self.q = q
        self.L = max(4, int(L))
        self.T = float(T)
        self.t_w = max(1, int(t_w))
        self.t_obs = max(10, int(t_obs))
        self.tau_windows = list(tau_windows) if tau_windows else [10, 100, 1000, 10000]
        self.h_field = float(h_field)
        self.seed = int(seed)
        self.progress_every = max(1, int(progress_every))
        self.n_realizations = max(1, int(n_realizations))
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
        _ensure_glass_path()
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

        # The driver runs n_real realisations in series, each as its own
        # independent paired-trajectory call to the mpc-glass primitive.
        # Each event is tagged with `realisation` so the consumer can render
        # per-realisation traces; averaging is the consumer's concern.
        # For n_real=1 the realisation index is just 0.
        n_real = self.n_realizations
        first_init_emitted = False

        for r in range(n_real):
            if self._stop.is_set():
                return
            for event in multi_window_fdr_iter(
                L=self.L, T=self.T, t_w=self.t_w, t_obs=self.t_obs,
                tau_windows=self.tau_windows, h_field=self.h_field,
                seed=self.seed + 1000 * r,
                # progress events only on the first realisation; cadence is
                # identical across realisations so doubling them is just noise.
                progress_every=self.progress_every if r == 0 else 0,
            ):
                if self._stop.is_set():
                    return
                etype = event["type"]
                if etype == "init":
                    if first_init_emitted:
                        # Only emit one init for the whole run.
                        continue
                    event = dict(event)
                    event["n_realizations"] = n_real
                    self.emit(event)
                    first_init_emitted = True
                    continue
                if etype == "complete":
                    # Emit complete only after the LAST realisation.
                    if r != n_real - 1:
                        continue
                    event = dict(event)
                    event["n_realizations"] = n_real
                    self.emit(event)
                    continue
                # phase_a, phase_b, snapshot: tag with realisation but only
                # forward from the first realisation (avoids duplicate ticks).
                if etype in ("phase_a", "phase_b", "snapshot"):
                    if r != 0:
                        continue
                    event = dict(event)
                    event["realisation"] = r
                    self.emit(event)
                    continue
                if etype == "sample":
                    # Tag with realisation index, enrich with v8 §5 helpers,
                    # and forward. The consumer can group by realisation
                    # and/or compute running averages.
                    event = dict(event)
                    event["realisation"] = r
                    event["n_realizations"] = n_real
                    # per_window dicts are mutable; clone them so each
                    # realisation's enrichment is independent.
                    event["per_window"] = [dict(w) for w in event["per_window"]]
                    enrich_sample(event, self.T)
                    self.emit(event)


# ── Driver factory ─────────────────────────────────────────────────────────


class GlassAgingFactory:
    spec = SPEC

    def make_worker(self, q: "queue.Queue[dict]", params: dict) -> GlassAgingRunner:
        tau_str = q_str(params, "tau_windows", "10,100,1000,10000")
        tau_windows = []
        for s in tau_str.replace(";", ",").split(","):
            s = s.strip()
            if not s:
                continue
            try:
                tau_windows.append(int(float(s)))
            except ValueError:
                pass
        if not tau_windows:
            tau_windows = [10, 100, 1000, 10000]

        return GlassAgingRunner(
            q,
            L=q_int(params, "L", 8),
            T=q_float(params, "T", 0.66),
            t_w=q_int(params, "t_w", 100),
            t_obs=q_int(params, "t_obs", 1000),
            tau_windows=tau_windows,
            h_field=q_float(params, "h", 0.10),
            seed=q_int(params, "seed", 0),
            progress_every=q_int(params, "progress_every", 25),
            n_realizations=q_int(params, "n_real", 1),
        )


__all__ = ["SPEC", "GlassAgingFactory", "GlassAgingRunner"]
