# mpa-visualizer — next-session handoff

**Status of migration:** phases 0, 2, 4, and partial 5 of the original
[`migration handoff`](archive/migration/mpa_visualizer_migration_handoff.md)
landed in commit `a333051`. Repo is public at
<https://github.com/ronviers/mpa-visualizer>. Glass / quantum / cross
tabs are byte-identical ports of mpc-visualizer's; routes serve 200 on
port 18765; the maze tab path `/tab/brain` returns 404 as designed. gh
CLI is set up via `GH_TOKEN`; future repo-touching work is one tool
call away.

**What's left** in three independent chunks. Pick whichever fits the
session you have. None of these blocks anything else.

Read in this order before picking up any chunk:

1. **This file** — what's open and how the chunks relate.
2. [`archive/migration/mpa_visualizer_migration_handoff.md`](archive/migration/mpa_visualizer_migration_handoff.md)
   — original migration plan; phase definitions and acceptance
   criteria are the authoritative source. Use this file as the index.
3. [`H:/mpa-brain/docs/handoff_next_session.md`](../../mpa-brain/docs/handoff_next_session.md)
   for awareness — the substrate side has its own open items
   (cross-substrate F-002 confirmation, F-003 generalised-FDT) that
   *don't block* visualizer work but might land in parallel sessions.
4. [`H:/mpa-central/RULES.md`](../../mpa-central/RULES.md) §4 (rule 4
   — substrate produces, visualizer consumes — the load-bearing rule
   for everything in this repo) and §5 / §8 (the F-002 frame).

---

## Chunk A — Phase 1 archive moves (medium effort, three-repo blast radius)

**The job.** Move the substrate-side artifacts that currently live at
`H:/mpc-visualizer/docs/` into their proper homes, and the
maze-navigator demo into mpc-brain's archive. Leave stub
`MIGRATED_TO_*.md` files at every old location so future sessions can
trace where things went. Full file list is in the original migration
handoff §"Phase 1".

**Why it's worth doing.** As long as `mpa_brain_sketch.py` /
`mpa_brain_sweep*.py` / `results/sweep_*.json` live in
`mpc-visualizer/docs/`, anyone navigating mpa-brain's FOOTING.md
F-entries follows cross-repo links to a *visualizer* repo for
*substrate* artifacts. That's confusing. Phase 1 makes the directory
layout match the conceptual layout: mpa-brain owns the substrate
record, mpc-visualizer becomes a clean v7-and-earlier historical
artifact, mpc-brain owns its own demo's archive.

**Why I deferred it.** Three-repo blast radius (mpc-visualizer ↔
mpa-brain ↔ mpc-brain), mostly mechanical but with enough
cross-references to want a human reviewing each move. Doing it in
its own session with active review is the safer path.

**The moves.**

From `mpc-visualizer/docs/` → `mpa-brain/docs/source/` (or wherever
mpa-brain wants to keep the source-document trail; suggest a new
`mpa-brain/docs/source/` directory):
- `mpa_brain_design.md`
- `mpa_brain_sketch.py`

From `mpc-visualizer/docs/` → `mpa-brain/experiments/source/` (or
similar):
- `mpa_brain_sweep.py`
- `mpa_brain_sweep_bc.py`
- `mpa_brain_sweep_e.py`
- `mpa_brain_sweep_f.py`
- `mpa_brain_sweep_g.py`

From `mpc-visualizer/docs/results/` → `mpa-brain/docs/results/source/`
(or merge with the existing `docs/results/` if timestamps don't
collide; the repo-side reproduction `sweep_G_20260504_171021.json` is
already there):
- `sweep_A_*.json`
- `sweep_B_*.json`
- `sweep_C_*.json`
- `sweep_E_*.json`
- `sweep_F_*.json`
- `sweep_G_*.json`

Bridging artifacts (keep in place + leave existing copies in
`mpa-visualizer/docs/archive/migration/`):
- `mpa_brain_sweep_findings.md` — already copied to
  `mpa-visualizer/docs/archive/migration/`. Add a copy in
  `mpa-brain/docs/journey/` next to FOOTING.md so the brain repo's
  journey trail is complete.
- `mpa_brain_repo_handoff.md` and `mpa_visualizer_migration_handoff.md`
  — already copied to `mpa-visualizer/docs/archive/migration/`. Mark
  the originals at `mpc-visualizer/docs/` as DONE at the top, with a
  forward pointer to the canonical archived copy.

From `mpc-visualizer/` → `mpc-brain/_archive/visualizer-demo/`:
- `drivers/brain_maze.py`
- `static/brain/` (entire directory)

