# Hand-off — mpc-visualizer → mpa-visualizer migration

Self-contained brief for the migration. Multi-session scope. Each
phase below has a clear "done" criterion; a future session can pick up
at any phase boundary. Do **not** start phase 3 (brain-spectrum tab)
before [`mpa_brain_repo_handoff.md`](mpa_brain_repo_handoff.md) is
done — it depends on `H:\mpa-brain\` existing and exposing the v8
primitive.

Read order:

1. **This file** — phased migration plan.
2. [`mpa_brain_sweep_findings.md`](mpa_brain_sweep_findings.md) —
   substrate-side context. The visualizer's brain-spectrum tab
   consumes the v8 position-relative-d-FDR primitive; reads f and
   ΔC_d (NOT χ_d) per rule 5 / F-002.
3. [`H:/mpa-central/RULES.md`](../../mpa-central/RULES.md) — rule 4
   ("substrate produces, visualizer consumes — one direction") is the
   load-bearing rule for this migration. Visualizer never implements
   science.

---

## Goals + non-goals

**Goals:**

- Clean break with v7 — everything v7-flavored moves to project
  archives (`mpc-brain/_archive/`, `docs/archive/` per project).
- New repo `H:\mpa-visualizer\` housing the v8 multi-window FDR
  visualizer; mpa-* naming aligned with mpa-central / mpa-brain.
- All existing v8 substrate tabs (glass, quantum, cross) ported
  forward.
- New brain-spectrum tab consuming mpa-brain's v8 primitive,
  promoting the (τ, dt) plane to a first-class panel (per F-002).
- mpc-brain's maze-navigator tab archived under
  `mpc-brain/_archive/visualizer-demo/` (not migrated forward).

**Non-goals:**

- Rebuilding any substrate tab from scratch. glass / quantum / cross
  are already v8; port-as-is, rename namespaces.
- SAT tab integration. Queued from cross-substrate plan step 6;
  separate follow-up session(s) after migration is stable.
- λ_A direct on quantum. Also queued; standalone task post-migration.
- **MPA-demo dashboard.** Explicitly deferred. See "Future work —
  when you want it" at the bottom. Not based on the maze; fresh
  build when the time is right.

---

## Phase 0 — settings + sandbox + repo skeleton

**Owner:** the migration session.
**Estimated wall-clock:** 15 minutes.

Per [`~/.claude/CLAUDE.md`](~/.claude/CLAUDE.md):

- Add `"H:\\mpa-visualizer"` to **both**
  `permissions.additionalDirectories` AND
  `sandbox.filesystem.allowWrite` in `~/.claude/settings.json`.
- Restart Claude Code so settings reload.
- Verify with mkdir/rmdir round-trip.

Skeleton (mirrors mpc-visualizer):

```
H:\mpa-visualizer\
    .gitignore                       # copy from mpc-visualizer
    .gitattributes                   # copy from mpc-visualizer
    README.md                        # short — purpose, structure,
                                     # link to RULES.md and migration
                                     # source notes
    dev_profile.json                 # generated; redacted
    server.py                        # ported from mpc-visualizer
                                     # (see phase 4)
    drivers\
        __init__.py
        base.py                      # ported as-is
        glass_aging.py               # ported (phase 2)
        quantum_syndrome.py          # ported (phase 2)
        cross_substrate.py           # ported + extended for
                                     # brain-spectrum (phase 3)
        brain_spectrum.py            # new (phase 3)
    static\
        shell.html                   # ported, with brain-spectrum
                                     # tab listed, brain (maze)
                                     # NOT listed
        shell.css                    # ported
        glass\                       # ported (phase 2)
        quantum\                     # ported (phase 2)
        cross\                       # ported + extended (phase 3)
        brain-spectrum\              # new (phase 3)
    docs\
        glass_event_protocol.md      # extracted from glass driver
                                     # source if needed
        quantum_tab_event_protocol.md   # ported
        sat_tab_event_protocol.md       # ported (kept for future
                                        # sat-tab work)
        brain_v8_event_protocol.md      # new (phase 3)
        archive\
            handoffs\                # historical handoffs ported
            mpa_brain_*               # the design / sketch / sweep
                                     # artifacts moved from
                                     # mpc-visualizer/docs/ once
                                     # mpa-brain repo absorbs them
                                     # (the substrate-side artifacts
                                     # graduate to mpa-brain; the
                                     # migration-side artifacts stay
                                     # here as historical record)
