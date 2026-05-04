// cross/tab.js — cross-substrate F-018 verification tab.
//
// Driver runs glass first, then quantum, sequentially. Every event carries
// a `substrate` tag; we route by that. The two timelines are independent
// renderers fed from per-substrate sample arrays. The fingerprint plot
// reads each substrate's *latest* sample's per_window and computes
// f = (C_d_diag - C_d) / C_d_diag — direction-agnostic, no substrate-
// specific classifier in this view.
//
// Per visualizer rule (mpa-central RULES rule 4: substrate produces,
// visualizer consumes): all classifier work happens in each substrate's
// `enrich_sample`. The per-display `f` synthesis here is in the same
// category as glass-tab λ_A and per-window self-calibration — a thin
// presentation-only computation from raw substrate fields.
'use strict';

// Shared v8 §5 colour palette. Regime labels are normalised across substrates
// (glass yields {c, s, r, k, unstable}; quantum yields {c_like, s_like,
// r_like, k_like, noise_floor}).
const REGIME_COLOR = {
    c:     '#79c0ff',
    s:     '#7ee787',
    r:     '#ff7b72',
    k:     '#d2a8ff',
    noise: '#5d6470',
};

function normRegime(raw) {
    if (!raw) return 'noise';
    if (raw === 'unstable' || raw === 'noise_floor') return 'noise';
    if (raw.endsWith('_like')) return raw.slice(0, -5);  // c_like → c
    return raw;
}

// Each substrate's enrichment uses different per-window field names. Only
// the regime label varies; raw fields (C_d, C_d_diag, chi_d) are the same.
function regimeOf(w, substrate) {
    return normRegime(substrate === 'quantum' ? w.regime_v8 : w.regime);
}

// f = ΔC_d / C_d_diag, identical formula across substrates. No T factor.
function fOf(w) {
    const denom = w.C_d_diag;
    if (!Number.isFinite(denom) || denom <= 0) return null;
    const num = denom - w.C_d;
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.min(1.5, num / denom));  // clamp display-side
}

// ── DOM refs ──────────────────────────────────────────────────────────────

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const substrateProgressEl = document.getElementById('substrate-progress');
const runConfigEl = document.getElementById('run-config');
const statusMessageEl = document.getElementById('status-message');
const eventListEl = document.getElementById('event-list');
const restartBtn = document.getElementById('restart-btn');
const verdictEl = document.getElementById('verdict');

const glassTimelineEl = document.getElementById('glass-timeline');
const quantumTimelineEl = document.getElementById('quantum-timeline');
const fingerprintEl = document.getElementById('fingerprint');

// glass controls
const gL    = document.getElementById('g-L-input');
const gT    = document.getElementById('g-T-input');
const gTw   = document.getElementById('g-tw-input');
const gTobs = document.getElementById('g-tobs-input');
const gTau  = document.getElementById('g-tau-input');
const gSeed = document.getElementById('g-seed-input');
// quantum controls
const qDist  = document.getElementById('q-distance-input');
const qPbase = document.getElementById('q-pbase-input');
const qDp    = document.getElementById('q-deltap-input');
const qNs    = document.getElementById('q-nshots-input');
const qTw    = document.getElementById('q-tw-input');
const qTobs  = document.getElementById('q-tobs-input');
const qTau   = document.getElementById('q-tau-input');
const qSeed  = document.getElementById('q-seed-input');

// ── Per-substrate state ───────────────────────────────────────────────────

function emptySubstrateState() {
    return {
        config: null,         // from substrate_start
        init: null,           // first 'init' event for this substrate
        samples: [],          // sample events (already enriched by driver)
        lastSample: null,     // most recent
        completed: false,
    };
}

const state = {
    glass:   emptySubstrateState(),
    quantum: emptySubstrateState(),
};

let evtSource = null;
let runStarted = false;

// ── Plotly inits ──────────────────────────────────────────────────────────

function timelineLayout() {
    return {
        paper_bgcolor: '#0d1117',
        plot_bgcolor: '#0d1117',
        font: { color: '#e6edf3', size: 10 },
        margin: { l: 80, r: 12, t: 10, b: 36 },
        xaxis: {
            title: 'dt = t − t_w',
            color: '#7d8590', gridcolor: '#30363d',
            type: 'log',
        },
        yaxis: {
            color: '#7d8590', gridcolor: 'rgba(0,0,0,0)',
            type: 'category',
        },
        showlegend: false,
    };
}

function initTimelines() {
    Plotly.newPlot(glassTimelineEl, [], timelineLayout(),
        { displayModeBar: false, responsive: true });
    Plotly.newPlot(quantumTimelineEl, [], timelineLayout(),
        { displayModeBar: false, responsive: true });
}

