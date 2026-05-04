// glass/tab.js — 3D EA aging tab.
//
// FALSIFICATION-MODE LAYOUT (2026-05-03 dial-in pass):
//
// The primary panel is the 2D falsification view per the v8 §5 picture:
//   - one selected window (τ_obs)
//   - X axis: ΔC = C_d_diag − C_d
//   - Y axis: χ_d
//   - empirical *trajectory* (line through samples in time order)
//   - MPA envelope for the regime that window currently reads
//   - FDT reference line (χ = ΔC/T)
// Falsification: the empirical trajectory should hug the envelope shape;
// where it peels off is where MPA fails at this scale.
//
// The 3D ribbon is now a secondary view: empirical *trajectory per window*
// (line, not cloud) plus envelope, both stacked on Z = log₁₀(τ_window/dt).
// Two surfaces that should coincide if MPA holds.
//
// Toggles: empirical / envelope / FDT-line / regime-colouring / window pick.
// Designed for educational discernment: turn each layer off in isolation
// to see what each contributes.
'use strict';

// ── Regime palette ────────────────────────────────────────────────────────
const REGIME_COLOR = {
    c: '#79c0ff',          // committed — blue
    s: '#7ee787',          // suspended — green
    r: '#ff7b72',          // reset / equilibrium — red
    k: '#d2a8ff',          // conflict (rare on single-system)
    unstable: '#5d6470',
};

const REGIME_LABEL = {
    c: 'c · committed',
    s: 's · suspended (aging)',
    r: 'r · reset (FDT)',
    k: 'k · conflict',
    unstable: 'denom-noise',
};

// Window palette (when regime-colouring is OFF, we colour by window index).
const WINDOW_PALETTE = ['#79c0ff', '#7ee787', '#ffa657', '#d2a8ff', '#ff7b72', '#56d4dd'];

// ── DOM refs ──────────────────────────────────────────────────────────────

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const sweepCounterEl = document.getElementById('sweep-counter');
const ribbon3DEl = document.getElementById('ribbon-3d');
const falsification2DEl = document.getElementById('falsification-2d');
const runConfigEl = document.getElementById('run-config');
const statusMessageEl = document.getElementById('status-message');
const eventListEl = document.getElementById('event-list');
const restartBtn = document.getElementById('restart-btn');
const LInput = document.getElementById('L-input');
const TInput = document.getElementById('T-input');
const twInput = document.getElementById('tw-input');
const tobsInput = document.getElementById('tobs-input');
const tauInput = document.getElementById('tau-input');

const toggleEmpirical = document.getElementById('toggle-empirical');
const toggleEnvelope = document.getElementById('toggle-envelope');
const toggleFDT = document.getElementById('toggle-fdt');
const toggleRegimeColor = document.getElementById('toggle-regime-color');
const toggleErrorView = document.getElementById('toggle-error-view');
const windowSelect = document.getElementById('window-select');
const nrealInput = document.getElementById('nreal-input');
const substratePanelEl = document.getElementById('substrate-panel');
const regimeTimelineEl = document.getElementById('regime-timeline');
const lambdaPanelEl = document.getElementById('lambda-panel');
const trailPanelEl = document.getElementById('trail-panel');

let evtSource = null;
let runState = null;   // { L, T, t_w, t_obs, tau_windows, samples: [...] }
let selectedWindowIndex = 0;

// ── Plotly init ───────────────────────────────────────────────────────────

function init3DRibbon() {
    const layout = {
        paper_bgcolor: '#0d1117',
        plot_bgcolor: '#0d1117',
        font: { color: '#e6edf3', size: 10 },
        margin: { l: 0, r: 0, t: 8, b: 0 },
        scene: {
            xaxis: { title: 'ΔC', color: '#7d8590', gridcolor: '#30363d',
                     backgroundcolor: '#0d1117', showbackground: true },
            yaxis: { title: 'χ_d', color: '#7d8590', gridcolor: '#30363d',
                     backgroundcolor: '#0d1117', showbackground: true },
            zaxis: { title: 'log₁₀(τ_w/dt)', color: '#7d8590', gridcolor: '#30363d',
                     backgroundcolor: '#0d1117', showbackground: true },
            camera: { eye: { x: 1.7, y: 1.7, z: 1.0 } },
        },
        showlegend: false,
    };
    Plotly.newPlot(ribbon3DEl, [], layout, { displayModeBar: false, responsive: true });
}

function initRegimeTimeline() {
    const layout = {
        paper_bgcolor: '#0d1117',
        plot_bgcolor: '#0d1117',
        font: { color: '#e6edf3', size: 10 },
        margin: { l: 80, r: 12, t: 10, b: 36 },
        xaxis: { title: 'dt = t − t_w', color: '#7d8590', gridcolor: '#30363d', type: 'log' },
        yaxis: { color: '#7d8590', gridcolor: 'rgba(0,0,0,0)', type: 'category' },
        showlegend: false,
    };
    Plotly.newPlot(regimeTimelineEl, [], layout, { displayModeBar: false, responsive: true });
}

function initLambdaPanel() {
    const layout = {
        paper_bgcolor: '#0d1117',
        plot_bgcolor: '#0d1117',
        font: { color: '#e6edf3', size: 10 },
        margin: { l: 56, r: 12, t: 10, b: 38 },
        xaxis: { title: 'dt = t − t_w', color: '#7d8590', gridcolor: '#30363d', type: 'log' },
        yaxis: {
            title: 'λ_A = −d/dt ln‖d_unp‖',
            color: '#7d8590', gridcolor: '#30363d',
            zerolinecolor: '#56d4dd', zerolinewidth: 1.5,
        },
        shapes: [
            // λ_A = 0 reference is the y-axis zerolinecolor; no absolute thresholds
            // (κ⁻¹Φ* is uncalibrated for glass).
        ],
        annotations: [
            { x: 0.5, y: 1.04, xref: 'paper', yref: 'paper',
              text: 'λ_A &lt; 0 ↔ committed (amplifying) · λ_A ≈ 0 ↔ suspended · λ_A &gt; 0 ↔ reset (decaying)',
              showarrow: false,
              font: { color: '#7d8590', size: 9 }, xanchor: 'center' },
        ],
        showlegend: true,
        legend: { x: 0.02, y: 0.02, font: { size: 9 }, bgcolor: 'rgba(13,17,23,0.7)', yanchor: 'bottom' },
    };
    Plotly.newPlot(lambdaPanelEl, [], layout, { displayModeBar: false, responsive: true });
}

function initTrailPanel() {
    const layout = {
        paper_bgcolor: '#0d1117',
        plot_bgcolor: '#0d1117',
        font: { color: '#e6edf3', size: 9 },
        margin: { l: 50, r: 50, t: 10, b: 36 },
        xaxis: { title: 'dt', color: '#7d8590', gridcolor: '#30363d', type: 'log' },
        yaxis: {
            title: { text: '‖d_unp[k]‖', font: { color: '#7ee787' } },
            color: '#7ee787', gridcolor: '#30363d', type: 'log',
        },
        yaxis2: {
            title: { text: 'R = χ_d·T/denom', font: { color: '#ffa657' } },
            color: '#ffa657', gridcolor: 'rgba(0,0,0,0)',
            overlaying: 'y', side: 'right',
        },
        showlegend: true,
        legend: { x: 0.02, y: 0.98, font: { size: 8 }, bgcolor: 'rgba(13,17,23,0.7)' },
    };
    Plotly.newPlot(trailPanelEl, [], layout, { displayModeBar: false, responsive: true });
}

