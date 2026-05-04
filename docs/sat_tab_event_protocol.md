# SAT-tab event protocol contract

Half-page spec for what `multi_window_fdr_iter` on **WalkSAT trajectories
over random k-SAT instances** will yield, parallel to mpc-glass's and
mpc-quantum's primitives of the same name. The contract is the
coordination point between the substrate (`mpc-sat`) and the visualizer
driver. Substrate produces this shape; visualizer consumes it. Substrate
does the math; visualizer renders.

Last updated: 2026-05-03 (alongside the v8 multi-window protocol
implementation in
[`H:\mpc-sat\mpc_sat_packs\measurements.py`](../../mpc-sat/mpc_sat_packs/measurements.py)
landed at mpc-sat F-002).

---

## Producer / consumer

**Producer.** `mpc_sat_packs.measurements.multi_window_fdr_iter` —
streaming generator over a paired WalkSAT (Selman–Kautz–Cohen 1994)
trajectory on a fixed random 3-SAT instance. Per
[`mpc-sat/docs/journey/FOOTING.md` F-002](../../mpc-sat/docs/journey/FOOTING.md),
the substrate's natural ẋ is the per-step variable flip
$\Delta s_i(t) = s_i(t) - s_i(t-1) \in \{-2, 0, +2\}$ in the symmetric
encoding $s_i = 2x_i - 1$. Common-random-numbers paired step
(`walksat_step_paired`) provides the matched-noise unperturbed /
perturbed pairing for FDR measurement, with the perturbation entering as
a small uniform per-variable bias `h_field` on the greedy-step score
(SAT analogue of glass's external field).

**Consumer.** `mpc-visualizer/drivers/sat_walksat.py` (to be written) —
pure forwarder. Calls the iterator, applies `enrich_sample` (mutates in
place — same pattern as glass; quantum returns a new dict; SAT mutates),
forwards events to the SSE queue. No local math.

---

## Run protocol (parallel to glass / quantum)

1. **Phase A — kernel warmup** (rounds `1..t_w`, no perturbation): the
   unperturbed WalkSAT trajectory runs; per-window EMAs `d_unp[k]`
   accumulate against the variable-flip indicator $\Delta s_i$. Per
   RULES rule 8 the kernel needs ~5τ rounds to settle. No samples
   emitted.
2. **Snapshot** (round `t_w`): freeze `d_at_tw[k] = d_unp[k].copy()`,
   record `x_unp_at_tw = x_unp.copy()`. Perturbed trajectory forks here:
   `x_per = x_unp.copy()`; on subsequent paired steps the perturbed
   branch sees `h_bias[v] = h_field` on the greedy-step score.
3. **Phase B — paired observation** (rounds `t_w+1..t_w+t_obs`,
   common-random-numbers paired). Both branches consume the same RNG
   draws for unsat-clause selection and noise-vs-greedy decision; the
   only divergence is the greedy-step bias. Per-window EMAs update
   independently on each branch's own ẋ. At log-spaced sample times
   `t > t_w`, emit per-window observables.

Substrate dynamics is genuinely streaming (one round = one solver
iteration), so phases here are computational rather than just
structural.

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
  "n_vars": 500,
  "n_clauses": 2150,
  "k": 3,
  "alpha_density": 4.30,
  "p_noise": 0.5,
  "t_w": 1500, "t_obs": 3000,
  "tau_windows": [10, 30, 100, 300],
  "h_field": 0.05,
  "seed": 1,
  "sample_times": [1501, 1559, ..., 4500],
  "n_samples_planned": 30
}
```

### `phase_a` (progress only)
```json
{ "type": "phase_a", "t": 750, "t_w": 1500, "n_unsat": 23 }
```

### `snapshot`
```json
{ "type": "snapshot", "t": 1500, "t_w": 1500, "n_unsat_at_tw": 21 }
```

### `phase_b` (progress only)
```json
{ "type": "phase_b", "t": 3000, "t_w": 1500, "dt": 1500, "frac_done": 0.5 }
```

### `sample` — the meaty event
```json
{
  "type": "sample",
  "t": 4500, "t_w": 1500, "dt": 3000,
  "C": 0.488, "chi": -1.280,
  "substrate": {
    "n_unsat": 12,
    "frac_unsat": 0.0056,
    "magnetization": 0.060,
    "flip_rate": 0.0020
  },
  "per_window": [
    {
      "tau_window": 10,
      "C_d":     -0.0024,
      "C_d_diag": 0.0275,
      "chi_d":   -0.5229,
      "d_norm":   0.1657,
      "sigma_d":  0.1648
    },
    ...
  ]
}
```

**Top-level** `C`, `chi` are the raw spin-overlap two-time observables
in the symmetric encoding: `C = <s_i(t) * s_i(t_w)>`, `chi = (<s_per> -
<s_unp>) / h_field`, both averaged over variables. They serve as a
single-window cross-reference the same way glass's spin-level `C`,
`chi` do.

**`substrate` block** — direct WalkSAT observables. The analogue of
glass's `{q_initial, energy_density, magnetization}` and quantum's
`{detection_rate_*}` is:
- `n_unsat` — count of currently-unsatisfied clauses (out of `n_clauses`).
  *Substrate liveness counter for rule 11 — if this is 0, the
  trajectory has reached a fixed point and the trail will decay to
  zero.*
- `frac_unsat` — `n_unsat / n_clauses`. Dimensionless analogue of glass's
  energy density.
- `magnetization` — `<s_i>` in the symmetric encoding, ≈ 0 for a
  balanced random instance, drifts under the per-variable `h_field`
  bias.
- `flip_rate` — fraction of variables with `|Δs_i| > 0.5` this round
  (variables that actually flipped). Substrate-direct flux indicator.

**`per_window[k]`** — trail-vector observables at kernel width
`tau_windows[k]`, computed as `mean over variables`:
- `C_d`     = ⟨ d_i(t) · d_i(t_w) ⟩  (two-time trail correlation)
- `C_d_diag`= ⟨ d_i(t)² ⟩            (self-overlap; q_EA,d analog)
- `chi_d`   = (⟨d_i_per(t)⟩ − ⟨d_i_unp(t)⟩) / h_field
- `d_norm`  = √⟨ d_i(t)² ⟩            (bulk stability)
- `sigma_d` = √(C_d_diag − ⟨d_i⟩²)    (heterogeneity / spatial std)

These are *raw* observables. Regime classification, FDR ratio, locus
geometry, and v8 §5 c/s/r/k reading are *post-pass enrichment* applied
by `mpc_sat_packs.measurements.enrich_sample`.

### `complete`
```json
{ "type": "complete", "t_w": 1500, "t_obs": 3000,
  "tau_windows": [10, 30, 100, 300], "elapsed_s": 0.99 }