The maze should stay runnable from its archive home (the driver
imports nothing from mpc-visualizer; the static files are
self-contained). Verify by spinning up a tiny test server pointing
at the archive paths.

**Stub files to leave behind.** At `mpc-visualizer/docs/archive/`,
create `MIGRATED_TO_MPA_BRAIN.md` listing every moved substrate file
and its new path. At `mpc-visualizer/`, similar
`MAZE_MIGRATED_TO_MPC_BRAIN_ARCHIVE.md` (or wherever fits the
visualizer's existing archive convention).

**Don't forget.** Update the cross-references in:
- `mpa-brain/docs/journey/FOOTING.md` F-002 / F-003 entries — they
  currently point at `H:/mpc-visualizer/docs/...` paths; after the
  moves point them at the new mpa-brain paths.
- `H:/mpa-central/RULES.md` §5 worked-instance text (line ~110) —
  same path update.
- `mpa-brain/README.md` — `## Origin` paragraph mentions mpc-visualizer
  paths.

**Acceptance:** all `MIGRATED_TO_*.md` stubs in place, no broken
cross-repo links, maze still runs from its archive home, mpc-visualizer
README has a banner noting "this repo is archived; mpa-visualizer is
the active visualizer."

**Estimated wall-clock:** 1.5 hours. Mechanical but careful. Best
done with `git mv` in each repo + manual cross-link sweeps.

---

## Chunk B — Phase 3 brain-spectrum tab + cross 3-way extension (the big one, ~3 hours)

**The job.** Build the brain-spectrum tab end-to-end: driver +
streaming consumer + (τ, dt) tableau renderer + cross-substrate
extension to make cross/ a 3-way comparison. Full spec in the
migration handoff §"Phase 3".

**Why it's the headline work.** This is the visualizer payoff for
mpa-brain's substrate side. Without it, mpa-brain's F-002 plateau
structure is invisible — only readable as JSON / printed tables. The
(τ, dt) tableau as the *primary* panel (per F-002, not buried under
substrate observables) is the visualization design that makes the
plateau structure obvious at a glance.

**Three sub-pieces.**

### B.1 — `drivers/brain_spectrum.py`

Port of `drivers/glass_aging.py` with these substitutions:

- `_GLASS_ROOT` → `_MPA_BRAIN_ROOT` (`H:\mpa-brain`)
- `mpc_glass_packs.measurements` → `mpa_brain_packs.measurements`
- Default config: scenario in {committed, suspended, conflict, reset};
  `xdot_kind` defaults to `"position-relative"` (the F-002
  prescriptive entry); t_w=500, t_obs=10000, n_real=256,
  τ_windows = `geomspace(3, 1000, 11)` (the Sweep G grid; resolves
  the plateau onset around τ ≈ 50 better than the original 6-point).
- NaN scrub at the wire boundary. Brain's measurements may emit NaN
  in early samples (per F-002 χ_d notes); scrub like quantum's
  driver does. (Glass driver has no scrub; brain follows quantum's
  pattern.)

### B.2 — `static/brain-spectrum/{index.html, tab.css, tab.js}`

Port of `static/glass/` with the (τ, dt) plane promoted to a
*first-class* primary panel:

- **Primary panel: f(τ, dt) tableau.** dt rows × τ columns. Linear
  color scale 0 → 1. Cells past the rule-8 honest-display threshold
  (dt > 5τ) full saturation; warmup-region cells (dt ≤ 5τ) at
  reduced opacity. Conflict's k-signature is plateau-everywhere-near-
  zero across all τ — make this corner pop visually.
- **Secondary panel: ΔC_d(τ, dt) tableau.** Same orientation,
  log-scale color (ΔC_d spans 6–8 decades for c/s/r, ~4 decades for
  conflict). Sign-oscillation in conflict's intermediate (τ × dt) is
  the rule-11 flux signature — diverging colormap centered at zero
  shows it.
- **Tertiary panels** (port from glass): substrate observables
  (energy_mean, speed_mean, position_mean per scenario);
  per-scenario 1D fingerprint slice (f vs τ at dt=10000); regime
  timeline.
- **Skip χ_d panel.** Per F-002, χ_d in position-relative
  coordinates is mostly noise — not a useful display until F-003
  closes (see mpa-brain's handoff). If F-003 closes mid-build,
  add the χ_d panel.

### B.3 — Cross-substrate 3-way extension

`drivers/cross_substrate.py` extends to 3 columns: glass + quantum +
brain-spectrum side-by-side. Existing 2-way logic stays; brain
slots in as the third column. The F-018 inverted-direction
verification becomes a 3-way comparison: glass and quantum walk in
the inverted direction, brain walks in the un-inverted direction
(rule 7's substrate-class prediction). Same direction across
same-class substrates is the strong test.

`static/cross/{index.html, tab.css, tab.js}` extends accordingly.

### B.4 — Event protocol document

`mpa-visualizer/docs/brain_v8_event_protocol.md` — describes the
substrate↔visualizer contract for brain-spectrum events. Pattern:
copy `quantum_tab_event_protocol.md` structure, swap fields per the
mpa-brain `multi_window_fdr_iter` event shape (init / phase_a /
phase_b / snapshot / sample / complete; per_window carries C_d /
C_d_diag / chi_d / d_norm / sigma_d / f).

Server registration: uncomment the `"brain-spectrum": …` line in
`server.py`'s `_DRIVER_MODULES` (already stubbed out with a comment
pointing here). Update `static/shell.html` to add the
`<a href="/tab/brain-spectrum">brain · spectrum</a>` nav entry
(currently a placeholder comment).

**Done criterion:** brain-spectrum tab serves on port 18765,
end-to-end smoke confirms F-002 plateau values reproduce in the
primary tableau (committed/suspended/reset show plateau at broad
τ × late dt; conflict shows plateau-everywhere-near-zero); cross
tab shows 3-way comparison.

**Estimated wall-clock:** 3 hours. Not blocked by Chunk A.

---

## Chunk C — Phase 6 verification + close-out (small, 1 hour)

After Chunks A and B land, do the migration handoff's Phase 6:

- Run all four tabs end-to-end (curl probe each event sequence).
- Verify glass and quantum F-018 fingerprints unchanged from
  mpc-visualizer's last reading (regression check on namespace-only
  port).
- Verify brain-spectrum reproduces F-002's plateau structure end-to-end
  through the SSE wire and the tab JS (not just the substrate-side
  Python).
- Verify cross tab shows 3-way comparison correctly.
- Update `H:/mpc-visualizer/README.md` with a banner: "This repo is
  archived. v7 and early-v8 historical record. Active visualizer:
  https://github.com/ronviers/mpa-visualizer."

**Acceptance:** the migration is complete; future visualizer work is
done in mpa-visualizer; mpc-visualizer is read-only history.

---

## Recommended session ordering

The handoff's original A/B/C session split ("Session A: phases 0–2 +
phase 5 partial; Session B: phases 3–4; Session C: phase 6") was
already partially executed. What's left maps to:

- **Next session 1:** Chunk A (phase 1 archive moves). Standalone, clean.
- **Next session 2:** Chunk B (brain-spectrum + cross 3-way).
  Independent of session 1 — Chunk A could come before or after.
- **Next session 3:** Chunk C (phase 6 verification + close-out).
  Should come after both A and B.

Or if you prefer, B + C in one session (~4 hours total) and A in its
own. Or all three in one big session (~5.5 hours).

---

## Future-future work (deferred, no commitment)

Listed *here* (not in the chunks above) so a future session can pick
them up explicitly when there's reason to:

### SAT tab integration

Adds `drivers/sat_spectrum.py` and `static/sat-spectrum/`. Substrate-
side already done at mpc-sat F-002 / first-real-session. Event
protocol documented at
[`sat_tab_event_protocol.md`](sat_tab_event_protocol.md). Pattern:
straight port from quantum tab. ~3 hours of work. Drops the cross tab
to a 4-substrate view (glass + quantum + brain-spectrum + sat).

### λ_A direct on quantum

Same JS log-slope reading the glass tab does, applied to quantum's
‖d‖. ~2 hours. Adds to existing quantum tab.

### MPA-demo dashboard

Idea from the migration handoff: a focused demo showing MPA's regime
classification updating in real time as a substrate trajectory
unfolds, with sliders varying the substrate's parameters. The point
is pedagogical: "watch MPA read the agent's regime as you change the
conditions." **Not based on the mpc-brain maze** — that's archived
and stays archived; reviving it as the demo would shoehorn a v7
navigation module into a v8 demo for sunk-cost reasons. Fresh build
using one of the v8 substrates (likely brain-spectrum since the
(τ, dt) plane is the most visual). Its own session arc with its own
handoff when the time is right; don't spec it now.

---

## Acceptance criteria summary (per chunk)

- **Chunk A:** all `MIGRATED_TO_*.md` stubs in place, cross-repo
  links updated in mpa-brain FOOTING + RULES.md + READMEs, maze
  still runs from its archive home, mpc-visualizer README has the
  archived-banner.
- **Chunk B:** brain-spectrum tab serves and reproduces F-002 plateau
  structure visually; cross tab shows 3-way; brain_v8_event_protocol.md
  written.
- **Chunk C:** all four tabs verified end-to-end; mpc-visualizer
  README banner noting archive status.