function initSubstratePanel() {
    const layout = {
        paper_bgcolor: '#0d1117',
        plot_bgcolor: '#0d1117',
        font: { color: '#e6edf3', size: 9 },
        margin: { l: 44, r: 8, t: 18, b: 28 },
        xaxis: { title: 'log₁₀(dt)', color: '#7d8590', gridcolor: '#30363d', type: 'log' },
        yaxis: { color: '#7d8590', gridcolor: '#30363d' },
        showlegend: true,
        legend: { x: 0.02, y: 0.98, font: { size: 9 }, bgcolor: 'rgba(13,17,23,0.7)' },
    };
    Plotly.newPlot(substratePanelEl, [], layout, { displayModeBar: false, responsive: true });
}

function init2DFalsification() {
    const layout = {
        paper_bgcolor: '#0d1117',
        plot_bgcolor: '#0d1117',
        font: { color: '#e6edf3', size: 11 },
        margin: { l: 56, r: 12, t: 14, b: 44 },
        xaxis: { title: 'ΔC = C_d_diag − C_d', color: '#7d8590', gridcolor: '#30363d',
                 zerolinecolor: '#30363d' },
        yaxis: { title: 'χ_d', color: '#7d8590', gridcolor: '#30363d',
                 zerolinecolor: '#30363d' },
        showlegend: true,
        legend: { x: 0.02, y: 0.98, font: { size: 10 },
                  bgcolor: 'rgba(13,17,23,0.7)' },
    };
    Plotly.newPlot(falsification2DEl, [], layout, { displayModeBar: false, responsive: true });
}

// ── Helper: rebuild window-select dropdown ────────────────────────────────

function populateWindowSelect() {
    if (!runState) return;
    const cur = windowSelect.value;
    windowSelect.innerHTML = '';
    runState.tau_windows.forEach((tau, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `τ_obs = ${tau}`;
        windowSelect.appendChild(opt);
    });
    // Keep current selection if valid; otherwise default to middle window
    const n = runState.tau_windows.length;
    if (cur && Number(cur) < n) {
        windowSelect.value = cur;
    } else {
        const mid = Math.floor((n - 1) / 2);
        windowSelect.value = String(mid);
    }
    selectedWindowIndex = Number(windowSelect.value);
}

// ── Event handlers ────────────────────────────────────────────────────────

function logEvent(text, cls) {
    const li = document.createElement('li');
    if (cls) li.classList.add(cls);
    li.textContent = text;
    eventListEl.prepend(li);
    while (eventListEl.children.length > 80) eventListEl.lastChild.remove();
}

function onInit(event) {
    runState = {
        L: event.L, T: event.T,
        t_w: event.t_w, t_obs: event.t_obs,
        tau_windows: event.tau_windows,
        h_field: event.h_field,
        seed: event.seed,
        n_realizations: event.n_realizations || 1,
        sample_times: event.sample_times,
        // samplesByRT[r] is a Map keyed by t -> sample event for realisation r.
        // With n_real>1 we keep all realisations' samples to render multiple
        // traces; the average trace is computed on demand from these.
        samplesByRT: [],
    };
    for (let r = 0; r < runState.n_realizations; r++) {
        runState.samplesByRT.push(new Map());
    }
    runConfigEl.textContent = JSON.stringify({
        L: event.L, T: event.T, t_w: event.t_w, t_obs: event.t_obs,
        tau_windows: event.tau_windows, h: event.h_field, seed: event.seed,
        n_samples_planned: event.n_samples_planned,
    }, null, 2);
    statusMessageEl.classList.remove('warn', 'error');
    statusMessageEl.textContent =
        `init · L=${event.L} T=${event.T} t_w=${event.t_w} t_obs=${event.t_obs} `
        + `windows=[${event.tau_windows.join(', ')}]`;
    sweepCounterEl.textContent = `sweep 0 / ${event.t_w + event.t_obs}`;
    logEvent(`init · ${event.n_samples_planned} samples planned`, 'notable');

    populateWindowSelect();
    Plotly.react(ribbon3DEl, [], ribbon3DEl.layout);
    Plotly.react(falsification2DEl, [], falsification2DEl.layout);
}

function onPhaseA(event) {
    if (!runState) return;
    sweepCounterEl.textContent = `sweep ${event.t} / ${runState.t_w + runState.t_obs} (phase A)`;
    statusMessageEl.textContent =
        `phase A · equilibrating to t_w=${event.t_w} · t=${event.t} · `
        + `E/N=${event.energy_density.toFixed(4)}`;
}

function onSnapshot(event) {
    statusMessageEl.textContent = `phase B · paired evolution begins (t_w=${event.t_w})`;
    logEvent(`snapshot at t_w=${event.t_w}`, 'notable');
}

function onPhaseB(event) {
    if (!runState) return;
    sweepCounterEl.textContent =
        `sweep ${event.t} / ${runState.t_w + runState.t_obs} `
        + `(phase B · ${(event.frac_done * 100).toFixed(0)}%)`;
}

function onSample(event) {
    if (!runState) return;
    const r = event.realisation ?? 0;
    if (r < runState.samplesByRT.length) {
        runState.samplesByRT[r].set(event.t, event);
    }
    const labels = event.per_window
        .map(w => `τ=${w.tau_window}:${w.regime}` + (w.R != null ? `(${w.R.toFixed(2)})` : ''))
        .join(' ');
    const realTag = runState.n_realizations > 1
        ? ` [r=${r + 1}/${runState.n_realizations}]` : '';
    logEvent(`sample dt=${event.dt}${realTag} · ${labels}`);
    redraw2D();
    redraw3D();
    redrawSubstrate();
    redrawRegimeTimeline();
    redrawLambda();
    redrawTrail();
}

// ── λ_A(t) per window — v8 §2's classifier on the trail's stability rate ──
function redrawLambda() {
    if (!runState || !lambdaPanelEl) return;
    const samples = averagedSamples();
    if (samples.length < LAMBDA_WINDOW) {
        Plotly.react(lambdaPanelEl, [], lambdaPanelEl.layout);
        return;
    }
    const traces = [];
    runState.tau_windows.forEach((tau, k) => {
        const series = lambdaAForWindow(samples, k);
        const xs = [], ys = [], texts = [];
        for (const p of series) {
            if (p.lambda_A == null) continue;
            xs.push(Math.max(p.dt, 1));
            ys.push(p.lambda_A);
            texts.push(`τ_obs=${tau} dt=${p.dt}<br>λ_A=${p.lambda_A.toExponential(2)}`);
        }
        if (xs.length === 0) return;
        traces.push({
            type: 'scatter', mode: 'lines+markers',
            name: `τ_obs=${tau}`,
            x: xs, y: ys, text: texts,
            line: { color: WINDOW_PALETTE[k % WINDOW_PALETTE.length], width: 2 },
            marker: { size: 5, color: WINDOW_PALETTE[k % WINDOW_PALETTE.length] },
            hovertemplate: '%{text}<extra></extra>',
        });
    });
    Plotly.react(lambdaPanelEl, traces, lambdaPanelEl.layout, { responsive: true });
}

