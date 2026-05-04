// quantum/tab.js — surface-code syndrome tab.
//
// Mirrors glass/tab.js in panel layout but reads the quantum event shape
// (contract: docs/quantum_tab_event_protocol.md). Substrate-conditional
// reading from FOOTING F-018: on syndrome streams the v8 §5 hierarchy
// walks the τ-axis in inverted direction from the prose. Narrow τ → r_like
// (kernel below event scale, sees iid Bernoulli noise); broad τ → c_like
// (memory dominates). The classifier reads f = ΔC_d / C_d_diag and is
// direction-agnostic; the inversion is the data, not a relabel.
//
// All MPA math (regime classifier, locus geometry) lives in
// mpc_quantum_packs.measurements; this file is presentation only.
'use strict';

// ── Regime palette (5 categories: c_like / s_like / r_like / k_like / noise_floor) ──
const REGIME_COLOR = {
    c_like:      '#79c0ff',   // broad τ, memory dominates
    s_like:      '#7ee787',   // aging in progress
    r_like:      '#ff7b72',   // narrow τ, iid noise
    k_like:      '#d2a8ff',   // sustained χ_d < 0 — k_frust signature
    noise_floor: '#5d6470',   // C_d_diag too small
};

const REGIME_LABEL = {
    c_like:      'c_like · memory dominates',
    s_like:      's_like · aging',
    r_like:      'r_like · iid (kernel below τ_event)',
    k_like:      'k_like · k_frust',
    noise_floor: 'noise floor',
};

// Window palette (when regime-colouring is OFF, we colour by window index).
const WINDOW_PALETTE = ['#ff7b72', '#ffa657', '#7ee787', '#56d4dd', '#79c0ff', '#d2a8ff'];

// ── DOM refs ──────────────────────────────────────────────────────────────

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const roundCounterEl = document.getElementById('round-counter');
const ribbon3DEl = document.getElementById('ribbon-3d');
const locus2DEl = document.getElementById('locus-2d');
const runConfigEl = document.getElementById('run-config');
const statusMessageEl = document.getElementById('status-message');
const eventListEl = document.getElementById('event-list');
const restartBtn = document.getElementById('restart-btn');

const distanceInput = document.getElementById('distance-input');
const pbaseInput = document.getElementById('pbase-input');
const deltapInput = document.getElementById('deltap-input');
const nshotsInput = document.getElementById('nshots-input');
const twInput = document.getElementById('tw-input');
const tobsInput = document.getElementById('tobs-input');
const tauInput = document.getElementById('tau-input');
const seedInput = document.getElementById('seed-input');

const toggleEmpirical = document.getElementById('toggle-empirical');
const toggleRegimeColor = document.getElementById('toggle-regime-color');
const toggleFDT = document.getElementById('toggle-fdt');
const windowSelect = document.getElementById('window-select');

const substratePanelEl = document.getElementById('substrate-panel');
const regimeTimelineEl = document.getElementById('regime-timeline');
const fPanelEl = document.getElementById('f-panel');
const trailPanelEl = document.getElementById('trail-panel');

let evtSource = null;
let runState = null;   // { distance, p_base, delta_p, t_w, t_obs, tau_windows, samples: [] }
let selectedWindowIndex = 0;

// ── Plotly inits ──────────────────────────────────────────────────────────