function initFingerprint() {
    const layout = {
        paper_bgcolor: '#0d1117',
        plot_bgcolor: '#0d1117',
        font: { color: '#e6edf3', size: 10 },
        margin: { l: 56, r: 12, t: 10, b: 38 },
        xaxis: {
            title: 'log₁₀(τ_window)',
            color: '#7d8590', gridcolor: '#30363d',
        },
        yaxis: {
            title: 'f = (C_d_diag − C_d) / C_d_diag',
            color: '#7d8590', gridcolor: '#30363d',
            range: [0, 1.05],
        },
        showlegend: true,
        legend: { font: { color: '#e6edf3' }, bgcolor: 'rgba(0,0,0,0)' },
        shapes: [
            // F-018 reference: monotone descent from r-band (high f) to c-band.
            { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 0.70, y1: 0.70,
              line: { color: '#ff7b72', width: 1, dash: 'dot' } },
            { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 0.20, y1: 0.20,
              line: { color: '#79c0ff', width: 1, dash: 'dot' } },
        ],
        annotations: [
            { xref: 'paper', x: 0.99, y: 0.70, xanchor: 'right',
              showarrow: false, text: 'r threshold (0.70)',
              font: { color: '#ff7b72', size: 9 } },
            { xref: 'paper', x: 0.99, y: 0.20, xanchor: 'right',
              showarrow: false, text: 'c threshold (0.20)',
              font: { color: '#79c0ff', size: 9 } },
        ],
    };
    Plotly.newPlot(fingerprintEl, [], layout,
        { displayModeBar: false, responsive: true });
}

// ── Renderers ─────────────────────────────────────────────────────────────

function redrawTimeline(substrate) {
    const el = substrate === 'glass' ? glassTimelineEl : quantumTimelineEl;
    const st = state[substrate];
    if (!st || !st.init) {
        Plotly.react(el, [], el.layout);
        return;
    }
    const samples = st.samples.slice().sort((a, b) => a.t - b.t);
    if (samples.length === 0) {
        Plotly.react(el, [], el.layout);
        return;
    }
    const taus = st.init.tau_windows.slice();
    // Y axis: narrowest τ at top, widest at bottom.
    const rowLabels = taus.map(t => `τ=${t}`);
    const traceByRegime = {};

    for (const s of samples) {
        for (let k = 0; k < (s.per_window || []).length; k++) {
            const w = s.per_window[k];
            const tau = taus[k] != null ? taus[k] : w.tau_window;
            const reg = regimeOf(w, substrate);
            if (!traceByRegime[reg]) {
                traceByRegime[reg] = { xs: [], ys: [], texts: [] };
            }
            traceByRegime[reg].xs.push(Math.max(s.dt, 1));
            traceByRegime[reg].ys.push(`τ=${tau}`);
            const f = fOf(w);
            const fStr = f != null ? f.toFixed(3) : 'n/a';
            traceByRegime[reg].texts.push(
                `${substrate}  τ=${tau}  dt=${s.dt}<br>` +
                `regime=${reg}  f=${fStr}`
            );
        }
    }

    const traces = [];
    for (const reg of Object.keys(traceByRegime)) {
        const d = traceByRegime[reg];
        traces.push({
            type: 'scatter', mode: 'markers',
            x: d.xs, y: d.ys,
            text: d.texts, hoverinfo: 'text',
            marker: {
                color: REGIME_COLOR[reg] || REGIME_COLOR.noise,
                size: 11, symbol: 'square',
                line: { color: '#0d1117', width: 0.5 },
            },
            name: reg,
        });
    }

    const layout = {
        ...el.layout,
        yaxis: {
            ...el.layout.yaxis,
            categoryorder: 'array',
            categoryarray: rowLabels.slice().reverse(),  // narrow at top
        },
    };
    Plotly.react(el, traces, layout, { responsive: true });
}

function redrawFingerprint() {
    const traces = [];
    for (const substrate of ['glass', 'quantum']) {
        const st = state[substrate];
        if (!st.lastSample) continue;
        const xs = [];
        const ys = [];
        const texts = [];
        for (const w of st.lastSample.per_window || []) {
            const f = fOf(w);
            if (f == null) continue;
            xs.push(Math.log10(Math.max(w.tau_window, 1)));
            ys.push(f);
            texts.push(
                `${substrate}<br>τ=${w.tau_window}  log₁₀τ=${xs[xs.length-1].toFixed(2)}<br>` +
                `f=${f.toFixed(3)}  regime=${regimeOf(w, substrate)}`
            );
        }
        if (xs.length === 0) continue;
        const color = substrate === 'glass' ? '#79c0ff' : '#7ee787';
        traces.push({
            type: 'scatter', mode: 'lines+markers',
            x: xs, y: ys, text: texts, hoverinfo: 'text',
            name: substrate + (st.completed ? '' : ' · running…'),
            marker: { color, size: 9 },
            line:   { color, width: 2 },
        });
    }
    Plotly.react(fingerprintEl, traces, fingerprintEl.layout,
        { responsive: true });
}