// ── Trail dynamics — ‖d_unp[k]‖(t) on log-log, plus R(t) on second axis ──
function redrawTrail() {
    if (!runState || !trailPanelEl) return;
    const samples = averagedSamples();
    if (samples.length === 0) {
        Plotly.react(trailPanelEl, [], trailPanelEl.layout);
        return;
    }
    const traces = [];
    runState.tau_windows.forEach((tau, k) => {
        const xs_d = [], ys_d = [], xs_R = [], ys_R = [];
        for (const s of samples) {
            const w = s.per_window[k];
            if (!w) continue;
            const dt = Math.max(s.dt, 1);
            // ‖d‖ = sqrt(C_d_diag); log scale
            if (Number.isFinite(w.C_d_diag) && w.C_d_diag > 0) {
                xs_d.push(dt);
                ys_d.push(Math.sqrt(w.C_d_diag));
            }
            // R(t) — only for resolved samples
            if (w.R != null && Number.isFinite(w.R)) {
                xs_R.push(dt);
                ys_R.push(w.R);
            }
        }
        const color = WINDOW_PALETTE[k % WINDOW_PALETTE.length];
        if (xs_d.length > 0) {
            traces.push({
                type: 'scatter', mode: 'lines',
                name: `‖d‖ τ=${tau}`,
                x: xs_d, y: ys_d,
                yaxis: 'y',
                line: { color, width: 2 },
            });
        }
        if (xs_R.length > 0) {
            traces.push({
                type: 'scatter', mode: 'lines',
                name: `R τ=${tau}`,
                x: xs_R, y: ys_R,
                yaxis: 'y2',
                line: { color, width: 1, dash: 'dot' },
                opacity: 0.7,
            });
        }
    });
    // R = 1 reference line on y2 (FDT)
    if (samples.length > 0) {
        const dts = samples.map(s => Math.max(s.dt, 1));
        traces.push({
            type: 'scatter', mode: 'lines',
            name: 'R = 1 (FDT)',
            x: [Math.min(...dts), Math.max(...dts)],
            y: [1, 1], yaxis: 'y2',
            line: { color: '#7d8590', width: 1, dash: 'dash' },
            opacity: 0.6, hoverinfo: 'skip', showlegend: false,
        });
    }
    Plotly.react(trailPanelEl, traces, trailPanelEl.layout, { responsive: true });
}

// ── Regime timeline — MPA's reading per (window, time) ────────────────────
//
// Each row is a window τ_obs (lowest at bottom = narrowest kernel).
// Each marker on the row is one sample; colour = regime classification.
// Visual prediction (v8 §5 hierarchy migration): at any fixed dt, reading
// down the column should produce c → s → r as τ_obs widens. If the colours
// aren't ordered that way, the hierarchy isn't migrating monotonically and
// MPA's central prediction for this substrate is in trouble at this scale.
function redrawRegimeTimeline() {
    if (!runState || !regimeTimelineEl) return;
    const samples = averagedSamples();
    if (samples.length === 0) {
        Plotly.react(regimeTimelineEl, [], regimeTimelineEl.layout);
        return;
    }
    const traces = [];
    // Row labels (categorical y axis): one per window, in widening order
    const rowLabels = runState.tau_windows.map(t => `τ=${t}`);

    runState.tau_windows.forEach((tau, k) => {
        const xs = [], ys = [], colors = [], texts = [];
        for (const s of samples) {
            const w = s.per_window[k];
            if (!w) continue;
            xs.push(Math.max(s.dt, 1));
            ys.push(rowLabels[k]);
            colors.push(REGIME_COLOR[w.regime] || REGIME_COLOR.unstable);
            texts.push(`τ_obs=${tau}  dt=${s.dt}<br>regime=${w.regime}` +
                (w.R != null ? `  R=${w.R.toFixed(3)}` : ''));
        }
        if (xs.length === 0) return;
        traces.push({
            type: 'scatter', mode: 'markers',
            x: xs, y: ys, text: texts,
            marker: {
                size: 14, symbol: 'square', color: colors,
                line: { color: '#0d1117', width: 1 },
            },
            hovertemplate: '%{text}<extra></extra>',
            showlegend: false,
        });
    });

    const layout = {
        ...regimeTimelineEl.layout,
        yaxis: {
            ...regimeTimelineEl.layout.yaxis,
            categoryorder: 'array',
            categoryarray: rowLabels,
        },
    };
    Plotly.react(regimeTimelineEl, traces, layout, { responsive: true });
}

// Estimate breakpoint per window from late-time C_d(t, t_w) plateau.
// This is the dimensionally-honest calibration: the breakpoint lives in
// trail-vector denom space (where the empirical lives), not raw-spin denom
// space. Per window because v8 §2 scale-relativity says different kernels
// see different effective q_EA_d plateaus.
//
// breakpointDc_k = C_d_diag_late_k − C_d_late_k (per window k)
//
// Returns array parallel to runState.tau_windows: each entry is
//   { breakpointDc, qEA_d, Cd_diag_late, Cd_late, n_used }
// or null if too few samples.
function calibrateBreakpointFromCd(samples) {
    if (!runState || !samples || samples.length < 6) return null;
    const sorted = samples.slice().sort((a, b) => a.dt - b.dt);
    const half = sorted.slice(Math.floor(sorted.length / 2));
    const out = runState.tau_windows.map((tau, k) => {
        let CdSum = 0, CddSum = 0, n = 0;
        for (const s of half) {
            const w = s.per_window[k];
            if (!w || !Number.isFinite(w.C_d) || !Number.isFinite(w.C_d_diag)) continue;
            CdSum += w.C_d;
            CddSum += w.C_d_diag;
            n++;
        }
        if (n === 0) return null;
        const Cd_late = CdSum / n;
        const Cdd_late = CddSum / n;
        return {
            tau_window: tau,
            breakpointDc: Math.max(Cdd_late - Cd_late, 0),
            qEA_d: Cd_late / Math.max(Cdd_late, 1e-12),  // normalized order parameter
            Cd_late, Cdd_late, n_used: n,
        };
    });
    return out;
}