```

gitleaks pre-commit hook per
[`H:/GWS1_Profiler/README.md`](H:/GWS1_Profiler/README.md). Run
`host-profile_concise.py` to populate `dev_profile.json` redacted.

**Done criterion:** repo exists, dev_profile.json redacted, gitleaks
pre-commit installed, initial empty `git commit -m "skeleton"` lands.

---

## Phase 1 — archive what's not coming forward

**Owner:** can be the migration session or a separate cleanup session.
**Estimated wall-clock:** 30 minutes.

The clean-break principle: anything v7-bound or backward-facing moves
to its substrate's project archive, not to mpa-visualizer.

### From mpc-visualizer to mpc-brain/_archive/visualizer-demo/

(mpc-brain owns its visualizer demo; the archive is mpc-brain's
responsibility.)

- `H:/mpc-visualizer/drivers/brain_maze.py` →
  `H:/mpc-brain/_archive/visualizer-demo/drivers/brain_maze.py`
- `H:/mpc-visualizer/static/brain/` →
  `H:/mpc-brain/_archive/visualizer-demo/static/brain/`
- Cross-references in `mpc-brain/README.md` (or equivalent) updated
  to point at the archived path.

The maze stays runnable from the archive (its driver imports nothing
from the new visualizer; the archived static files are
self-contained). If a future session wants to revive it, the path is
clear; nothing is lost, only relocated.

### From mpc-visualizer to mpc-visualizer/docs/archive/

(In-place archival — mpc-visualizer becomes a historical artifact in
its own right.)

- `mpc-visualizer/docs/blender nurbs render-display notes.md` —
  v7-era notes; archive.
- Any `_archive/` content already present stays where it is; just
  ensure the archived handoff index in
  `docs/archive/handoffs/README.md` points at the latest in the
  chain.

### Source artifacts that graduate elsewhere

- `mpc-visualizer/docs/mpa_brain_design.md`,
  `mpa_brain_sketch.py` → these belong in mpa-brain once the repo
  exists. Move them, not copy. Leave a stub
  `mpc-visualizer/docs/archive/MIGRATED_TO_MPA_BRAIN.md` listing the
  moved files and their new paths.
- `mpc-visualizer/docs/mpa_brain_sweep*.{py,md}` and
  `mpc-visualizer/docs/results/sweep_*.json` →
  these are substrate-side artifacts; they graduate to
  `mpa-brain/experiments/` and `mpa-brain/docs/results/`
  respectively. Move them per the same stub-file pattern.
- `mpc-visualizer/docs/mpa_brain_sweep_findings.md` and the two
  handoff files (`mpa_brain_repo_handoff.md`,
  `mpa_visualizer_migration_handoff.md`) → these are the *bridging*
  artifacts. Keep them in mpc-visualizer's archive AND copy to
  mpa-visualizer/docs/archive/migration/, so both repos preserve
  the history.

**Done criterion:** mpc-brain has its v7 visualizer demo back home;
mpc-visualizer's docs/ is purged of v7-era notes and substrate-side
artifacts that graduated; an explicit `MIGRATED_TO_*.md` stub file
exists for every moved artifact. mpc-visualizer is now a historical
artifact (v7 + early v8 work); future v8 visualizer work happens in
mpa-visualizer.

---

## Phase 2 — port glass / quantum / cross substrate tabs

**Owner:** migration session.
**Estimated wall-clock:** 2 hours (mostly mechanical).

These three tabs are already v8 and are kept verbatim. The migration
is namespace-only:

- `mpc_glass_packs.measurements` → unchanged (mpc-glass is the
  substrate; rule 4: visualizer consumes, no rename of substrate).
- `mpc_quantum_packs.measurements` → unchanged.
- `mpc-visualizer/drivers/glass_aging.py` →
  `mpa-visualizer/drivers/glass_aging.py` (identical content).
- `mpc-visualizer/drivers/quantum_syndrome.py` →
  `mpa-visualizer/drivers/quantum_syndrome.py` (identical content).
- `mpc-visualizer/drivers/cross_substrate.py` →
  `mpa-visualizer/drivers/cross_substrate.py` (identical content
  initially; phase 3 extends it for brain-spectrum).
- `mpc-visualizer/static/glass/`,
  `static/quantum/`, `static/cross/` → ported verbatim.
- Server registrations match: `"glass"`, `"quantum"`, `"cross"`.

Verify each tab launches and serves curl probes correctly per the
operating notes in [`HANDOFF.md`](../HANDOFF.md). Pattern: launch
server on port 18765, curl
`/api/glass/{init,phase_a,snapshot,sample,complete}` event sequence,
kill server.

**Done criterion:** glass / quantum / cross tabs all serve via
`H:/mpa-visualizer/server.py` on port 18765, smoke-tested end-to-end.

---

## Phase 3 — build brain-spectrum tab + extend cross

**Owner:** migration session OR follow-up session (depends on
mpa-brain existing).
**Estimated wall-clock:** 3 hours.

**Prereq:** `H:\mpa-brain\` exists with
`mpa_brain_packs.measurements.multi_window_fdr_iter` exposed.
([`mpa_brain_repo_handoff.md`](mpa_brain_repo_handoff.md) is done.)

### 3.1 — brain-spectrum driver

`mpa-visualizer/drivers/brain_spectrum.py` — port of
`drivers/glass_aging.py` with these substitutions:

- `_GLASS_ROOT` → `_MPA_BRAIN_ROOT` (`H:\mpa-brain`)
- `mpc_glass_packs.measurements` →
  `mpa_brain_packs.measurements`
- Default config: scenario in {committed, suspended, conflict, reset};
  ẋ_kind defaults to `"position-relative"` (the prescriptive entry
  per F-002); t_w=500, t_obs=10000, n_real=256, τ_windows = the
  geomspace(3, 1000, 11) finer grid (Sweep G).
- NaN scrub at the wire boundary (per HANDOFF.md operating notes —
  glass driver has no scrub, but mpa-brain may, like quantum).

### 3.2 — brain-spectrum tab (the (τ, dt) panel is first-class)

`mpa-visualizer/static/brain-spectrum/{index.html, tab.css, tab.js}`
— port of `static/glass/` with the (τ, dt) plane promoted to a
first-class panel:

- **Primary panel: f(τ, dt) tableau.** dt on rows, τ on columns. Each
  cell colored by f value (linear scale 0 to 1). Scenario-discriminating
  signal lives in the broad-τ × late-dt corner (per F-002); the
  visualization should make that corner visually identifiable.
  Suggested: cells past the rule-8 honest-display threshold (dt > 5τ)
  rendered in full saturation; cells inside the warmup region
  rendered at reduced opacity.
- **Secondary panel: ΔC_d(τ, dt) tableau.** Same orientation.
  Log-scale color (ΔC_d spans 6–8 decades). This is the "flux scale"
  axis (rule 11 connection): conflict's ΔC_d sign-oscillates at
  intermediate (τ, dt); committed/suspended/reset show monotone
  growth. The two tableaux side-by-side give the two-axis
  discrimination.
- **Tertiary panels** (port from glass): substrate observables
  (energy_mean, speed_mean, position_mean per scenario);
  per-scenario 1D fingerprint slice (f vs τ at dt=10000); regime
  timeline.
- **Skip χ_d panel.** Per F-002 / Sweep E, χ_d in position-relative
  coordinates is mostly noise; not a useful display. (If a future
  session derives the right generalised-FDT scaling per F-003,
  revisit.)
- Side panels swap glass's "C(t,t_w), q_initial, energy,
  magnetization" for brain-spectrum's substrate-natural quantities.

### 3.3 — Cross-substrate tab extension

`mpa-visualizer/drivers/cross_substrate.py` extends to a 3-substrate
view: glass + quantum + brain-spectrum side-by-side. The cross-tab
already does glass + quantum; brain-spectrum slots in as the third
column. The F-018 inverted-direction verification becomes a 3-way
comparison: glass and quantum walk in the inverted direction, brain
walks in the un-inverted direction (rule 7's substrate-class
prediction). Same direction across same-class substrates is the
strong test.

`static/cross/{index.html, tab.css, tab.js}` extends accordingly.

### 3.4 — Event protocol document

`mpa-visualizer/docs/brain_v8_event_protocol.md` — describes the
substrate↔visualizer contract for brain-spectrum events. Pattern:
copy `quantum_tab_event_protocol.md` structure, swap fields per the
mpa-brain `multi_window_fdr_iter` event shape.

**Done criterion:** brain-spectrum tab serves on port 18765,
end-to-end smoke; cross tab shows 3-way comparison; F-002's plateau
visible in the (τ, dt) primary panel for committed/suspended/reset
on broad τ × late dt; conflict shows plateau-everywhere-near-zero.

---

## Phase 4 — server + shell

**Owner:** part of phase 3 session typically.
**Estimated wall-clock:** 30 minutes.

- `mpa-visualizer/server.py` — port from mpc-visualizer's, register
  routes for `glass`, `quantum`, `cross`, `brain-spectrum`. Same port
  18765, same single-client-by-design pattern.
- `mpa-visualizer/static/shell.html` and `shell.css` — port verbatim,
  update tab list (remove `brain` maze entry, add `brain-spectrum`).
- Operating notes (port from HANDOFF.md):
  - Single-client visualizer; pattern is launch → curl probe → kill
    within one turn.
  - PowerShell to kill: `Get-Process python | Stop-Process -Force`
    then verify with `Get-NetTCPConnection -LocalPort 18765 -State
    Listen` empty before relaunching.
  - Stale `__pycache__/*.pyc` can mask substrate-side edits — clear
    `mpa-visualizer/drivers/__pycache__/` and any substrate
    `__pycache__/` if SSE events are missing fields the substrate
    yields.
  - NaN on the SSE wire silently drops events browser-side. All
    drivers scrub at the wire boundary.

**Done criterion:** all four tabs (glass, quantum, brain-spectrum,
cross) launch from `python H:/mpa-visualizer/server.py`, smoke-tested
end-to-end.

---

## Phase 5 — README + initial commit + push

**Owner:** migration session.
**Estimated wall-clock:** 30 minutes.

`mpa-visualizer/README.md` — short. Pattern:

```markdown
# mpa-visualizer

Visualizer for v8 MPA primitives across the substrate family. Pure
consumer of substrate streaming primitives (rule 4); no science
implemented here.

## Tabs

- glass: aging in 3D EA Ising
- quantum: surface-code syndromes
- brain-spectrum: overdamped Langevin (mpa-brain), with the (τ, dt)
  plane as a first-class panel (F-002)
- cross: side-by-side comparison of glass + quantum + brain-spectrum

## Origin

Cleanup pass over mpc-visualizer (v7 + early-v8). Maze-navigator demo
preserved at `mpc-brain/_archive/visualizer-demo/`. mpa-* naming
aligned with mpa-central / mpa-brain. The historical mpc-visualizer
remains as a read-only archive; future v8 visualizer work happens
here.

## Run

`python H:/mpa-visualizer/server.py` — port 18765, single-client by
design. See `docs/` for per-substrate event protocols.
```

`gitleaks protect --staged --redact` passes.

`git commit -m "initial commit: mpa-visualizer migration of v8
substrate tabs"`. Push to `github.com/ronviers/mpa-visualizer` (per
the user's repo convention) **only after confirming with the user** —
public-repo publication is a user-permission action.

**Done criterion:** repo committed locally; push deferred to user
confirmation.

---

## Phase 6 — verification + close-out

**Owner:** migration session OR a brief follow-up.
**Estimated wall-clock:** 1 hour.

- Run all four tabs end-to-end (curl probe each event sequence).
- Verify glass and quantum F-018 fingerprints unchanged from
  mpc-visualizer's last reading (regression check on namespace-only
  port).
- Verify brain-spectrum reproduces F-002's plateau structure.
- Verify cross tab shows 3-way comparison.
- Update `H:/mpc-visualizer/README.md` (or wherever) with a banner
  noting the repo is archived and pointing at mpa-visualizer.

**Done criterion:** the migration is complete; future visualizer work
is done in mpa-visualizer; mpc-visualizer is read-only-history.

---

## Future work — when you want it

These are listed *here* (not in the migration phases) so the migration
stays scoped and a future session can pick them up explicitly.

### SAT tab integration (cross-substrate plan step 6)

Adds `mpa-visualizer/drivers/sat_spectrum.py` and
`static/sat-spectrum/`. Substrate-side already done at mpc-sat F-002.
Event protocol documented at
[`sat_tab_event_protocol.md`](sat_tab_event_protocol.md). Pattern:
straight port from quantum tab. ~3 hours of work. Drops the cross tab
to a 4-substrate view (glass + quantum + brain-spectrum + sat).

### λ_A direct on quantum

Same JS log-slope reading the glass tab does, applied to quantum's
‖d‖. ~2 hours. Adds to existing quantum tab.

### MPA-demo dashboard (deferred, no commitment)

Idea: a focused demo showing MPA's regime classification updating in
real time as a substrate trajectory unfolds, with sliders varying the
substrate's parameters. The point is pedagogical: "watch MPA read the
agent's regime as you change the conditions."

**Important:** *not* based on the mpc-brain maze. The maze is
archived and stays archived; reviving it as the demo would shoehorn
a v7 navigation module into a v8 demo for sunk-cost reasons. A fresh
build using one of the v8 substrates (likely brain-spectrum, since
the (τ, dt) plane is the most visual; possibly glass aging, since
its temperature-quench has a clear narrative) is the right path.

If/when this gets built, it's its own session arc with its own
handoff. Do *not* spec it now — let the substrate side mature, see
what's actually missing pedagogically, then decide what to build.

---

## What this handoff explicitly does NOT include

- mpc-brain repo changes (other than receiving the maze archive in
  phase 1). mpc-brain's lattice file etc. stay where they are.
- mpa-central RULES.md changes. The rule 5 / 8 edits are already
  applied in this session; the migration does not touch them.
- Any new substrate work. mpa-brain repo creation is a *separate*
  handoff that must be done before phase 3.

## Total wall-clock estimate

- Phase 0: 15 min
- Phase 1: 30 min (can run in parallel with phase 2)
- Phase 2: 2 hours
- Phase 3: 3 hours (after mpa-brain repo exists)
- Phase 4: 30 min
- Phase 5: 30 min
- Phase 6: 1 hour

≈ 7–8 hours total active work, naturally splits into 2–3 sessions.
Recommended split:
- **Session A:** phases 0–2 + phase 5 partial (skeleton, archive,
  glass/quantum/cross port, README).
- **Session B:** phases 3–4 (brain-spectrum + cross extension +
  server) — depends on mpa-brain repo session in between.
- **Session C:** phase 6 (verify all four tabs + close-out).