function init3DRibbon() {
    const layout = {
        paper_bgcolor: '#0d1117',
        plot_bgcolor: '#0d1117',
        font: { color: '#e6edf3', size: 10 },
        margin: { l: 0, r: 0, t: 8, b: 0 },
        scene: {
            xaxis: { title: 'ΔC_d', color: '#7d8590', gridcolor: '#30363d',
                     backgroundcolor: '#0d1117', showbackground: true },
            yaxis: { title: 'χ_d', color: '#7d8590', gridcolor: '#30363d',
                     backgroundcolor: '#0d1117', showbackground: true },
            zaxis: { title: 'log₁₀(τ/dt)', color: '#7d8590', gridcolor: '#30363d',
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

function initFPanel() {
    const layout = {
        paper_bgcolor: '#0d1117',
        plot_bgcolor: '#0d1117',
        font: { color: '#e6edf3', size: 10 },
        margin: { l: 56, r: 12, t: 10, b: 38 },
        xaxis: { title: 'dt = t − t_w', color: '#7d8590', gridcolor: '#30363d', type: 'log' },
        yaxis: {
            title: 'f = ΔC_d / C_d_diag',
            color: '#7d8590', gridcolor: '#30363d',
            range: [0, 1.05],
        },
        // Threshold lines drawn as scatter traces inside the data (so they
        // pick up the autorange). Placement of horizontal references here
        // would require the scatter approach below; layout is left thin.
        showlegend: true,
        legend: { x: 0.02, y: 0.02, font: { size: 9 }, bgcolor: 'rgba(13,17,23,0.7)', yanchor: 'bottom' },
    };
    Plotly.newPlot(fPanelEl, [], layout, { displayModeBar: false, responsive: true });
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
            title: { text: 'σ_d', font: { color: '#ffa657' } },
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
        margin: { l: 50, r: 50, t: 18, b: 28 },
        xaxis: { title: 'dt', color: '#7d8590', gridcolor: '#30363d', type: 'log' },
        yaxis: {
            title: { text: 'detection rate', font: { color: '#7ee787' } },
            color: '#7ee787', gridcolor: '#30363d',
        },
        yaxis2: {
            title: { text: 'drift', font: { color: '#ffa657' } },
            color: '#ffa657', gridcolor: 'rgba(0,0,0,0)',
            overlaying: 'y', side: 'right',
        },
        showlegend: true,
        legend: { x: 0.02, y: 0.98, font: { size: 9 }, bgcolor: 'rgba(13,17,23,0.7)' },
    };
    Plotly.newPlot(substratePanelEl, [], layout, { displayModeBar: false, responsive: true });
}

function init2DLocus() {
    const layout = {
        paper_bgcolor: '#0d1117',
        plot_bgcolor: '#0d1117',
        font: { color: '#e6edf3', size: 11 },
        margin: { l: 56, r: 12, t: 14, b: 44 },
        xaxis: { title: 'ΔC_d = C_d_diag − C_d', color: '#7d8590', gridcolor: '#30363d',
                 zerolinecolor: '#30363d' },
        yaxis: { title: 'χ_d', color: '#7d8590', gridcolor: '#30363d',
                 zerolinecolor: '#30363d' },
        showlegend: true,
        legend: { x: 0.02, y: 0.98, font: { size: 10 },
                  bgcolor: 'rgba(13,17,23,0.7)' },
    };
    Plotly.newPlot(locus2DEl, [], layout, { displayModeBar: false, responsive: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────

function logEvent(text, cls) {
    const li = document.createElement('li');
    if (cls) li.classList.add(cls);
    li.textContent = text;
    eventListEl.prepend(li);
    while (eventListEl.children.length > 80) eventListEl.lastChild.remove();
}

function populateWindowSelect() {
    if (!runState) return;
    const cur = windowSelect.value;
    windowSelect.innerHTML = '';
    runState.tau_windows.forEach((tau, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `τ = ${tau}`;
        windowSelect.appendChild(opt);
    });
    const n = runState.tau_windows.length;
    if (cur && Number(cur) < n) {
        windowSelect.value = cur;
    } else {
        const mid = Math.floor((n - 1) / 2);
        windowSelect.value = String(mid);
    }
    selectedWindowIndex = Number(windowSelect.value);
}

function sortedSamples() {
    if (!runState) return [];
    return runState.samples.slice().sort((a, b) => a.t - b.t);
}

// ── Event handlers ────────────────────────────────────────────────────────

function onInit(event) {
    runState = {
        distance: event.distance,
        p_base: event.p_base,
        p_pert: event.p_pert,
        delta_p: event.delta_p,
        n_shots: event.n_shots,
        t_w: event.t_w,
        t_obs: event.t_obs,
        tau_windows: event.tau_windows,
        seed: event.seed,
        sample_times: event.sample_times,
        n_stabilisers: event.n_stabilisers,
        samples: [],
    };
    runConfigEl.textContent = JSON.stringify({
        distance: event.distance,
        p_base: event.p_base, p_pert: event.p_pert, delta_p: event.delta_p,
        n_shots: event.n_shots,
        t_w: event.t_w, t_obs: event.t_obs,
        tau_windows: event.tau_windows,
        seed: event.seed,
        n_stabilisers: event.n_stabilisers,
        n_samples_planned: event.n_samples_planned,
    }, null, 2);
    statusMessageEl.classList.remove('warn', 'error');
    statusMessageEl.textContent =
        `init · d=${event.distance} p=${event.p_base.toExponential(1)}+${event.delta_p.toExponential(1)} `
        + `n_shots=${event.n_shots} t_w=${event.t_w} t_obs=${event.t_obs} `
        + `windows=[${event.tau_windows.join(', ')}]`;
    roundCounterEl.textContent = `round 0 / ${event.t_w + event.t_obs}`;
    logEvent(`init · ${event.n_samples_planned} samples planned · ${event.n_stabilisers} stabilisers`, 'notable');

    populateWindowSelect();
    Plotly.react(ribbon3DEl, [], ribbon3DEl.layout);
    Plotly.react(locus2DEl, [], locus2DEl.layout);
    Plotly.react(regimeTimelineEl, [], regimeTimelineEl.layout);
    Plotly.react(fPanelEl, [], fPanelEl.layout);
    Plotly.react(trailPanelEl, [], trailPanelEl.layout);
    Plotly.react(substratePanelEl, [], substratePanelEl.layout);
}

function onPhaseA(event) {
    if (!runState) return;
    roundCounterEl.textContent = `round ${event.t} / ${runState.t_w + runState.t_obs} (phase A)`;
    statusMessageEl.textContent =
        `phase A · kernel warmup to t_w=${event.t_w} · t=${event.t} · `
        + `detection rate=${event.detection_rate.toFixed(4)}`;
}

function onSnapshot(event) {
    statusMessageEl.textContent =
        `phase B · paired observation begins (t_w=${event.t_w}` +
        (event.detection_rate_at_tw != null ? `, dr_at_tw=${event.detection_rate_at_tw.toFixed(4)}` : '') +
        `)`;
    logEvent(`snapshot at t_w=${event.t_w}`, 'notable');
}

function onPhaseB(event) {
    if (!runState) return;
    roundCounterEl.textContent =
        `round ${event.t} / ${runState.t_w + runState.t_obs} `
        + `(phase B · ${(event.frac_done * 100).toFixed(0)}%)`;
}

function onSample(event) {
    if (!runState) return;
    runState.samples.push(event);
    const labels = event.per_window
        .map(w => `τ=${w.tau_window}:${(w.regime_v8 || '?').replace('_like','')}` +
                  (w.frac_decorr != null && Number.isFinite(w.frac_decorr)
                      ? `(f=${w.frac_decorr.toFixed(2)})` : ''))
        .join(' ');
    logEvent(`sample dt=${event.dt} · ${labels}`);
    redrawAll();
}

function onComplete(event) {
    statusMessageEl.classList.remove('warn', 'error');
    const n = runState ? runState.samples.length : 0;
    statusMessageEl.textContent = `complete · ${n} samples · ${event.n_samples_emitted ?? n} emitted`;
    logEvent(`run complete`, 'notable');
}

function onError(event) {
    statusMessageEl.classList.remove('warn');
    statusMessageEl.classList.add('error');
    statusMessageEl.textContent = event.msg.split('\n')[0];
    logEvent(`error · ${event.msg.split('\n')[0]}`, 'error');
}

// ── Redraw orchestration ──────────────────────────────────────────────────

function redrawAll() {
    redrawSubstrate();
    redrawRegimeTimeline();
    redrawFPanel();
    redrawTrail();
    redraw2DLocus();
    redraw3D();
    updateCalibrationDisplay();
}

// ── Substrate panel ──────────────────────────────────────────────────────
//
// Detection rates at p_base / p_pert and drift. On syndromes the analog of
// glass's q_initial / energy / magnetization. drift = base − base_at_t_w;
// near 0 in steady state.
function redrawSubstrate() {
    if (!runState || !substratePanelEl) return;
    const samples = sortedSamples().filter(s => s.substrate);
    if (samples.length === 0) {
        Plotly.react(substratePanelEl, [], substratePanelEl.layout);
        return;
    }
    const dts = samples.map(s => Math.max(s.dt, 1));
    const drBase = samples.map(s => s.substrate.detection_rate_base);
    const drPert = samples.map(s => s.substrate.detection_rate_pert);
    const drift = samples.map(s => s.substrate.detection_rate_drift);

    const traces = [
        {
            type: 'scatter', mode: 'lines+markers',
            name: 'detection rate · base',
            x: dts, y: drBase, yaxis: 'y',
            line: { color: '#7ee787', width: 2 },
            marker: { size: 5, color: '#7ee787' },
        },
        {
            type: 'scatter', mode: 'lines+markers',
            name: 'detection rate · pert',
            x: dts, y: drPert, yaxis: 'y',
            line: { color: '#79c0ff', width: 1.5, dash: 'dash' },
            marker: { size: 4, color: '#79c0ff' },
            opacity: 0.85,
        },
        {
            type: 'scatter', mode: 'lines',
            name: 'drift = base − base_at_t_w',
            x: dts, y: drift, yaxis: 'y2',
            line: { color: '#ffa657', width: 1.2, dash: 'dot' },
            opacity: 0.85,
        },
    ];

    Plotly.react(substratePanelEl, traces, substratePanelEl.layout, { responsive: true });
}

// ── Regime timeline (primary) ────────────────────────────────────────────
//
// Each row is τ; each marker is one sample at dt; colour = regime_v8.
// The substrate-conditional reading is part of the panel's prose, not
// imposed on the data — we just colour what the classifier yields.
function redrawRegimeTimeline() {
    if (!runState || !regimeTimelineEl) return;
    const samples = sortedSamples();
    if (samples.length === 0) {
        Plotly.react(regimeTimelineEl, [], regimeTimelineEl.layout);
        return;
    }
    const traces = [];
    const rowLabels = runState.tau_windows.map(t => `τ=${t}`);

    runState.tau_windows.forEach((tau, k) => {
        const xs = [], ys = [], colors = [], texts = [];
        for (const s of samples) {
            const w = s.per_window[k];
            if (!w) continue;
            xs.push(Math.max(s.dt, 1));
            ys.push(rowLabels[k]);
            colors.push(REGIME_COLOR[w.regime_v8] || REGIME_COLOR.noise_floor);
            const fStr = (w.frac_decorr != null && Number.isFinite(w.frac_decorr))
                ? w.frac_decorr.toFixed(3) : 'n/a';
            texts.push(`τ=${tau}  dt=${s.dt}<br>regime=${w.regime_v8}  f=${fStr}<br>χ_d=${w.chi_d.toFixed(2)}  ‖d‖=${w.d_norm.toFixed(3)}`);
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

// ── f(t) per window (primary) ────────────────────────────────────────────
//
// f = ΔC_d / C_d_diag is the dimensionless invariant the classifier reads.
// Visual: one trace per window; horizontal threshold lines at 0.20 / 0.70.
function redrawFPanel() {
    if (!runState || !fPanelEl) return;
    const samples = sortedSamples();
    if (samples.length === 0) {
        Plotly.react(fPanelEl, [], fPanelEl.layout);
        return;
    }
    const traces = [];
    runState.tau_windows.forEach((tau, k) => {
        const xs = [], ys = [], texts = [];
        for (const s of samples) {
            const w = s.per_window[k];
            if (!w || !Number.isFinite(w.frac_decorr)) continue;
            xs.push(Math.max(s.dt, 1));
            ys.push(w.frac_decorr);
            texts.push(`τ=${tau}  dt=${s.dt}<br>f=${w.frac_decorr.toFixed(3)}  regime=${w.regime_v8}`);
        }
        if (xs.length === 0) return;
        traces.push({
            type: 'scatter', mode: 'lines+markers',
            name: `τ=${tau}`,
            x: xs, y: ys, text: texts,
            line: { color: WINDOW_PALETTE[k % WINDOW_PALETTE.length], width: 2 },
            marker: { size: 5, color: WINDOW_PALETTE[k % WINDOW_PALETTE.length] },
            hovertemplate: '%{text}<extra></extra>',
        });
    });

    // Horizontal threshold lines as faint scatter traces
    if (samples.length >= 2) {
        const dts = samples.map(s => Math.max(s.dt, 1));
        const xLo = Math.min(...dts), xHi = Math.max(...dts);
        traces.push({
            type: 'scatter', mode: 'lines', name: 'f = 0.20 (c|s)',
            x: [xLo, xHi], y: [0.20, 0.20],
            line: { color: '#79c0ff', width: 1, dash: 'dot' }, opacity: 0.6,
            hoverinfo: 'skip', showlegend: true,
        });
        traces.push({
            type: 'scatter', mode: 'lines', name: 'f = 0.70 (s|r)',
            x: [xLo, xHi], y: [0.70, 0.70],
            line: { color: '#ff7b72', width: 1, dash: 'dot' }, opacity: 0.6,
            hoverinfo: 'skip', showlegend: true,
        });
    }

    Plotly.react(fPanelEl, traces, fPanelEl.layout, { responsive: true });
}

// ── Trail dynamics: ‖d‖(t) on log-log + σ_d(t) on second axis ────────────
function redrawTrail() {
    if (!runState || !trailPanelEl) return;
    const samples = sortedSamples();
    if (samples.length === 0) {
        Plotly.react(trailPanelEl, [], trailPanelEl.layout);
        return;
    }
    const traces = [];
    runState.tau_windows.forEach((tau, k) => {
        const xs = [], ys_d = [], ys_s = [];
        for (const s of samples) {
            const w = s.per_window[k];
            if (!w) continue;
            const dt = Math.max(s.dt, 1);
            if (Number.isFinite(w.d_norm) && w.d_norm > 0) {
                xs.push(dt);
                ys_d.push(w.d_norm);
                ys_s.push(Number.isFinite(w.sigma_d) ? w.sigma_d : null);
            }
        }
        const color = WINDOW_PALETTE[k % WINDOW_PALETTE.length];
        if (xs.length > 0) {
            traces.push({
                type: 'scatter', mode: 'lines',
                name: `‖d‖ τ=${tau}`,
                x: xs, y: ys_d,
                yaxis: 'y',
                line: { color, width: 2 },
            });
            traces.push({
                type: 'scatter', mode: 'lines',
                name: `σ_d τ=${tau}`,
                x: xs, y: ys_s,
                yaxis: 'y2',
                line: { color, width: 1, dash: 'dot' },
                opacity: 0.7,
            });
        }
    });
    Plotly.react(trailPanelEl, traces, trailPanelEl.layout, { responsive: true });
}

// ── Calibration display ──────────────────────────────────────────────────
//
// On syndromes the q_EA-equivalent is the late-time saturation of
// C_d_diag per window — the trail-vector self-overlap. There's no separate
// raw-detection q_EA; detection events are bounded but their two-time
// correlation isn't a memory parameter, so calibration is window-local.
function calibrateCdDiagPerWindow(samples) {
    if (!runState || !samples || samples.length < 6) return null;
    const sorted = samples.slice().sort((a, b) => a.dt - b.dt);
    const half = sorted.slice(Math.floor(sorted.length / 2));
    return runState.tau_windows.map((tau, k) => {
        let CdSum = 0, CddSum = 0, fSum = 0, n = 0, fN = 0;
        for (const s of half) {
            const w = s.per_window[k];
            if (!w) continue;
            if (Number.isFinite(w.C_d) && Number.isFinite(w.C_d_diag)) {
                CdSum += w.C_d; CddSum += w.C_d_diag; n++;
            }
            if (Number.isFinite(w.frac_decorr)) {
                fSum += w.frac_decorr; fN++;
            }
        }
        if (n === 0) return null;
        const Cd_late = CdSum / n;
        const Cdd_late = CddSum / n;
        const f_late = fN > 0 ? fSum / fN : null;
        return {
            tau_window: tau,
            Cd_late,
            Cdd_late,
            breakpointDc: Math.max(Cdd_late - Cd_late, 0),
            qEA_d: Cdd_late > 1e-12 ? Cd_late / Cdd_late : null,
            f_late,
            n_used: n,
        };
    });
}

function updateCalibrationDisplay() {
    const el = document.getElementById('calibration-display');
    if (!el || !runState) return;
    const samples = sortedSamples();
    const calib = calibrateCdDiagPerWindow(samples);
    if (!calib || calib.every(c => c == null)) {
        el.innerHTML = '<span class="dim-text">MPA self-calibration: awaiting late-t samples…</span>';
        return;
    }
    let html = '<strong>MPA self-calibration · per-window</strong> ' +
               '<span class="dim-text">(C_d_diag late-t saturation = q_EA,d analog; f late-t locks regime)</span><br>';
    for (let k = 0; k < calib.length; k++) {
        const c = calib[k];
        if (!c) continue;
        const fStr = (c.f_late != null && Number.isFinite(c.f_late))
            ? c.f_late.toFixed(3) : 'n/a';
        const qStr = (c.qEA_d != null && Number.isFinite(c.qEA_d))
            ? c.qEA_d.toFixed(3) : 'n/a';
        // Substrate-conditional regime hint from f
        let regimeHint = '';
        if (c.f_late != null && Number.isFinite(c.f_late)) {
            if (c.f_late < 0.20) regimeHint = '<span style="color:#79c0ff">c_like</span>';
            else if (c.f_late < 0.70) regimeHint = '<span style="color:#7ee787">s_like</span>';
            else regimeHint = '<span style="color:#ff7b72">r_like</span>';
        }
        html += `&nbsp;&nbsp;τ=${c.tau_window}: ` +
                `<span class="cal-val">q_EA,d ≈ ${qStr}</span>, ` +
                `<span class="cal-val">f ≈ ${fStr}</span> ` +
                regimeHint + ` ` +
                `<span class="dim-text">(n=${c.n_used})</span><br>`;
    }
    // F-018 hierarchy direction check across windows
    const fs = calib.filter(c => c && c.f_late != null && Number.isFinite(c.f_late))
                    .map(c => ({ tau: c.tau_window, f: c.f_late }));
    if (fs.length >= 2) {
        // Expect inverted direction: narrow τ → high f, broad τ → low f
        const dirSign = Math.sign(fs[fs.length - 1].f - fs[0].f);
        let tag;
        if (dirSign < 0) {
            tag = '<span style="color:#7ee787">✓ inverted hierarchy direction (F-018)</span>';
        } else if (dirSign > 0) {
            tag = '<span style="color:#ffa657">⚠ prose-direction (narrow → c, broad → r)</span>';
        } else {
            tag = '<span class="dim-text">flat across windows</span>';
        }
        const fSpread = (Math.max(...fs.map(x => x.f)) - Math.min(...fs.map(x => x.f))).toFixed(3);
        html += `<br>&nbsp;&nbsp;<span class="dim-text">f spread across windows = ${fSpread} · ${tag}</span>`;
    }
    el.innerHTML = html;
}

// ── 2D locus view: empirical trajectory in (ΔC_d, χ_d) for one window ───
function redraw2DLocus() {
    if (!runState) {
        Plotly.react(locus2DEl, [], locus2DEl.layout);
        return;
    }
    const samples = sortedSamples();
    if (samples.length === 0) {
        Plotly.react(locus2DEl, [], locus2DEl.layout);
        return;
    }
    const k = selectedWindowIndex;
    if (k >= runState.tau_windows.length) return;
    const tau = runState.tau_windows[k];

    // Collect points
    const xs = [], ys = [], colors = [], texts = [], dCMax = [], chiMax = [];
    for (const s of samples) {
        const w = s.per_window[k];
        if (!w) continue;
        xs.push(w.delta_C_d ?? Math.max(w.C_d_diag - w.C_d, 0));
        ys.push(w.chi_d);
        colors.push(REGIME_COLOR[w.regime_v8] || REGIME_COLOR.noise_floor);
        const fStr = (w.frac_decorr != null && Number.isFinite(w.frac_decorr))
            ? w.frac_decorr.toFixed(3) : 'n/a';
        texts.push(`dt=${s.dt}<br>regime=${w.regime_v8}  f=${fStr}<br>χ_d=${w.chi_d.toFixed(2)}`);
        dCMax.push(xs[xs.length - 1]); chiMax.push(ys[ys.length - 1]);
    }

    const denomMax = xs.length > 0 ? Math.max(0.01, Math.max(...xs) * 1.2) : 0.05;
    const chiAbsMax = xs.length > 0 ? Math.max(0.5, Math.max(...ys.map(v => Math.abs(v))) * 1.2) : 1.0;

    const traces = [];

    // FDT axis (note on syndromes T isn't a substrate temperature; this is
    // a slope=1 reference, not a thermodynamic FDT line).
    if (toggleFDT.checked && denomMax > 0) {
        traces.push({
            type: 'scatter', mode: 'lines',
            name: 'slope = 1',
            x: [0, denomMax],
            y: [0, denomMax],
            line: { color: '#7d8590', width: 1, dash: 'dash' },
            opacity: 0.6,
            hoverinfo: 'skip',
        });
    }

    // Empirical trajectory line + regime-coloured markers
    if (toggleEmpirical.checked && xs.length > 0) {
        traces.push({
            type: 'scatter', mode: 'lines',
            name: `empirical · τ=${tau}`,
            x: xs, y: ys,
            line: { color: '#e6edf3', width: 2 },
            opacity: 0.85,
            hoverinfo: 'skip',
            showlegend: true,
        });
        traces.push({
            type: 'scatter', mode: 'markers',
            name: 'sample (regime)',
            x: xs, y: ys, text: texts,
            marker: {
                size: 7,
                color: toggleRegimeColor.checked ? colors : '#e6edf3',
                line: { color: '#0d1117', width: 1 },
            },
            hovertemplate: '%{text}<br>ΔC_d=%{x:.3f}  χ_d=%{y:.3f}<extra></extra>',
            showlegend: false,
        });
    }

    const layout = {
        ...locus2DEl.layout,
        xaxis: { ...locus2DEl.layout.xaxis, range: [0, denomMax] },
        yaxis: { ...locus2DEl.layout.yaxis, range: [-chiAbsMax * 0.2, chiAbsMax] },
        title: {
            text: `τ = ${tau}  ·  ${xs.length} samples`,
            font: { color: '#e6edf3', size: 12 },
            x: 0.02, y: 0.98, xanchor: 'left', yanchor: 'top',
        },
    };
    Plotly.react(locus2DEl, traces, layout, { responsive: true });
}

// ── 3D ribbon: per-window trajectory stacked on Z = log10(τ/dt) ──────────
function redraw3D() {
    if (!runState) {
        Plotly.react(ribbon3DEl, [], ribbon3DEl.layout);
        return;
    }
    const samples = sortedSamples();
    if (samples.length === 0) {
        Plotly.react(ribbon3DEl, [], ribbon3DEl.layout);
        return;
    }
    const colorByRegime = toggleRegimeColor.checked;
    const traces = [];

    runState.tau_windows.forEach((tau, k) => {
        const xs = [], ys = [], zs = [], colors = [];
        for (const s of samples) {
            const w = s.per_window[k];
            if (!w) continue;
            const dC = w.delta_C_d ?? Math.max(w.C_d_diag - w.C_d, 0);
            xs.push(dC);
            ys.push(w.chi_d);
            zs.push(Math.log10(Math.max(tau, 1) / Math.max(s.dt, 1)));
            colors.push(REGIME_COLOR[w.regime_v8] || REGIME_COLOR.noise_floor);
        }
        if (xs.length === 0) return;
        traces.push({
            type: 'scatter3d', mode: 'lines+markers',
            name: `τ=${tau}`,
            x: xs, y: ys, z: zs,
            line: {
                color: colorByRegime
                    ? (colors[colors.length - 1] || WINDOW_PALETTE[k % WINDOW_PALETTE.length])
                    : WINDOW_PALETTE[k % WINDOW_PALETTE.length],
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
    });

    Plotly.react(ribbon3DEl, traces, ribbon3DEl.layout, { responsive: true });
}

// ── SSE wiring ────────────────────────────────────────────────────────────

function buildStreamUrl() {
    const distance = parseInt(distanceInput.value, 10) || 3;
    const p_base = parseFloat(pbaseInput.value) || 1e-3;
    const delta_p = parseFloat(deltapInput.value) || 1e-3;
    const n_shots = parseInt(nshotsInput.value, 10) || 256;
    const tw = parseInt(twInput.value, 10) || 200;
    const tobs = parseInt(tobsInput.value, 10) || 1800;
    const tau = encodeURIComponent(tauInput.value || '3,10,30,100,300,1000');
    const seed = parseInt(seedInput.value, 10) || 1;
    return `/stream?tab=quantum&distance=${distance}&p_base=${p_base}&delta_p=${delta_p}` +
           `&n_shots=${n_shots}&t_w=${tw}&t_obs=${tobs}&tau_windows=${tau}&seed=${seed}`;
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

[toggleEmpirical, toggleRegimeColor, toggleFDT].forEach(el => {
    el.addEventListener('change', () => { redraw2DLocus(); redraw3D(); });
});
windowSelect.addEventListener('change', () => {
    selectedWindowIndex = Number(windowSelect.value);
    redraw2DLocus();
});

// ── Boot ──────────────────────────────────────────────────────────────────

init3DRibbon();
init2DLocus();
initSubstratePanel();
initRegimeTimeline();
initFPanel();
initTrailPanel();
connect();