// Estimate q_EA from late-time C(t, t_w) saturation in averaged samples.
// q_EA is the long-time limit of the two-time correlation between t > t_w
// and t_w. C IS that observable (already in the sample event); it saturates
// at q_EA when the system is in the aging regime.
//
// Note: q_initial (overlap with the t=0 random initial config) is a
// DIFFERENT observable — it decorrelates to zero rather than saturating
// at q_EA. We surface q_initial in the substrate panel as a separate trace
// for visibility, but calibration uses C.
//
// Returns { qEA, n_used, breakpointDc, source } or null.
function calibrateQEAFromSubstrate(avgSamples) {
    const ts = avgSamples.filter(s => Number.isFinite(s.C));
    if (ts.length < 6) return null;
    const sorted = ts.slice().sort((a, b) => a.dt - b.dt);
    const half = sorted.slice(Math.floor(sorted.length / 2));
    const cVals = half.map(s => s.C);
    const cMean = cVals.reduce((a, b) => a + b, 0) / cVals.length;
    const qEA = Math.max(0, Math.min(1, Math.abs(cMean)));
    return {
        qEA,
        breakpointDc: 1 - qEA,
        n_used: half.length,
        source: 'C(t, t_w) late-t saturation',
    };
}

// Helper: per-realisation samples in time order, for realisation r.
function sortedSamplesForRealisation(r) {
    if (!runState || r >= runState.samplesByRT.length) return [];
    return Array.from(runState.samplesByRT[r].values()).sort((a, b) => a.t - b.t);
}

// Helper: average across all realisations that have a sample at each t.
// Returns a synthetic per-window record per t (no realisation index), with
// keys mirroring a regular sample. Only includes t values where at least
// one realisation has reported.
function averagedSamples() {
    if (!runState) return [];
    const allTs = new Set();
    for (const m of runState.samplesByRT) {
        for (const t of m.keys()) allTs.add(t);
    }
    const ts = Array.from(allTs).sort((a, b) => a - b);
    const out = [];
    for (const t of ts) {
        const present = [];
        for (const m of runState.samplesByRT) {
            if (m.has(t)) present.push(m.get(t));
        }
        if (present.length === 0) continue;
        const ref = present[0];
        // Substrate state averaged across realisations (if present)
        let substrate = null;
        const subPresent = present.filter(e => e.substrate);
        if (subPresent.length > 0) {
            substrate = {
                q_initial: subPresent.reduce((s, e) => s + e.substrate.q_initial, 0) / subPresent.length,
                energy_density: subPresent.reduce((s, e) => s + e.substrate.energy_density, 0) / subPresent.length,
                magnetization: subPresent.reduce((s, e) => s + e.substrate.magnetization, 0) / subPresent.length,
            };
        }
        const avg = {
            type: 'sample',
            t: ref.t, t_w: ref.t_w, dt: ref.dt,
            n_real_done: present.length,
            C: present.reduce((s, e) => s + e.C, 0) / present.length,
            chi: present.reduce((s, e) => s + e.chi, 0) / present.length,
            substrate,
            per_window: ref.per_window.map((_, k) => {
                const Cd = present.reduce((s, e) => s + e.per_window[k].C_d, 0) / present.length;
                const Cdd = present.reduce((s, e) => s + e.per_window[k].C_d_diag, 0) / present.length;
                const cd = present.reduce((s, e) => s + e.per_window[k].chi_d, 0) / present.length;
                const denom = Math.max(Cdd - Cd, 0);
                const T = runState.T;
                let R = null;
                if (denom > 0.02) R = cd * T / Math.max(denom, 1e-12);
                let regime = 'unstable';
                if (denom > 0.02 && R != null && Number.isFinite(R)) {
                    if (R < 0) regime = 'k';
                    else if (R < 0.30) regime = 'c';
                    else if (R < 0.85) regime = 's';
                    else if (R < 1.30) regime = 'r';
                    else regime = 'unstable';
                }
                return {
                    tau_window: ref.per_window[k].tau_window,
                    C_d: Cd, C_d_diag: Cdd, chi_d: cd,
                    denom, R, regime,
                    Z: Math.log10(Math.max(ref.per_window[k].tau_window, 1) / Math.max(ref.dt, 1)),
                };
            }),
        };
        out.push(avg);
    }
    return out;
}

// ── v8 §2 / Appendix A: λ_A from trail-norm history ──────────────────────
//
// v8 Appendix A defines the trail's stability via ‖d_A(t)‖ ~ exp(λ_A·t)
// with the sign convention λ_A < 0 for amplifying/sustained trails
// (committed) and λ_A > 0 for decaying trails (reset). We take this to
// mean λ_A = − d/dt ln‖d_A(t)‖, which makes:
//   λ_A < 0 ↔ ‖d‖ growing  ↔ committed (amplifying)
//   λ_A ≈ 0 ↔ ‖d‖ steady   ↔ suspended (marginal)
//   λ_A > 0 ↔ ‖d‖ decaying ↔ reset
//
// We have ‖d_unp[k]‖² = C_d_diag in every sample. The estimator: rolling
// linear regression of ln‖d‖ on t over the last `window` samples; slope
// gives d/dt ln‖d‖, then λ_A = −slope.
//
// We do NOT draw absolute thresholds: κ⁻¹Φ* is substrate-conditional and
// uncalibrated for glass. Show the curves themselves; visual ordering
// across windows is the v8 §5 hierarchy migration prediction.

const LAMBDA_WINDOW = 5;  // rolling-window size for λ_A regression

function lambdaAForWindow(samples, k) {
    // Returns parallel array of {t, dt, lambda_A} for the given window k.
    // λ_A is null for the first (LAMBDA_WINDOW − 1) samples (no history).
    const out = [];
    const logNorms = [];   // [t, ln‖d‖]
    for (const s of samples) {
        const w = s.per_window[k];
        if (!w || !Number.isFinite(w.C_d_diag) || w.C_d_diag <= 0) {
            out.push({ t: s.t, dt: s.dt, lambda_A: null });
            continue;
        }
        const lnd = 0.5 * Math.log(w.C_d_diag);
        logNorms.push({ t: s.t, lnd });
        if (logNorms.length < LAMBDA_WINDOW) {
            out.push({ t: s.t, dt: s.dt, lambda_A: null });
            continue;
        }
        // Linear regression on the last LAMBDA_WINDOW points
        const win = logNorms.slice(-LAMBDA_WINDOW);
        const n = win.length;
        const meanT = win.reduce((a, p) => a + p.t, 0) / n;
        const meanY = win.reduce((a, p) => a + p.lnd, 0) / n;
        let num = 0, den = 0;
        for (const p of win) {
            num += (p.t - meanT) * (p.lnd - meanY);
            den += (p.t - meanT) ** 2;
        }
        const slope = den > 0 ? num / den : 0;
        // v8 sign convention: λ_A = -d/dt ln‖d‖
        const lambdaA = -slope;
        out.push({ t: s.t, dt: s.dt, lambda_A: lambdaA });
    }
    return out;
}

// ── v8 §5 envelope ported to JS for client-side recompute ─────────────────
//
// Mirror of `regime_envelope` in mpc_glass_packs/measurements.py, so the
// visualizer can redraw the envelope with self-calibrated parameters
// without a server round-trip. Keep these in lockstep.

const C_SLOPE_FRACTION = 0.10;
const S_BREAKPOINT_DC_DEFAULT = 0.40;
const S_AGING_SLOPE_DEFAULT = 0.50;