// ── Verdict ───────────────────────────────────────────────────────────────

function fingerprintSlope(st) {
    // Linear least-squares slope of f vs log10(τ), substrate-internal.
    if (!st.lastSample) return null;
    const xs = [], ys = [];
    for (const w of st.lastSample.per_window || []) {
        const f = fOf(w);
        if (f == null) continue;
        xs.push(Math.log10(Math.max(w.tau_window, 1)));
        ys.push(f);
    }
    if (xs.length < 2) return null;
    const n = xs.length;
    const xm = xs.reduce((a, b) => a + b, 0) / n;
    const ym = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
        num += (xs[i] - xm) * (ys[i] - ym);
        den += (xs[i] - xm) ** 2;
    }
    return den > 0 ? num / den : null;
}

function refreshVerdict() {
    const gs = fingerprintSlope(state.glass);
    const qs = fingerprintSlope(state.quantum);
    const both = state.glass.completed && state.quantum.completed;
    if (gs == null && qs == null) {
        verdictEl.className = 'verdict';
        verdictEl.textContent = 'verdict: awaiting both substrate completes…';
        return;
    }
    const fmt = v => (v == null ? 'n/a' : (v >= 0 ? '+' : '') + v.toFixed(3));
    const status = both ? 'final' : 'preliminary';
    if (gs != null && qs != null && gs < 0 && qs < 0) {
        verdictEl.className = 'verdict pass';
        verdictEl.textContent =
            `✓ ${status}: both substrates show inverted hierarchy ` +
            `(f decreasing with log τ). slope(glass)=${fmt(gs)}, slope(quantum)=${fmt(qs)}. ` +
            `Cross-substrate F-018 verification holds.`;
        return;
    }
    if (gs != null && qs != null && gs >= 0 && qs >= 0) {
        verdictEl.className = 'verdict fail';
        verdictEl.textContent =
            `✗ ${status}: both substrates show v8 §5 prose direction (f increasing). ` +
            `slope(glass)=${fmt(gs)}, slope(quantum)=${fmt(qs)}. ` +
            `F-018's claim is the OPPOSITE — verification does not hold here.`;
        return;
    }
    verdictEl.className = 'verdict warn';
    verdictEl.textContent =
        `⚠ ${status}: substrates disagree on hierarchy direction. ` +
        `slope(glass)=${fmt(gs)}, slope(quantum)=${fmt(qs)}. ` +
        `Inspect run length (rule 8) and operating point before concluding.`;
}

// ── Event handlers ────────────────────────────────────────────────────────

function logEvent(text, cls) {
    if (!eventListEl) return;
    const li = document.createElement('li');
    if (cls) li.className = cls;
    li.textContent = text;
    eventListEl.insertBefore(li, eventListEl.firstChild);
    while (eventListEl.children.length > 60) {
        eventListEl.removeChild(eventListEl.lastChild);
    }
}

function setProgress(text) {
    substrateProgressEl.textContent = text;
}

function refreshRunConfig() {
    const lines = [];
    if (state.glass.config) {
        const c = state.glass.config;
        lines.push(`glass: L=${c.L} T=${c.T} t_w=${c.t_w} t_obs=${c.t_obs}`);
        lines.push(`       τ=${c.tau_windows.join(',')} h=${c.h_field} seed=${c.seed}`);
        lines.push(`       ${state.glass.completed ? 'complete' : 'running…'} (${state.glass.samples.length} samples)`);
    }
    if (state.quantum.config) {
        const c = state.quantum.config;
        lines.push(`quantum: d=${c.distance} p_base=${c.p_base} Δp=${c.delta_p}`);
        lines.push(`         n_shots=${c.n_shots} t_w=${c.t_w} t_obs=${c.t_obs}`);
        lines.push(`         τ=${c.tau_windows.join(',')} seed=${c.seed}`);
        lines.push(`         ${state.quantum.completed ? 'complete' : 'running…'} (${state.quantum.samples.length} samples)`);
    }
    runConfigEl.textContent = lines.length ? lines.join('\n') : 'awaiting first substrate_start…';
}

function onSubstrateStart(event) {
    const sub = event.substrate;
    state[sub] = emptySubstrateState();
    state[sub].config = event.config;
    setProgress(`${sub} starting…`);
    logEvent(`${sub} → start`, sub);
    refreshRunConfig();
}

