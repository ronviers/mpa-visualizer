# mpa-brain ẋ-variant sweep — findings (Sweeps A–G)

**Status:** locked, written 2026-05-04 over a single autonomous
session. The earlier draft of this file (with the "velocity is
degenerate, replace rule 1" framing) was wrong about the velocity
reading; it was reading at the wrong (τ, dt) region. Sweeps F and G
corrected the framing. This version is the canonical record.

**Source files (this directory):**

- [`mpa_brain_sweep.py`](mpa_brain_sweep.py) — parameterised primitive +
  Sweep A driver (4 ẋ × 4 scenarios, late-dt fingerprint)
- [`mpa_brain_sweep_bc.py`](mpa_brain_sweep_bc.py) — Sweep B (n_real
  convergence) + Sweep C (rule-8 budget sweep) on position-relative
- [`mpa_brain_sweep_e.py`](mpa_brain_sweep_e.py) — Sweep E (parametric
  locus at broadest τ vs single-window FDR atlas)
- [`mpa_brain_sweep_f.py`](mpa_brain_sweep_f.py) — Sweep F (full
  (τ, dt) f-tableau, original 6-τ grid)
- [`mpa_brain_sweep_g.py`](mpa_brain_sweep_g.py) — Sweep G (finer 11-τ
  grid + ΔC_d and χ_d tableaux)

**Result JSON (timestamps preserved in `results/`):**
- `sweep_A_20260504_140334.json`
- `sweep_B_20260504_140637.json`
- `sweep_C_20260504_140943.json`
- `sweep_E_20260504_141254.json`
- `sweep_F_20260504_142519.json`
- `sweep_G_20260504_145836.json`

---

## TL;DR

1. **Rule 1 stands as written.** The literal velocity ẋ on overdamped
   Langevin is *not* operationally degenerate; its scenario-
   discriminating signal lives at small dt (dt ≲ τ), where
   un-inverted v8 hierarchy walks are clearly visible on c/s/r and
   conflict reads flat-everywhere. The earlier draft's "velocity is
   degenerate" claim was an artifact of reading only the late-dt
   fingerprint, where the EMA has decorrelated to f ≈ 1.
2. **Position-relative ẋ = x(t) − x(t_snap) is a complementary
   research move**, not a substitute. It encodes the same hierarchy
   walks at large dt × broad τ as a *stable plateau*, while velocity
   has no tight plateau anywhere. For plateau-style multi-window FDR
   readings (rule 8 "earned display"), position-relative is the
   natural ẋ; for transient-style readings, velocity is.
3. **Rule 5 is extended**: the coordinate-space discipline generalizes
   to a *family* of coordinate spaces indexed by ẋ choice, with
   breakpoint and bound logic per family. See proposed/applied edit
   below.
4. **Rule 8 gets an operational addendum** (no rule rewrite): the
   discriminating signal lives in different (τ, dt) regions per ẋ
   choice. Per-step ẋ at dt ≲ τ; snapshot-relative ẋ at dt ≳ 5τ.
   Reading the wrong region returns the EMA-decorrelation limit or
   the trail-buildup limit — neither carries scenario info.
5. **The (τ, dt) plane is the right reading object** for multi-window
   FDR, not a single (τ, dt) point. Conflict is distinguished from
   committed at f-level not by a single value but by the *shape* of
   its plateau structure: position-relative + conflict shows
   plateau-everywhere-near-zero across all τ (k's signature in the
   (τ, dt) plane), while committed shows buildup-at-narrow-τ → plateau-
   at-broad-τ. ΔC_d (= C_d_diag − C_d, the trail-magnitude flux
   scale) is the natural second axis paired with f.
6. **Cross-substrate confirmation needed before rule promotion.** The
   (τ, dt) plateau structure is currently a brain-only finding. If
   glass and quantum confirm it on their substrates, it earns its own
   first-class rule. For now: brain finding, recorded as F-002.

---

## Sweep A — surfacing pass (4 ẋ × 4 scenarios at late-dt only)

**Setup:** t_w=500, t_obs=10000, τ ∈ {3, 10, 30, 100, 300, 1000},
n_real=256, seed=0. For deferred-snapshot variants
(position-relative, boundary-cross), an additional t_kw = 5·τ_max =
5000 of kernel warmup runs inside phase B before the d-snapshot is
taken; t_obs counts the *measurement* window after the snapshot.
Returned only the f at the last sample (dt=10000). Total wall ~67s.

f at dt=10000 per (ẋ, scenario, τ):

| ẋ | scen | gt | τ=3 | τ=10 | τ=30 | τ=100 | τ=300 | τ=1000 |
|---|---|---|---|---|---|---|---|---|
| velocity | committed | c | 0.917 | 0.928 | 0.953 | 0.961 | 0.921 | 0.920 |
| velocity | suspended | s | 0.920 | 0.963 | 1.021 | 1.002 | 0.962 | 0.943 |
| velocity | conflict | k | 0.957 | 0.933 | 0.917 | 0.911 | 0.911 | 0.911 |
| velocity | reset | r | 0.931 | 0.986 | 1.025 | 0.995 | 0.981 | 0.971 |
| **position-relative** | committed | c | 0.467 | 0.454 | 0.411 | 0.310 | 0.183 | **0.085** |
| **position-relative** | suspended | s | 0.564 | 0.558 | 0.520 | 0.420 | 0.295 | **0.150** |
| **position-relative** | conflict | k | 0.147 | 0.050 | 0.015 | 0.002 | −0.001 | **0.005** |
| **position-relative** | reset | r | 0.561 | 0.559 | 0.535 | 0.475 | 0.387 | **0.226** |
| position-displacement | (= velocity in f) — see note | | | | | | | |
| boundary-cross | committed | c | 1.082 | 1.105 | 1.094 | 1.075 | 1.067 | 1.064 |
| boundary-cross | suspended | s | 0.960 | 0.923 | 0.917 | 0.965 | 1.010 | 1.024 |
| boundary-cross | conflict | k | 1.022 | 1.021 | 1.031 | 1.040 | 1.045 | 1.047 |
| boundary-cross | reset | r | 1.035 | 1.041 | 1.023 | 1.013 | 1.018 | 1.009 |

**Reading at this sweep:** position-relative is the only variant
showing scenario-separable hierarchy walks at the late-dt fingerprint.
velocity (and its identical-in-f cousin position-displacement) reads
flat-r-like (~0.93). boundary-cross reads flat-r-like with a slight
elevation (~1.05). The conclusion at this stage was "position-
relative survives, velocity is degenerate." That conclusion was wrong
— see Sweep F below.

**Why velocity = position-displacement in f:** the two ẋ definitions
differ only by a global factor of 1/dt that cancels in the dimensionless
ratio f = (C_d_diag − C_d) / C_d_diag. Useful as an implementation
sanity check; the two are interchangeable for any classifier reading
f, with C_d / C_d_diag scales differing by dt² (10⁻⁴ here).

---

## Sweep B — n_real convergence on (position-relative, committed)

**Setup:** position-relative ẋ, committed scenario, t_w=500,
t_obs=10000, τ ∈ {3, 10, 30, 100, 300, 1000}, seed=0.

| n_real | τ=3 | τ=10 | τ=30 | τ=100 | τ=300 | τ=1000 | wall |
|---|---|---|---|---|---|---|---|
| 16 | 0.546 | 0.541 | 0.497 | 0.463 | 0.259 | −0.096 | 1.4s |
| 64 | 0.436 | 0.425 | 0.408 | 0.355 | 0.216 | 0.079 | 2.1s |
| 256 | 0.467 | 0.454 | 0.411 | 0.310 | 0.184 | 0.085 | 4.9s |
| 1024 | 0.470 | 0.448 | 0.400 | 0.306 | 0.189 | 0.091 | 15.7s |
| 4096 | 0.475 | 0.453 | 0.414 | 0.325 | 0.203 | 0.096 | 59.1s |

n_real=256 is converged; 1024 and 4096 reproduce within ±0.02. The
walk shape (f decreasing monotonically with τ from ~0.47 to ~0.10) is
an irreducible substrate property, not undersampling. **Production
setting: n_real=256.**

---

## Sweep C — rule-8 budget sweep on (position-relative, committed)

**Setup:** position-relative ẋ, committed scenario, n_real=1024.

| t_w | t_obs | rule-8* | τ=3 | τ=10 | τ=30 | τ=100 | τ=300 | τ=1000 | wall |
|---|---|---|---|---|---|---|---|---|---|
| 200 | 1000 | violated | 0.488 | 0.466 | 0.430 | 0.342 | 0.215 | 0.073 | 5.6s |
| 500 | 5000 | violated | 0.455 | 0.434 | 0.391 | 0.296 | 0.183 | 0.081 | 10.3s |
| 500 | 10000 | OK | 0.470 | 0.448 | 0.400 | 0.306 | 0.189 | 0.091 | 16.0s |
| 1000 | 30000 | OK | 0.492 | 0.470 | 0.427 | 0.324 | 0.204 | 0.104 | 38.0s |
| 2000 | 100000 | OK | 0.472 | 0.450 | 0.414 | 0.327 | 0.203 | 0.100 | 116.3s |

*Naive rule-8 check: t_w + t_obs ≥ 10·τ_max = 10000.

The fingerprint is invariant across 100× budget range. The
deferred-d-snapshot machinery pays t_kw = 5·τ_max = 5000 steps of
kernel warmup *inside* phase B before the snapshot is taken, so the
kernel is honestly warmed by the snapshot time regardless of t_obs.
**Operational rule for position-relative:** budget by `t_w + t_kw +
t_obs ≥ 10·τ_max`, with t_kw = 5·τ_max fixed by construction. Rule-8
budgeting in this coordinate space is therefore lighter than for
velocity.

---

## Sweep E — parametric locus vs single-window FDR atlas

**Setup:** position-relative ẋ, all 4 scenarios, n_real=1024,
broadest τ = 1000, all 23 sample events recorded.

The four scenarios produce qualitatively different (ΔC_d, χ_d) loci
at τ=1000 — **discriminable but not matching the single-window FDR
four-shape atlas**:

| scenario | gt | ΔC_d range (τ=1000) | χ_d range (τ=1000) | χ_d / ΔC_d at last |
|---|---|---|---|---|
| committed | c | 4.5 → 19,250 | noise to ~4.3 | +0.0002 |
| suspended | s | 25 → 95,962 | 0 → 4 → −4 → 4 | +0.0000 |
| conflict | k | 0.013 → 88 (oscillates sign) | ≈ −10⁻³ flat | +0.0000 |
| reset | r | 1.5 → 509,570 | 0 → 86 → −158 | −0.0003 |

**Headline:** χ_d / ΔC_d is O(10⁻⁴) for all scenarios — three decades
below FDT's β = 1 prediction. Position-relative is a *displacement*
observable; its EMA-level response does not satisfy the classical
χ ≈ β·ΔC relation that velocity-velocity FDR was written for.
Quantitative comparison to the lattice file's atlas requires either
(a) a velocity-coordinate Sweep E (but velocity gives a flat
fingerprint, so its locus is uninteresting) or (b) deriving the right
generalised-FDT scaling for position-relative-d. **The atlas and the
multi-window-d locus live in different coordinate spaces (rule 5).
Whether they should agree is an open framework question; not a
blocker.**

---

## Sweep F/G — the (τ, dt) plane

**The reframe.** Sweep A read off f at one (τ, dt) point per cell
(dt = t_obs = 10000). That's a *projection* of a 2D surface to a 1D
slice. Sweep F printed the full f(τ, dt) surface per cell and exposed
that the late-dt fingerprint hides most of the structure.

**Setup G:** t_w=500, t_obs=10000, n_real=256, seed=0, τ_windows =
geomspace(3, 1000, 11) = [3, 5.4, 9.6, 17.1, 30.6, 54.8, 97.9, 175.0,
312.9, 559.4, 1000.0]. All 4 ẋ × 4 scenarios. Three tableaux per
cell: f, ΔC_d, χ_d. Total wall 69s.

### Velocity is not degenerate

f tableau, **velocity / committed**, selected dt rows:

| dt | τ=3 | τ=5 | τ=9 | τ=17 | τ=30 | τ=54 | τ=97 | τ=175 | τ=312 | τ=559 | τ=1000 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **1** | **0.564** | **0.404** | **0.274** | **0.184** | **0.126** | **0.089** | **0.066** | **0.053** | **0.043** | **0.032** | **0.024** |
| 7 | 1.068 | 0.944 | 0.729 | 0.515 | 0.364 | 0.267 | 0.211 | 0.181 | 0.160 | 0.136 | 0.115 |
| 55 | 0.983 | 0.973 | 0.997 | 1.032 | 1.003 | 0.882 | 0.729 | 0.615 | 0.532 | 0.443 | 0.365 |
| 405 | 0.920 | 0.922 | 0.920 | 0.935 | 0.970 | 1.018 | 1.078 | 1.126 | 1.112 | 1.001 | 0.839 |
| 10000 | 0.917 | 0.929 | 0.928 | 0.930 | 0.954 | 0.975 | 0.962 | 0.935 | 0.920 | 0.917 | 0.920 |

At **dt = 1**: clean monotone hierarchy walk from 0.564 (narrow τ) to
0.024 (broad τ) — un-inverted v8 prose direction, just like
position-relative shows at large dt. Same scenario signal, encoded at
the *opposite* corner of the (τ, dt) plane.

velocity / suspended at dt=1: 0.253 → 0.005 (similar walk).
velocity / reset at dt=1: 0.245 → 0.002 (similar walk).
**velocity / conflict at dt=1: 1.192 → 1.045 (flat — conflict
distinct at this dt too).**

### Plateau structure across all 16 cells

Tightest post-warmup f-range (dt > 5τ) at the broad-τ end:

| ẋ | scenario | range at τ=300 | range at τ=1000 | n_pw at 1000 |
|---|---|---|---|---|
| velocity | committed | 0.144 | 0.120 | 2 |
| velocity | suspended | 0.079 | 0.093 | 2 |
| velocity | conflict | 0.123 | 0.078 | 2 |
| velocity | reset | 0.041 | 0.023 | 2 |
| **position-relative** | **committed** | **0.023** | **0.018** | 2 |
| **position-relative** | **suspended** | **0.027** | **0.031** | 2 |
| **position-relative** | **conflict** | **0.006** | **0.002** | 2 |
| **position-relative** | **reset** | **0.062** | **0.028** | 2 |
| boundary-cross | committed | 0.141 | 0.012 | 2 |
| boundary-cross | suspended | 0.076 | 0.068 | 2 |
| boundary-cross | conflict | 0.056 | 0.049 | 2 |
| boundary-cross | reset | 0.157 | 0.018 | 2 |

**Position-relative achieves the tightest plateaus**, all
sub-decimal-percent at broad τ. velocity has no consistently tight
plateau at any τ. boundary-cross is intermediate — tight for some
scenarios (conflict, reset at τ=1000) but loose at intermediate τ.

### Conflict's k-signature is plateau-shape, not f-value

f post-warmup range table for **position-relative**, all τ:

| τ | committed | suspended | conflict | reset |
|---|---|---|---|---|
| 3 | 0.413 | 0.504 | **0.046** | 0.531 |
| 5 | 0.362 | 0.425 | **0.042** | 0.490 |
| 9 | 0.358 | 0.403 | **0.032** | 0.466 |
| 17 | 0.243 | 0.328 | **0.022** | 0.402 |
| 30 | 0.209 | 0.251 | **0.019** | 0.326 |
| 54 | 0.083 | 0.083 | 0.015 | 0.169 |
| 97 | 0.072 | 0.073 | 0.012 | 0.126 |
| 175 | 0.052 | 0.060 | 0.009 | 0.093 |
| 312 | 0.023 | 0.027 | 0.006 | 0.062 |
| 559 | 0.032 | 0.028 | 0.004 | 0.061 |
| 1000 | 0.018 | 0.031 | 0.002 | 0.028 |

c, s, r show a sharp **plateau-onset transition around τ ≈ 50** —
narrow τ rows are still in transient buildup (range 0.2–0.5), broad
τ rows plateau (range < 0.1). **Conflict is plateau-everywhere** —
range < 0.05 at all τ, no transient. The k-signature in the
(τ, dt) plane is *not* "f at τ=1000" but "no buildup phase across
the whole τ-axis" — qualitatively distinct from c/s/r's
buildup-then-plateau.

This recovers (a coordinate-translated version of) the four-shape
atlas's "k = non-monotonic" signature: conflict is the scenario
whose plateau structure differs *qualitatively* (plateau everywhere
vs buildup-then-plateau), not just quantitatively.

### ΔC_d is the natural second axis

ΔC_d = C_d_diag − C_d is the trail-magnitude denom (rule 5's
trail-vector denom space). Its (τ, dt) tableau scales with substrate
flux:

| ẋ × scenario | ΔC_d range across (τ, dt) |
|---|---|
| velocity / committed | 56 to 1840 (3 decades) |
| velocity / conflict | 0.4 to 100 (3 decades) |
| **position-relative / committed** | **0.008 to 21,600 (6 decades)** |
| **position-relative / conflict** | **0.009 to 70 (4 decades, oscillates sign)** |
| position-relative / reset | 0.005 to 510,000 (8 decades) |

Position-relative ΔC_d spans 6–8 decades for c/s/r, only 4 decades
for conflict — and the conflict ΔC_d *oscillates sign at intermediate
τ × dt* (positive at small (τ, dt), negative at intermediate, positive
again at large). That sign oscillation is the rule-11 flux signature
in coordinate-space form: conflict's particle is at the boundary of
zero flux, so its trail's correlation ΔC_d is small and non-monotone.

ΔC_d together with f gives a clean two-axis discrimination of the four
scenarios:
- conflict: small ΔC_d (low flux) + plateau-everywhere f
- committed: large ΔC_d at broad τ + plateau f at broad τ
- suspended: even larger ΔC_d + plateau f at intermediate value
- reset: largest ΔC_d (highest flux) + plateau f at largest value

### χ_d carries little signal in position-relative coordinates

Confirmed Sweep E's read: χ_d / ΔC_d is O(10⁻⁴) for all scenarios in
position-relative coordinates. The χ_d tableau shows mostly noise at
small dt, with faint coherent structure at large dt × broad τ
(committed: |χ_d| up to ~0.6 at dt=3008, τ=1000). At n_real=256
this is barely above noise; n_real=4096 might resolve it but is
expensive.

**Operational read:** position-relative-d-FDR is f-and-ΔC_d-readable,
not χ_d-readable. The FDT scaling that makes χ informative in
velocity-d-FDR (or in raw V_A-FDR per `mpc_lattice.py`) does not
transfer. Whether a generalised FDT for position-relative-d exists
is the framework question Sweep E flagged. **For mpa-brain
visualizer integration: read f and ΔC_d, not χ_d.**

---

## Rule 5 extension — locked language (applied to RULES.md this session)

Added at the end of [`H:/mpa-central/RULES.md`](../../mpa-central/RULES.md)
section 5:

> **The discipline generalizes to a family of coordinate spaces
> indexed by ẋ choice.** Rule 1 names the substrate-correct ẋ — the
> prescriptive entry the framework's primitives are computed against.
> Alternative ẋ choices are sometimes used as research moves, to
> surface complementary substrate properties along the same
> trajectory. Each ẋ choice defines its own trail-vector denom space
> (its own $C_d^{\text{diag}} - C_d$ bounds, its own
> $C_d^{\text{diag}} - C_d^{\infty}$ envelope) and its own breakpoint
> within that space. The discipline above applies *within* each
> family member:
>
> - The breakpoint must live in the *same* ẋ-coordinate space as the
>   empirical trajectory it is being compared to.
> - Bounds, envelopes, and FDR-shape categories computed in one
>   ẋ-coordinate space do not transfer to another.
> - Cross-coordinate comparisons (e.g. velocity-d-FDR vs
>   position-relative-d-FDR on the same substrate) compare
>   complementary slices of the same physics, not two competing
>   readings of the same observable. Both readings can be
>   coordinate-correct yet disagree at face value, because they live
>   in different intervals.
>
> Worked instance: mpa-brain `F-002` (Sweeps A–G, 2026-05-04). Same
> overdamped Langevin substrate, same four-scenario test plan. In
> velocity-d-FDR coordinates, the late-dt f-fingerprint reads flat-r-
> like at f ≈ 0.93 across all four scenarios — no scenario
> separation. In position-relative-d-FDR coordinates
> (ẋ = $x(t) - x(t_{\text{snap}})$), the same fingerprint reads as a
> tight scenario-discriminating plateau in the broad-τ × late-dt
> corner: f(c) = 0.085, f(s) = 0.150, f(k) = 0.005, f(r) = 0.226 at
> τ = 1000. Both coordinate readings see the substrate truthfully;
> they read different (τ, dt) regions where each coordinate's
> discriminating signal lives.

## Rule 8 supplement — locked language (applied to RULES.md this session)

Added as the last bullet of [`H:/mpa-central/RULES.md`](../../mpa-central/RULES.md)
section 8:

> - **(τ, dt)-region matters per ẋ choice (operational addendum).**
>   Within an ẋ choice's coordinate space (rule 5), the
>   discriminating substrate signal does not live uniformly across
>   the (τ, dt) plane. *Per-step* ẋ (velocity, Δs, detection events,
>   transition indicators) typically encode the signal at small dt
>   (dt ≲ τ) before the EMA decorrelates the trail from the snapshot;
>   at large dt the per-step trail has fully decorrelated and
>   $f \to 1$ regardless of regime. *Snapshot-relative* ẋ (e.g.
>   mpa-brain's $x(t) - x(t_{\text{snap}})$) encode the signal at
>   large dt (dt ≳ 5τ), once the trail has accumulated coherent
>   drift; at small dt the trail has not yet differentiated from
>   zero and $f \to 0$. Read each ẋ choice in its honest (τ, dt)
>   region; reading at the wrong region returns the EMA-decorrelation
>   limit ($f \approx 1$) or the trail-buildup limit ($f \approx 0$),
>   neither of which carries scenario information. mpa-brain `F-002`
>   surfaced this on Langevin; cross-substrate confirmation owed
>   before the (τ, dt) plateau structure earns its own first-class
>   rule.

---

## Proposed FOOTING entries for `H:\mpa-brain\docs\journey\FOOTING.md`

To be created when the mpa-brain repo lands. Each entry: short
description + source links + the (τ, dt) coordinates it was earned in.

- **F-001** — γ_A sign caveat (inherited from mpc-brain). Markovian
  overdamped Langevin gives γ_A with opposite sign from v8/paper
  Table 1's prediction; the substrate-conditional reading rule that
  predates rule 7. Source: design memo
  [`mpa_brain_design.md`](mpa_brain_design.md) §"What migrates from
  mpc_lattice.py".
- **F-002** — ẋ-coordinate-space dependence on overdamped Langevin
  (Sweeps A–G, 2026-05-04). The literal-rule-1 velocity ẋ encodes
  scenario-discriminating hierarchy walks at small dt (dt ≲ τ),
  decaying to a flat decorrelation limit at large dt. The
  position-relative ẋ ($x(t) - x(t_{\text{snap}})$) encodes the same
  walks at large dt × broad τ as a stable plateau, with
  scenario-separable plateau values: f(c) = 0.085, f(s) = 0.150,
  f(k) = 0.005, f(r) = 0.226 at (τ=1000, dt=10000). Conflict's
  k-signature is **plateau-everywhere-near-zero** across all τ,
  qualitatively distinct from c/s/r's buildup-then-plateau. ΔC_d is
  the natural second axis (flux scale, 6–8 decades range for c/s/r).
  χ_d does not carry classical FDT scaling in position-relative
  coordinates. Both ẋ readings honor rule 5 in their own coordinate
  spaces. Sources:
  [`mpa_brain_sweep_findings.md`](mpa_brain_sweep_findings.md),
  [`results/sweep_A_…json`](results/),
  [`results/sweep_F_…json`](results/),
  [`results/sweep_G_…json`](results/).
- **F-003** — multi-window position-relative-d locus does not
  reproduce single-window V_A FDR atlas at broadest τ (Sweep E).
  χ_d/ΔC_d is O(10⁻⁴), three decades below FDT's β = 1. The two
  readings live in different coordinate spaces (rule 5) — not a
  falsification, an open framework question about generalised FDT
  scaling for displacement observables. Source:
  [`results/sweep_E_…json`](results/).

(F-003 is recorded as an open question, not a falsification. If a
follow-up session derives the right scaling or reframes the locus
question, F-003 gets updated.)

---

## What's left

1. **mpa-brain repo creation.** Substrate side checks out — see
   [`mpa_brain_repo_handoff.md`](mpa_brain_repo_handoff.md) for the
   self-contained next-session brief.
2. **mpc-visualizer → mpa-visualizer migration.** Clean break,
   v7-and-earlier to project archives. See
   [`mpa_visualizer_migration_handoff.md`](mpa_visualizer_migration_handoff.md)
   for the migration plan.
3. **Cross-substrate (τ, dt) confirmation.** The plateau structure as
   a candidate first-class rule needs glass and quantum to confirm.
   Their primitives already record the necessary data; a parallel
   Sweep G run on each is straightforward. Not blocking; promote
   when ready.
4. **Generalised FDT for position-relative-d.** Open framework
   question from F-003. Not blocking; standalone session work.