function regimeEnvelopeJS(regime, T, denomMax, n = 24,
                          breakpointDc = S_BREAKPOINT_DC_DEFAULT,
                          agingSlope = S_AGING_SLOPE_DEFAULT) {
    if (denomMax <= 0 || regime === 'unstable' || regime === 'k') return [];
    const xs = [], ys = [];
    for (let i = 0; i < n; i++) {
        const x = denomMax * i / (n - 1);
        let y;
        if (regime === 'r') y = x / T;
        else if (regime === 's') {
            // Two-segment canonical CK: FDT up to breakpoint, then aging slope.
            y = (x < breakpointDc)
                ? x / T
                : (breakpointDc + agingSlope * (x - breakpointDc)) / T;
        }
        else if (regime === 'c') y = C_SLOPE_FRACTION * x / T;
        else return [];
        xs.push(x); ys.push(y);
    }
    return xs.map((x, i) => [x, ys[i]]);
}

// ── MPA self-calibration: estimate q_EA-derived breakpoint and aging slope
//    from the averaged trajectory of one window. Returns
//    { breakpointDc, agingSlope, qEA, n_used } or null if not enough resolved
//    samples. ─────────────────────────────────────────────────────────────

function calibrateFromTrajectory(samples, k, T) {
    // Walk samples in dt order; find the first stable sample where R first
    // drops below FDT (R < 0.85 = entering s-band). Breakpoint ΔC is the
    // denom at that crossing. Aging slope is the mean R across post-crossing
    // s-classified samples.
    if (!samples || samples.length === 0) return null;
    let breakpointDc = null;
    const sSlopes = [];
    let lastFdtDc = 0;
    for (const s of samples) {
        const w = s.per_window[k];
        if (!w || !Number.isFinite(w.R)) continue;
        if (w.regime === 'r' || (w.R != null && w.R >= 0.85)) {
            // Still on FDT — track the latest ΔC where R is still r-like
            lastFdtDc = w.denom;
            continue;
        }
        if (w.regime === 's' && w.R != null && w.R > 0) {
            if (breakpointDc == null) breakpointDc = lastFdtDc || w.denom;
            sSlopes.push(w.R);
        }
    }
    if (breakpointDc == null || sSlopes.length < 2) return null;
    const agingSlope = sSlopes.reduce((a, b) => a + b, 0) / sSlopes.length;
    const qEA = Math.max(0, Math.min(1, 1 - breakpointDc));
    return { breakpointDc, agingSlope, qEA, n_used: sSlopes.length };
}

function onComplete(event) {
    statusMessageEl.classList.remove('warn', 'error');
    const nReal = (runState && runState.n_realizations) || 1;
    const n = runState ? averagedSamples().length : 0;
    statusMessageEl.textContent = nReal > 1
        ? `complete · ${n} sample-times averaged over ${nReal} realisations`
        : `complete · ${n} samples (single realisation)`;
    logEvent(`run complete`, 'notable');
}

function onError(event) {
    statusMessageEl.classList.remove('warn');
    statusMessageEl.classList.add('error');
    statusMessageEl.textContent = event.msg.split('\n')[0];
    logEvent(`error · ${event.msg.split('\n')[0]}`, 'error');
}

// ── 2D falsification view ─────────────────────────────────────────────────
//
// One window. X = ΔC. Y = χ_d. Three layers, each toggle-controlled:
//   - empirical: line + markers connecting samples in time order
//   - envelope:  parametric (ΔC, χ) curve for the regime that window
//                most-recently reads (the v8 §5 predicted shape)
//   - FDT line:  χ = ΔC/T reference (where r-regime should sit)
// Plus regime-colouring on/off for the empirical markers.

// Linear interpolation of an envelope curve at a given ΔC.
// Envelope is a list of [denom, chi] pairs sorted by denom.
function interpEnvelope(env, dc) {
    if (!env || env.length === 0) return null;
    if (dc <= env[0][0]) return env[0][1];
    if (dc >= env[env.length - 1][0]) return env[env.length - 1][1];
    for (let i = 1; i < env.length; i++) {
        if (env[i][0] >= dc) {
            const [x0, y0] = env[i - 1];
            const [x1, y1] = env[i];
            const t = (dc - x0) / Math.max(x1 - x0, 1e-12);
            return y0 + t * (y1 - y0);
        }
    }
    return env[env.length - 1][1];
}