function onInit(event) {
    const sub = event.substrate;
    state[sub].init = event;
    setProgress(`${sub} init: ${event.n_samples_planned ?? '?'} samples planned`);
    logEvent(`${sub} init: ${(event.tau_windows || []).join(',')}`, sub);
}

function onPhase(event) {
    const sub = event.substrate;
    setProgress(`${sub} ${event.type}: t=${event.t ?? '?'} ${event.frac_done != null ? '· ' + (event.frac_done * 100).toFixed(0) + '%' : ''}`);
}

function onSample(event) {
    const sub = event.substrate;
    state[sub].samples.push(event);
    state[sub].lastSample = event;
    setProgress(`${sub} sample t=${event.t}, dt=${event.dt} (${state[sub].samples.length})`);
    redrawTimeline(sub);
    redrawFingerprint();
    refreshVerdict();
    refreshRunConfig();
}

function onComplete(event) {
    const sub = event.substrate;
    state[sub].completed = true;
    setProgress(`${sub} complete`);
    logEvent(`${sub} → complete`, sub);
    redrawTimeline(sub);
    redrawFingerprint();
    refreshVerdict();
    refreshRunConfig();
}

function onSubstrateComplete(event) {
    // Distinct from substrate's own 'complete' — this is the framing event
    // from the cross driver. They're emitted close together in practice;
    // we treat either as "this substrate done."
    const sub = event.substrate;
    state[sub].completed = true;
    refreshVerdict();
    refreshRunConfig();
}

function onError(event) {
    statusMessageEl.className = 'status-message error';
    statusMessageEl.textContent = 'driver error: ' + (event.msg || '(no msg)');
    logEvent('error: ' + (event.msg || '').split('\n')[0], 'error');
}

// ── SSE wiring ────────────────────────────────────────────────────────────

function buildStreamUrl() {
    const parts = [
        `tab=cross`,
        `g_L=${parseInt(gL.value, 10) || 8}`,
        `g_T=${parseFloat(gT.value) || 0.66}`,
        `g_t_w=${parseInt(gTw.value, 10) || 200}`,
        `g_t_obs=${parseInt(gTobs.value, 10) || 3000}`,
        `g_tau=${encodeURIComponent(gTau.value || '10,30,100,300')}`,
        `g_seed=${parseInt(gSeed.value, 10) || 0}`,
        `q_distance=${parseInt(qDist.value, 10) || 3}`,
        `q_p_base=${parseFloat(qPbase.value) || 1e-3}`,
        `q_delta_p=${parseFloat(qDp.value) || 1e-3}`,
        `q_n_shots=${parseInt(qNs.value, 10) || 128}`,
        `q_t_w=${parseInt(qTw.value, 10) || 200}`,
        `q_t_obs=${parseInt(qTobs.value, 10) || 3000}`,
        `q_tau=${encodeURIComponent(qTau.value || '3,10,30,100,300')}`,
        `q_seed=${parseInt(qSeed.value, 10) || 1}`,
    ];
    return '/stream?' + parts.join('&');
}

function connect() {
    if (evtSource) { evtSource.close(); evtSource = null; }
    statusDot.classList.remove('connected', 'error');
    statusDot.classList.add('connecting');
    statusText.textContent = 'connecting…';

    state.glass = emptySubstrateState();
    state.quantum = emptySubstrateState();
    statusMessageEl.className = 'status-message';
    statusMessageEl.textContent = 'glass running first; quantum follows.';
    redrawTimeline('glass');
    redrawTimeline('quantum');
    redrawFingerprint();
    refreshVerdict();
    refreshRunConfig();

    evtSource = new EventSource(buildStreamUrl());
    evtSource.onopen = () => {
        statusDot.classList.remove('connecting', 'error');
        statusDot.classList.add('connected');
        statusText.textContent = 'connected';
        runStarted = true;
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
            case 'substrate_start':    return onSubstrateStart(event);
            case 'substrate_complete': return onSubstrateComplete(event);
            case 'init':               return onInit(event);
            case 'phase_a':
            case 'phase_b':
            case 'snapshot':           return onPhase(event);
            case 'sample':             return onSample(event);
            case 'complete':           return onComplete(event);
            case 'error':              return onError(event);
            case 'shutdown':
                evtSource.close(); evtSource = null;
                setProgress('done');
                return;
            default:
                logEvent(`${event.substrate || '?'} ${event.type}`);
                return;
        }
    };
}

restartBtn.addEventListener('click', () => {
    fetch('/restart', { method: 'GET' }).finally(() => connect());
});

// ── Boot ──────────────────────────────────────────────────────────────────

initTimelines();
initFingerprint();
connect();