```

---

## v8 §5 reading — what the consumer reads off `per_window`

For each window `k`, the parametric locus is `(ΔC_d, χ_d)` where
`ΔC_d = C_d_diag − C_d`. The FDR ratio is `R = chi_d / denom`, with
`denom = max(C_d_diag − C_d, 0)`. **Note the substrate-conditional
convention:** SAT does not have a thermodynamic temperature, so the
glass formula `R = chi_d * T / denom` becomes `R = chi_d / denom` with
`T = 1`. Recorded at [`mpc-sat/docs/journey/MAPPINGS.md` row 10](../../mpc-sat/docs/journey/MAPPINGS.md).

`enrich_sample` thresholds `R` against the same boundaries glass uses
(first-session symmetry; substrate-derived calibration owed in
mpc-sat P-002):

| `R` range | v8 vertex regime |
|---|---|
| `R < 0` (and `denom > DENOM_STABLE`) | **k** — frustrated cycle |
| `0 ≤ R < 0.30` | **c** — committed / deep aging |
| `0.30 ≤ R < 0.85` | **s** — aging in progress |
| `0.85 ≤ R < 1.30` | **r** — FDT-line (equilibrium) |
| outside above / `denom ≤ DENOM_STABLE` | **unstable** |

**Substrate-conditional direction (mpc-sat first session, 2026-05-03,
single-instance smoke).** At α = 4.30 (just above α_c ≈ 4.267, typically
UNSAT), all four τ-windows {10, 30, 100, 300} read **k** (R negative
across the spectrum, magnitudes 5.4 to 17.5). This is the
**frustrated-cycle / destructive-interference signature** in MPA's
classification — under the per-variable `h_field` bias the trail's
mean-per-window response is *opposite* in sign to the bias, which is
exactly v8 §5's k-fingerprint.

This single-instance reading is *consistent with* the cavity-method
expectation that UNSAT random 3-SAT exhibits factor-graph frustration
(loops cannot be locally optimised), but it has not been calibrated
against an α-sweep or against the cavity-method published thresholds.
The α-sweep is mpc-sat P-001; the calibration check is P-002.

**Boolean-limit watch (RULES rule 11).** SAT-the-formula IS v8 Theorem
8's singular point. If the smoke enters a fixed point in phase A
(WalkSAT trivially solved a sub-threshold instance), `n_unsat` → 0,
flux dies, all per-window observables → 0 by the time the first sample
is taken. The visualizer driver should surface `n_unsat` and
`flip_rate` prominently — they are the substrate-block liveness
counters that distinguish "MPA correctly reading a fixed point" from
"the streaming primitive is broken."

---

## Run-length discipline (RULES rule 8 / rule 11)

Concrete defaults that respect both budgets:

- **Smoke / contract test:** N = 500, α = 4.30, p_noise = 0.5,
  τ_max = 300, t_w = 1500, t_obs = 3000 → t_w + t_obs = 4500
  (≥ 10·τ_max = 3000). Single instance. Verified 2026-05-03.
- **Science / α-sweep (P-001, owed):** N ≥ 500, multi-instance averaging
  (≥ 4 seeds at each α), τ_windows = {10, 30, 100, 300, 1000} probably,
  τ_max = 1000, t_w + t_obs ≥ 10000. α-grid spanning the cavity-method
  thresholds: α ∈ {3.5, 3.86, 4.0, 4.21, 4.267, 4.30, 4.50, 5.0}.

Runs cheaper than the smoke are debug runs; do not draw conclusions
from them. Runs that don't honour rule 11's flux-window selection will
read all-zero observables; do not interpret as primitive failure.

---

## Substrate dependencies

The producer needs (read-only):
- `numpy` (only — pure-Python WalkSAT)
- `mpc_sat_packs/...` already in-tree at `H:\mpc-sat`

The consumer driver needs (read-only):
- the producer module above, imported by adding `H:\mpc-sat` to
  `sys.path` lazily on instantiation (mirrors `glass_aging.py` /
  `quantum_syndrome.py`).

No backwards coupling: `mpc-sat` does not know the visualizer exists.