function redraw2D() {
    if (!runState) {
        Plotly.react(falsification2DEl, [], falsification2DEl.layout);
        return;
    }
    const avgSamples = averagedSamples();
    if (avgSamples.length === 0) {
        Plotly.react(falsification2DEl, [], falsification2DEl.layout);
        updateCalibrationDisplay(null);
        return;
    }
    const k = selectedWindowIndex;
    if (k >= runState.tau_windows.length) return;
    const T = runState.T;
    const tau = runState.tau_windows[k];

    // MPA self-calibration — THREE sources:
    //   1) FDR-derived: fit breakpoint + aging slope from the FDR locus.
    //   2) Raw-spin-derived: q_EA = late-time C(t, t_w) saturation.
    //      Lives in raw-spin denom space [0, 1].
    //   3) Trail-vector-derived (per window): late-time C_d(t, t_w) plateau.
    //      Lives in trail-vector denom space [0, C_d_diag] — same space
    //      the empirical (denom, χ_d) trajectory lives in.
    // Source 3 is the dimensionally-honest one for the envelope draw.
    const calibFDR = calibrateFromTrajectory(avgSamples, k, T);
    const calibSubstrate = calibrateQEAFromSubstrate(avgSamples);
    const calibCd = calibrateBreakpointFromCd(avgSamples);
    updateCalibrationDisplay(calibFDR, calibSubstrate, calibCd, k);
    // Envelope draws prefer the per-window C_d-derived breakpoint (correct
    // coordinate space). Aging slope still comes from the FDR-shape
    // calibration when available, defaults otherwise.
    const calibCdK = calibCd ? calibCd[k] : null;
    const calib = calibCdK
        ? {
            breakpointDc: calibCdK.breakpointDc,
            agingSlope: calibFDR ? calibFDR.agingSlope : S_AGING_SLOPE_DEFAULT,
            qEA: calibCdK.qEA_d,
            n_used: calibCdK.n_used,
            source: 'C_d late-t plateau (window-local)' + (calibFDR ? ' + FDR slope' : ''),
        }
        : (calibSubstrate
            ? {
                breakpointDc: calibSubstrate.breakpointDc,
                agingSlope: calibFDR ? calibFDR.agingSlope : S_AGING_SLOPE_DEFAULT,
                qEA: calibSubstrate.qEA,
                n_used: calibSubstrate.n_used,
                source: 'substrate C(t, t_w) (raw-spin space)',
            }
            : calibFDR);

    // Determine the dominant non-unstable regime for the envelope shape.
    let dominantRegime = 'unstable';
    for (let i = avgSamples.length - 1; i >= 0; i--) {
        const w = avgSamples[i].per_window[k];
        if (w.regime !== 'unstable') { dominantRegime = w.regime; break; }
    }

    // Compute envelope client-side with calibrated params (if available).
    const breakpointDc = calib ? calib.breakpointDc : S_BREAKPOINT_DC_DEFAULT;
    const agingSlope = calib ? calib.agingSlope : S_AGING_SLOPE_DEFAULT;

    // Compute denomMax from the averaged trajectory so the envelope range
    // tracks the data.
    let denomMax = 0.05;
    for (const s of avgSamples) {
        const w = s.per_window[k];
        if (w.denom > denomMax) denomMax = w.denom;
    }
    const refEnv = regimeEnvelopeJS(dominantRegime, T, denomMax * 1.4, 24,
                                     breakpointDc, agingSlope);

    // Error view: residual = empirical χ_d − envelope(ΔC) per averaged sample.
    if (toggleErrorView.checked) {
        const xs = [], ys = [], colors = [], texts = [];
        for (const s of avgSamples) {
            const w = s.per_window[k];
            if (!w || w.regime === 'unstable') continue;
            const predicted = interpEnvelope(refEnv, w.denom);
            if (predicted == null) continue;
            const residual = w.chi_d - predicted;
            xs.push(w.denom);
            ys.push(residual);
            colors.push(REGIME_COLOR[w.regime] || REGIME_COLOR.unstable);
            texts.push(`dt=${s.dt} regime=${w.regime}<br>χ_d=${w.chi_d.toFixed(4)} predicted=${predicted.toFixed(4)} residual=${residual.toFixed(4)}`);
        }

        const traces = [];
        // Zero line (perfect agreement reference)
        if (xs.length > 0) {
            const xMax = Math.max(...xs) * 1.1 || 0.5;
            traces.push({
                type: 'scatter', mode: 'lines',
                name: 'zero (envelope hits)',
                x: [0, xMax], y: [0, 0],
                line: { color: '#7d8590', width: 1, dash: 'dash' },
                hoverinfo: 'skip',
            });
        }
        // Residual trajectory (line + markers)
        if (xs.length > 0) {
            traces.push({
                type: 'scatter', mode: 'lines+markers',
                name: 'empirical − envelope',
                x: xs, y: ys, text: texts,
                line: { color: '#e6edf3', width: 1.5 },
                marker: {
                    size: 7,
                    color: toggleRegimeColor.checked ? colors : '#e6edf3',
                    line: { color: '#0d1117', width: 1 },
                },
                hovertemplate: '%{text}<br>ΔC=%{x:.3f}  residual=%{y:+.4f}<extra></extra>',
            });
        }
        const yAbs = Math.max(0.05, ...ys.map(v => Math.abs(v))) * 1.25;
        const xMax = (xs.length > 0 ? Math.max(...xs) : 0.5) * 1.1;
        const calibTag = calib
            ? `q_EA≈${calib.qEA.toFixed(2)} X≈${calib.agingSlope.toFixed(2)} (calibrated)`
            : `default params`;
        const layout = {
            ...falsification2DEl.layout,
            xaxis: { ...falsification2DEl.layout.xaxis, title: 'ΔC = C_d_diag − C_d', range: [0, xMax] },
            yaxis: { ...falsification2DEl.layout.yaxis, title: 'residual: χ_d − envelope(ΔC)', range: [-yAbs, yAbs] },
            title: {
                text: `error view · τ_obs = ${tau} · vs ${dominantRegime}-envelope · ${calibTag} · ${xs.length} resolved`,
                font: { color: '#e6edf3', size: 12 },
                x: 0.02, y: 0.98, xanchor: 'left', yanchor: 'top',
            },
        };
        Plotly.react(falsification2DEl, traces, layout, { responsive: true });
        return;
    }

    // Trajectory view: per-realisation traces (faint) + averaged trace (bold)
    // + envelope (calibrated) + FDT reference.

    // Bounds across averaged trajectory (and any realisation traces).
    let denomMax2 = 0.05, chiMax2 = 0.02, lastRegime = 'unstable';
    for (const s of avgSamples) {
        const w = s.per_window[k];
        if (!w) continue;
        if (w.denom > denomMax2) denomMax2 = w.denom;
        if (w.chi_d > chiMax2) chiMax2 = w.chi_d;
        if (w.regime !== 'unstable') lastRegime = w.regime;
    }

    // Axis padding so both reference lines show fully
    const denomAxis = Math.max(denomMax2 * 1.25, 0.05);
    const chiAxis = Math.max(chiMax2 * 1.25, denomAxis / T * 0.5);

    const traces = [];
    const showEmpirical = toggleEmpirical.checked;
    const showEnvelope = toggleEnvelope.checked;
    const showFDT = toggleFDT.checked;
    const colorByRegime = toggleRegimeColor.checked;

    // FDT reference line
    if (showFDT) {
        traces.push({
            type: 'scatter', mode: 'lines',
            name: 'FDT  χ = ΔC/T',
            x: [0, denomAxis],
            y: [0, denomAxis / T],
            line: { color: '#7d8590', width: 1, dash: 'dash' },
            opacity: 0.7,
            hoverinfo: 'skip',
        });
    }

    // MPA envelope — calibrated if possible, else default params.
    if (showEnvelope && refEnv.length > 0 && dominantRegime !== 'unstable') {
        traces.push({
            type: 'scatter', mode: 'lines',
            name: `MPA envelope · ${REGIME_LABEL[dominantRegime] || dominantRegime}` + (calib ? ' (calibrated)' : ' (default)'),
            x: refEnv.map(p => p[0]),
            y: refEnv.map(p => p[1]),
            line: { color: REGIME_COLOR[dominantRegime] || '#7d8590', width: 2, dash: 'dot' },
            opacity: 0.9,
            hoverinfo: 'skip',
        });
    }

    // Per-realisation faint traces — one per realisation that has data.
    if (showEmpirical && runState.n_realizations > 1) {
        for (let r = 0; r < runState.n_realizations; r++) {
            const realSamples = sortedSamplesForRealisation(r);
            const rxs = [], rys = [];
            for (const s of realSamples) {
                const w = s.per_window[k];
                if (!w) continue;
                rxs.push(w.denom);
                rys.push(w.chi_d);
            }
            if (rxs.length === 0) continue;
            traces.push({
                type: 'scatter', mode: 'lines+markers',
                name: `realisation ${r + 1}`,
                x: rxs, y: rys,
                line: { color: WINDOW_PALETTE[r % WINDOW_PALETTE.length], width: 1 },
                marker: { size: 3, color: WINDOW_PALETTE[r % WINDOW_PALETTE.length] },
                opacity: 0.45,
                hoverinfo: 'skip',
                showlegend: r < 6,
            });
        }
    }

    // Bold averaged trajectory (line + regime-coloured markers).
    if (showEmpirical) {
        const xs = [], ys = [], colors = [], texts = [];
        for (const s of avgSamples) {
            const w = s.per_window[k];
            if (!w) continue;
            xs.push(w.denom);
            ys.push(w.chi_d);
            colors.push(REGIME_COLOR[w.regime] || REGIME_COLOR.unstable);
            texts.push(
                `dt=${s.dt} τ=${w.tau_window}<br>R=${w.R != null ? w.R.toFixed(3) : 'n/a'} `
                + `regime=${w.regime} (n_real=${s.n_real_done})`
            );
        }
        if (xs.length > 0) {
            traces.push({
                type: 'scatter', mode: 'lines',
                name: runState.n_realizations > 1
                    ? `averaged · τ_obs=${tau}` : `empirical · τ_obs=${tau}`,
                x: xs, y: ys,
                line: { color: '#e6edf3', width: 2.2 },
                opacity: 0.95,
                hoverinfo: 'skip',
                showlegend: true,
            });
            traces.push({
                type: 'scatter', mode: 'markers',
                name: 'sample (regime-coloured)',
                x: xs, y: ys, text: texts,
                marker: {
                    size: 7,
                    color: colorByRegime ? colors : '#e6edf3',
                    line: { color: '#0d1117', width: 1 },
                },
                hovertemplate: '%{text}<br>ΔC=%{x:.3f}  χ_d=%{y:.3f}<extra></extra>',
                showlegend: false,
            });
        }
    }

    // Title
    const nReal = runState.n_realizations || 1;
    const calibTag = calib
        ? `MPA-calibrated  q_EA≈${calib.qEA.toFixed(2)}  X≈${calib.agingSlope.toFixed(2)}  (n=${calib.n_used})`
        : 'MPA defaults  q_EA≈0.6  X≈0.50';
    const titleSamples = nReal > 1
        ? `${avgSamples.length} sample-times · ${nReal} realisations`
        : `${avgSamples.length} samples · single realisation`;
    const layout = {
        ...falsification2DEl.layout,
        xaxis: { ...falsification2DEl.layout.xaxis, range: [0, denomAxis] },
        yaxis: { ...falsification2DEl.layout.yaxis, range: [0, chiAxis] },
        title: {
            text: `τ_obs = ${tau}  ·  ${titleSamples}  ·  ${calibTag}`,
            font: { color: '#e6edf3', size: 12 },
            x: 0.02, y: 0.98, xanchor: 'left', yanchor: 'top',
        },
    };

    Plotly.react(falsification2DEl, traces, layout, { responsive: true });
}

