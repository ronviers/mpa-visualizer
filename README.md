# mpa-visualizer

Visualizer for v8 MPA primitives across the substrate family. Pure
consumer of substrate streaming primitives (RULES.md rule 4); no science
implemented here.

## Tabs

- **glass** · aging in 3D EA Ising — ported verbatim from mpc-visualizer.
- **quantum** · surface-code syndromes — ported verbatim from mpc-visualizer.
- **cross** · side-by-side comparison of glass + quantum (3-substrate
  extension to include brain-spectrum lands with the brain-spectrum tab).
- **brain-spectrum** · queued — overdamped Langevin (mpa-brain), with the
  (τ, dt) plane as a first-class panel (F-002). Lands when this repo's
  next session implements
  [phase 3 of the migration handoff](docs/archive/migration/mpa_visualizer_migration_handoff.md).

## Origin

Cleanup pass over mpc-visualizer (v7 + early-v8). The maze-navigator demo
is preserved in mpc-visualizer as historical artifact (its archival to
`mpc-brain/_archive/visualizer-demo/` per the migration handoff is
deferred to a follow-up session). mpa-* naming aligned with mpa-central
/ mpa-brain. The historical mpc-visualizer remains as a read-only
reference; future v8 visualizer work happens here.

## Layout

```
mpa-visualizer/
    server.py                       # multi-tab router; port 18765
    drivers/
        base.py                     # DriverFactory protocol + worker base
        glass_aging.py              # mpc_glass_packs consumer
        quantum_syndrome.py         # mpc_quantum_packs consumer
        cross_substrate.py          # glass+quantum side-by-side; extends
                                    # to 3-way once brain-spectrum lands
    static/
        shell.html, shell.css       # tab nav + hub
        glass/, quantum/, cross/    # per-tab HTML/CSS/JS
    docs/
        quantum_tab_event_protocol.md
        sat_tab_event_protocol.md           # kept for the queued sat tab
        archive/migration/                  # bridging artifacts:
            mpa_brain_repo_handoff.md
            mpa_visualizer_migration_handoff.md
            mpa_brain_sweep_findings.md
```

## Run

```
python H:/mpa-visualizer/server.py
```

Port 18765, single-client by design. Open `http://127.0.0.1:18765/` in a
browser. See `docs/` for per-substrate event protocols.

Operating notes (from mpc-visualizer's HANDOFF.md):

- Pattern: launch → curl probe → kill within one turn.
- PowerShell to kill: `Get-Process python | Stop-Process -Force`,
  then verify with
  `Get-NetTCPConnection -LocalPort 18765 -State Listen`
  empty before relaunching.
- Stale `__pycache__/*.pyc` can mask substrate-side edits — clear
  `drivers/__pycache__/` and any substrate `__pycache__/` if SSE
  events are missing fields the substrate yields.
- NaN on the SSE wire silently drops events browser-side. All
  drivers scrub at the wire boundary.

Env vars (read in this order, both prefixes accepted): `MPA_VIS_HOST` /
`MPA_VIS_PORT`, falling back to `MPC_VIS_HOST` / `MPC_VIS_PORT`.

## Status

This repo is in mid-migration. Phases 0, 2, 4, and partial 5 of the
migration handoff (skeleton, port glass/quantum/cross verbatim, server
+ shell, README) have landed. Still to do:

- **Phase 1** — archive the substrate-side artifacts (sketch, sweep,
  results JSONs) from `H:/mpc-visualizer/docs/` to mpa-brain, and the
  maze-navigator demo to `mpc-brain/_archive/visualizer-demo/`. Leave
  `MIGRATED_TO_*.md` stubs in mpc-visualizer's archive.
- **Phase 3** — brain-spectrum tab (consumes
  `mpa_brain_packs.measurements.multi_window_fdr_iter`; promotes the
  (τ, dt) plane to a first-class panel per F-002) and cross-substrate
  3-way extension.
- **Phase 6** — full verification + close-out banner on
  mpc-visualizer's README.

The full migration plan lives at
[`docs/archive/migration/mpa_visualizer_migration_handoff.md`](docs/archive/migration/mpa_visualizer_migration_handoff.md).
