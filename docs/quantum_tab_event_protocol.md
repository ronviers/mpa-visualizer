# Quantum-tab event protocol contract

Half-page spec for what `multi_window_fdr_iter` on **surface-code syndrome streams**
will yield, parallel to mpc-glass's primitive of the same name. The contract is
the coordination point between the substrate (`mpc-quantum`) and the visualizer
driver. Substrate produces this shape; visualizer consumes it. Substrate does
the math; visualizer renders.

Last updated: 2026-05-03 (alongside the v8 multi-window protocol implementation
in `mpc-quantum/mpc_quantum_packs/measurements.py`).

---

## Producer / consumer

**Producer.** `mpc_quantum_packs.measurements.multi_window_fdr_iter` —
streaming generator over a Stim-simulated rotated-memory-Z circuit at
distance `d`, paired noise rates `(p_base, p_pert)` with deterministic
seeding for matched-noise pairing, and a list of EMA kernel widths
`tau_windows`. Yields one dict per event.

**Consumer.** `mpc-visualizer/drivers/quantum_syndrome.py` — pure
forwarder. Calls the iterator, forwards events to the SSE queue. No local
math (mirroring `glass_aging.py`).

---

## Run protocol (parallel to glass)

1. **Phase A — kernel warmup** (rounds `0..t_w`): both base and pert
   trajectories run; per-window EMAs `d_unp[k]` accumulate against detection
   events. The kernel needs `~5*max(tau_windows)` rounds to settle into
   steady state. No samples emitted in this phase.
2. **Snapshot** (round `t_w`): freeze `d_at_tw[k] = d_unp[k].copy()` for
   later use as the reference time in `C_d(t, t_w; tau)`.
3. **Phase B — paired observation** (rounds `t_w+1..t_w+t_obs`): both
   trajectories continue; per-window EMAs update on both base and pert
   detection events. At log-spaced sample times `t > t_w`, emit the per-
   window observables.

Because Stim returns the full `(shots, n_detectors)` array up front and
the streaming is over post-processing per round, the "phases" are
structural rather than computational — but the event shape parallels
glass cleanly so the visualizer driver and tab UI can be reused.

---

## Event types (all dicts, all JSON-serialisable)

```
init      — config + sample_times, before any sample event
phase_a   — progress during kernel warmup; sparse, only if progress_every > 0
snapshot  — at t = t_w, EMA frozen as the t_w reference
phase_b   — progress during paired observation; sparse
sample    — meaty event; one per scheduled sample time
complete  — last event
```

### `init`
```json
{
  "type": "init",
  "distance": 3,
  "p_base": 1e-3, "p_pert": 2e-3, "delta_p": 1e-3,
  "n_shots": 256,
  "t_w": 200, "t_obs": 1800,
  "tau_windows": [3, 10, 30, 100, 300, 1000],
  "seed": 1,
  "sample_times": [201, 205, ..., 2000],
  "n_samples_planned": 30,
  "n_stabilisers": 8,
  "n_detectors_per_round": 8
}
```

### `phase_a` (progress only)
```json
{ "type": "phase_a", "t": 100, "t_w": 200, "detection_rate": 0.064 }
```

### `snapshot`
```json
{ "type": "snapshot", "t": 200, "t_w": 200 }
```

### `phase_b` (progress only)
```json
{ "type": "phase_b", "t": 1100, "t_w": 200, "dt": 900, "frac_done": 0.5 }
```

### `sample` — the meaty event
```json
{
  "type": "sample",
  "t": 500, "t_w": 200, "dt": 300,
  "C": 0.012, "chi": 0.084,
  "substrate": {
    "detection_rate_base": 0.064,
    "detection_rate_pert": 0.071,
    "detection_rate_drift": 0.0001
  },
  "per_window": [
    {
      "tau_window": 10,
      "C_d":     0.041,
      "C_d_diag":0.062,
      "chi_d":   0.310,
      "d_norm":  0.249,
      "sigma_d": 0.187
    },
    ...
  ]
}
```