// ── Calibration display panel update ─────────────────────────────────────
function updateCalibrationDisplay(calibFDR, calibSubstrate, calibCd, selectedK) {
    const el = document.getElementById('calibration-display');
    if (!el) return;
    const calibCdK = (calibCd && selectedK != null) ? calibCd[selectedK] : null;
    const have = calibFDR || calibSubstrate || calibCdK;
    if (!have) {
        el.innerHTML = '<span class="dim-text">MPA self-calibration: not enough samples yet.</span>';
        return;
    }
    let html = '<strong>MPA self-calibration</strong> · three sources:<br>';
    // Trail-vector (per-window C_d) — the dimensionally-honest one
    if (calibCdK) {
        const tau = calibCdK.tau_window;
        html += `&nbsp;&nbsp;<strong>trail-vector</strong> (C_d late-t @ τ=${tau}): ` +
            `q_EA_d ≈ <span class="cal-val">${calibCdK.qEA_d.toFixed(3)}</span> ` +
            `→ ΔC* ≈ <span class="cal-val">${calibCdK.breakpointDc.toFixed(3)}</span> ` +
            `<span class="dim-text">(${calibCdK.n_used} late-t samples · used by envelope)</span><br>`;
    } else {
        html += `&nbsp;&nbsp;<span class="dim-text">trail-vector: not enough samples</span><br>`;
    }
    // Raw-spin substrate
    if (calibSubstrate) {
        html += `&nbsp;&nbsp;<strong>raw-spin</strong> (C(t, t_w) saturation): ` +
            `q_EA ≈ <span class="cal-val">${calibSubstrate.qEA.toFixed(3)}</span> ` +
            `→ ΔC* ≈ <span class="cal-val">${calibSubstrate.breakpointDc.toFixed(3)}</span> ` +
            `<span class="dim-text">(${calibSubstrate.n_used} late-t samples · raw-spin space)</span><br>`;
    } else {
        html += `&nbsp;&nbsp;<span class="dim-text">raw-spin: not enough samples</span><br>`;
    }
    // FDR shape
    if (calibFDR) {
        html += `&nbsp;&nbsp;<strong>FDR shape</strong> (locus breakpoint): ` +
            `q_EA ≈ <span class="cal-val">${calibFDR.qEA.toFixed(3)}</span> ` +
            `→ ΔC* ≈ <span class="cal-val">${calibFDR.breakpointDc.toFixed(3)}</span>, ` +
            `X ≈ <span class="cal-val">${calibFDR.agingSlope.toFixed(3)}</span> ` +
            `<span class="dim-text">(${calibFDR.n_used} s-samples)</span>`;
    } else {
        html += `&nbsp;&nbsp;<span class="dim-text">FDR shape: not enough s-classified samples</span>`;
    }
    // Per-window breakdown of trail-vector breakpoints (across all windows)
    if (calibCd) {
        const cells = calibCd
            .filter(c => c != null)
            .map(c => `τ=${c.tau_window}: ΔC*=${c.breakpointDc.toFixed(3)}`)
            .join('  ·  ');
        if (cells) {
            html += `<br>&nbsp;&nbsp;<span class="dim-text" style="font-size:0.78rem">` +
                `per-window trail-vector breakpoints: ${cells}` +
                `</span>`;
        }
    }
    // Consistency check between the three (compare q_EA values)
    const qEAs = [
        calibCdK && calibCdK.qEA_d,
        calibSubstrate && calibSubstrate.qEA,
        calibFDR && calibFDR.qEA,
    ].filter(v => v != null);
    if (qEAs.length >= 2) {
        const max = Math.max(...qEAs);
        const min = Math.min(...qEAs);
        const spread = max - min;
        const tag = spread < 0.10 ? '✓ consistent' : '⚠ spread';
        html += `<br>&nbsp;&nbsp;<span class="dim-text">q_EA spread across sources = ${spread.toFixed(3)} · ${tag}</span>`;
    }
    el.innerHTML = html;
}