**Top-level** `C`, `chi` are the raw-detection-event single-window
two-time observables (centered base autocorr; ensemble-mean pert−base
response per `delta_p`). They serve as a CK-canonical cross-reference
the same way glass's spin-level `C, chi` do.

**`substrate` block** — direct substrate observables. On syndromes the
analog of glass's `{q_initial, energy_density, magnetization}` is
`detection_rate_*`: the operating-point indicator and its drift. The
*q_EA-equivalent* for syndromes is read from `per_window[k].C_d_diag`'s
late-time saturation (the trail-vector self-overlap per kernel width);
no separate substrate field needed.

**`per_window[k]`** — trail-vector observables at kernel width
`tau_windows[k]`, computed as `mean over (shots, stabilisers)`:
- `C_d`     = ⟨ d_i(t) · d_i(t_w) ⟩  (two-time trail correlation)
- `C_d_diag`= ⟨ d_i(t)² ⟩            (self-overlap; q_EA,d analog)
- `chi_d`   = (⟨d_i_per(t)⟩ − ⟨d_i_unp(t)⟩) / delta_p
- `d_norm`  = √⟨ d_i(t)² ⟩            (bulk stability)
- `sigma_d` = spatial std            (heterogeneity proxy)

These are *raw* observables. Regime classification, FDR ratio, locus
geometry, and v8 §5 c/s/r reading are *post-pass enrichment* applied
by `enrich_sample` (substrate-side helper, mirrors glass).

### `complete`
```json
{ "type": "complete", "t_w": 200, "t_obs": 1800, "tau_windows": [...] }
```

---

## v8 §5 reading — what the consumer reads off `per_window`

For each window `k`, the empirical parametric locus is `(ΔC_d, χ_d)` where
`ΔC_d = C_d_diag − C_d`. The dimensionless invariant is **fractional
decorrelation** `f = ΔC_d / C_d_diag`. v8 §5 / Appendix E read the
hierarchy migration off this directly. The classifier in
`enrich_sample` thresholds `f`:

| `f` range | v8 vertex regime |
|---|---|
| `f < 0.20` | **c_like** — memory dominates |
| `0.20 ≤ f < 0.70` | **s_like** — aging in progress |
| `f ≥ 0.70` | **r_like** — decorrelated (FDT-line traversal) |
| late `χ_d < 0` sustained | **k_like** — k_frust signature (overrides f) |

**Substrate-conditional direction (mpc-quantum FOOTING F-018).** v8 §5's
prose says narrow τ → c-like, broad τ → r-like. **On surface-code
syndrome streams this direction is *inverted*:** narrow τ << τ_event reads
r-like (kernel sees iid noise), meso τ ~ τ_event reads s-like, broad
τ >> τ_event reads c-like (memory-dominated). The substrate's
commitment timescale is τ_event ~ 1/p_eff, so the optimum-`f` kernel
τ* shifts inward with operating noise. This is consistent with v8
Appendix F.3's substrate-conditional-reading principle.

**Lesson from Session 5.** Session 5 read the spectrum via R =
late_slope / early_slope and flagged narrow τ as "denominator-limited /
measurement-resolution artefact." Under v8's `f`-based reading, narrow
τ on syndromes is genuinely **r_like_iid** (full decorrelation, kernel
below event scale). The R diagnostic was structurally blind to this;
`f` reads it cleanly.

---

## Substrate dependencies

The producer needs (read-only):
- `stim` (Python package, on PyPI)
- `numpy`
- `mpc_quantum_kernel/...` already in-tree at `H:\mpc-quantum`

The consumer driver needs (read-only):
- the producer module above, imported by adding `H:\mpc-quantum` to
  `sys.path` lazily on instantiation (mirrors `glass_aging.py`).

No backwards coupling: `mpc-quantum` does not know the visualizer exists.