// ── Substrate state panel — C, q_initial, energy, magnetization vs dt ─────
//
// All four observables on the same time axis (dt). MPA reads substrate
// state continuously; this panel surfaces what it's reading. The two
// overlap signals tell different stories:
//
//   C(t, t_w) = ⟨s(t)·s(t_w)⟩       — saturates at q_EA in long-time aging
//   q_initial = ⟨s(t)·s(0)⟩         — fresh-quench overlap, decorrelates to 0
//
// Energy descending = the substrate is aging.
// Magnetization should stay ~0 in spin-glass phase.
function redrawSubstrate() {
    if (!runState || !substratePanelEl) return;
    const samples = averagedSamples();
    const ts = samples.filter(s => s.substrate);
    if (ts.length === 0) {
        Plotly.react(substratePanelEl, [], substratePanelEl.layout);
        return;
    }
    const dts = ts.map(s => Math.max(s.dt, 1));
    const C = ts.map(s => s.C);
    const qInit = ts.map(s => s.substrate.q_initial);
    const energy = ts.map(s => s.substrate.energy_density);
    const mag = ts.map(s => s.substrate.magnetization);

    const traces = [
        // C(t, t_w) — primary q_EA observable. Saturates at q_EA in aging.
        {
            type: 'scatter', mode: 'lines+markers',
            name: 'C(t, t_w) → q_EA',
            x: dts, y: C,
            yaxis: 'y',
            line: { color: '#7ee787', width: 2 },
            marker: { size: 5, color: '#7ee787' },
        },
        // q_initial — fresh-quench overlap, decorrelates
        {
            type: 'scatter', mode: 'lines+markers',
            name: 'q_initial = ⟨s(t)·s(0)⟩',
            x: dts, y: qInit,
            yaxis: 'y',
            line: { color: '#79c0ff', width: 1.5, dash: 'dash' },
            marker: { size: 3, color: '#79c0ff' },
            opacity: 0.85,
        },
        // magnetization — ~0 throughout in spin-glass phase
        {
            type: 'scatter', mode: 'lines',
            name: 'magnetization ⟨s⟩',
            x: dts, y: mag,
            yaxis: 'y',
            line: { color: '#d2a8ff', width: 1, dash: 'dot' },
            opacity: 0.7,
        },
        // energy/N — second y-axis; descent = aging
        {
            type: 'scatter', mode: 'lines+markers',
            name: 'energy/N',
            x: dts, y: energy,
            yaxis: 'y2',
            line: { color: '#ffa657', width: 1.5 },
            marker: { size: 3, color: '#ffa657' },
        },
    ];

    const layout = {
        ...substratePanelEl.layout,
        yaxis: {
            color: '#7ee787', gridcolor: '#30363d',
            title: { text: 'overlap', font: { color: '#7ee787' } },
            range: [-0.2, 1.05],
        },
        yaxis2: {
            color: '#ffa657', gridcolor: 'rgba(0,0,0,0)',
            overlaying: 'y', side: 'right',
            title: { text: 'energy/N', font: { color: '#ffa657' } },
        },
    };
    Plotly.react(substratePanelEl, traces, layout, { responsive: true });
}

// ── 3D ribbon — empirical trajectory + envelope per window, stacked on Z ──

function redraw3D() {
    if (!runState) {
        Plotly.react(ribbon3DEl, [], ribbon3DEl.layout);
        return;
    }
    const samples = averagedSamples();
    if (samples.length === 0) {
        Plotly.react(ribbon3DEl, [], ribbon3DEl.layout);
        return;
    }
    const showEmpirical = toggleEmpirical.checked;
    const showEnvelope = toggleEnvelope.checked;
    const colorByRegime = toggleRegimeColor.checked;
    const traces = [];

    runState.tau_windows.forEach((tau, k) => {
        const xs = [], ys = [], zs = [], colors = [];
        for (const s of samples) {
            const w = s.per_window[k];
            if (!w) continue;
            xs.push(w.denom);
            ys.push(w.chi_d);
            zs.push(w.Z);
            colors.push(REGIME_COLOR[w.regime] || REGIME_COLOR.unstable);
        }
        if (xs.length === 0) return;

        // Empirical trajectory line per window
        if (showEmpirical) {
            traces.push({
                type: 'scatter3d', mode: 'lines+markers',
                name: `τ=${tau} (empirical)`,
                x: xs, y: ys, z: zs,
                line: {
                    color: colorByRegime ? colors[colors.length - 1] : WINDOW_PALETTE[k % WINDOW_PALETTE.length],
                    width: 3,
                },
                marker: {
                    size: 3,
                    color: colorByRegime ? colors : WINDOW_PALETTE[k % WINDOW_PALETTE.length],
                    opacity: 0.9,
                },
                hoverinfo: 'skip',
                showlegend: false,
            });
        }

        // Envelope curve per window — use the latest non-empty envelope
        if (showEnvelope) {
            for (let i = samples.length - 1; i >= 0; i--) {
                const w = samples[i].per_window[k];
                if (!w || !w.envelope || w.envelope.length === 0) continue;
                const z = w.Z;
                traces.push({
                    type: 'scatter3d', mode: 'lines',
                    x: w.envelope.map(p => p[0]),
                    y: w.envelope.map(p => p[1]),
                    z: w.envelope.map(() => z),
                    line: {
                        color: REGIME_COLOR[w.regime] || '#7d8590',
                        width: 2,
                        dash: 'dot',
                    },
                    opacity: 0.5,
                    hoverinfo: 'skip',
                    showlegend: false,
                });
                break;
            }
        }
    });

    Plotly.react(ribbon3DEl, traces, ribbon3DEl.layout, { responsive: true });
}

// ── SSE wiring ────────────────────────────────────────────────────────────

function buildStreamUrl() {
    const L = parseInt(LInput.value, 10) || 8;
    const T = parseFloat(TInput.value) || 0.66;
    const tw = parseInt(twInput.value, 10) || 100;
    const tobs = parseInt(tobsInput.value, 10) || 1000;
    const tau = encodeURIComponent(tauInput.value || '10,100,1000,10000');
    const nreal = parseInt(nrealInput.value, 10) || 1;
    return `/stream?tab=glass&L=${L}&T=${T}&t_w=${tw}&t_obs=${tobs}&tau_windows=${tau}&n_real=${nreal}`;
}

function connect() {
    if (evtSource) { evtSource.close(); evtSource = null; }
    statusDot.classList.remove('connected', 'error');
    statusDot.classList.add('connecting');
    statusText.textContent = 'connecting…';

    evtSource = new EventSource(buildStreamUrl());
    evtSource.onopen = () => {
        statusDot.classList.remove('connecting', 'error');
        statusDot.classList.add('connected');
        statusText.textContent = 'connected';
    };
    evtSource.onerror = () => {
        statusDot.classList.remove('connected', 'connecting');
        statusDot.classList.add('error');
        statusText.textContent = 'disconnected';
    };
    evtSource.onmessage = (msg) => {
        if (!msg.data) return;
        let event;
        try { event = JSON.parse(msg.data); } catch { return; }
        switch (event.type) {
            case 'init':        return onInit(event);
            case 'phase_a':     return onPhaseA(event);
            case 'snapshot':    return onSnapshot(event);
            case 'phase_b':     return onPhaseB(event);
            case 'sample':      return onSample(event);
            case 'complete':    return onComplete(event);
            case 'error':       return onError(event);
            case 'shutdown':    evtSource.close(); evtSource = null; return;
            default:            logEvent(`${event.type}`); return;
        }
    };
}

restartBtn.addEventListener('click', () => {
    fetch('/restart', { method: 'GET' }).finally(() => connect());
});

// Toggles trigger immediate redraws (no SSE round trip)
[toggleEmpirical, toggleEnvelope, toggleFDT, toggleRegimeColor, toggleErrorView].forEach(el => {
    el.addEventListener('change', () => { redraw2D(); redraw3D(); });
});
windowSelect.addEventListener('change', () => {
    selectedWindowIndex = Number(windowSelect.value);
    redraw2D();
});

// ── Boot ──────────────────────────────────────────────────────────────────

init3DRibbon();
init2DFalsification();
initSubstratePanel();
initRegimeTimeline();
initLambdaPanel();
initTrailPanel();
connect();
