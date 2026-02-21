/**
 * app.js - Main orchestrator: config loading, generate flow, wiring
 */

import { MoodPad } from './mood-pad.js';
import { GenreSelector } from './genre-selector.js';
import { ConstraintPanel } from './constraint-panel.js';
import { PianoRoll } from './piano-roll.js';
import { Playback } from './playback.js';
import { VarySection } from './variation.js';

// --- Components ---
const moodPad = new MoodPad('mood-pad');
const genreSelector = new GenreSelector('genre-cards');
const constraintPanel = new ConstraintPanel('constraint-panel');
const pianoRoll = new PianoRoll('piano-roll');
const playback = new Playback();
const varySection = new VarySection();

// --- DOM refs ---
const durationSlider = document.getElementById('duration-slider');
const durationValue = document.getElementById('duration-value');
const randomnessSlider = document.getElementById('randomness-slider');
const randomnessValue = document.getElementById('randomness-value');
const intensityControl = document.getElementById('intensity-control');
const formSelect = document.getElementById('form-select');
const accompSelect = document.getElementById('accomp-select');
const rhythmToggle = document.getElementById('rhythm-toggle');
const refineSelect = document.getElementById('refine-select');
const refinePieceSelect = document.getElementById('refine-piece-select');
const generateBtn = document.getElementById('generate-btn');
const varyBtn = document.getElementById('vary-btn');
const outputSection = document.getElementById('output-section');
const loadingOverlay = document.getElementById('loading-overlay');
const startCoords = document.getElementById('start-coords');
const endCoords = document.getElementById('end-coords');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const progressBar = document.getElementById('progress-bar');
const timeDisplay = document.getElementById('time-display');
const downloadMidi = document.getElementById('download-midi');
const picatOutput = document.getElementById('picat-output');
const resetConstraints = document.getElementById('reset-constraints');
const advancedToggle = document.getElementById('advanced-toggle');
const advancedSection = document.getElementById('advanced-section');
const loadingText = document.getElementById('loading-text');

let config = null;
let currentIntensity = 'standard';
let loadingInterval = null;

const LOADING_MESSAGES = [
    'Composing your piece...',
    'Applying constraints...',
    'Resolving harmonies...',
    'Shaping melodic contour...',
    'Balancing voice leading...',
    'Crafting cadences...',
    'Refining expression...',
    'Almost there...',
];

const VARY_LOADING_MESSAGES = [
    'Analysing the original...',
    'Applying variation...',
    'Reshaping the melody...',
    'Fitting constraints...',
    'Almost there...',
];

// --- Init ---
async function init() {
    playback.init();

    const resp = await fetch('/api/config');
    config = await resp.json();

    // Populate mood pad presets
    moodPad.setPresets(config.mood_presets);

    // Genre cards
    genreSelector.setGenres(config.genres);

    // Form select
    for (const f of config.forms) {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name;
        formSelect.appendChild(opt);
    }
    formSelect.value = 'through';

    // Accompaniment select
    for (const a of config.accompaniment_patterns) {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name;
        accompSelect.appendChild(opt);
    }
    accompSelect.value = 'auto';

    // Constraint panel
    constraintPanel.init(config.constraints, config.constraint_categories, config.genre_weights);
    constraintPanel.setGenre('classical_period');

    // Vary section
    varySection.init(config.pieces, config.genres);

    // Wire events
    wireEvents();
}

function wireEvents() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-compose').style.display = tab === 'compose' ? '' : 'none';
            document.getElementById('tab-vary').style.display = tab === 'vary' ? '' : 'none';
        });
    });

    // Mood pad changes
    moodPad.onchange = (s, e) => {
        startCoords.textContent = `Start: V=${s.v.toFixed(2)}, A=${s.a.toFixed(2)}`;
        endCoords.textContent = `End: V=${e.v.toFixed(2)}, A=${e.a.toFixed(2)}`;
    };
    const s0 = moodPad.getStart(), e0 = moodPad.getEnd();
    startCoords.textContent = `Start: V=${s0.v.toFixed(2)}, A=${s0.a.toFixed(2)}`;
    endCoords.textContent = `End: V=${e0.v.toFixed(2)}, A=${e0.a.toFixed(2)}`;

    // Duration slider
    durationSlider.addEventListener('input', () => {
        durationValue.textContent = `${durationSlider.value}s`;
    });

    // Randomness slider
    randomnessSlider.addEventListener('input', () => {
        randomnessValue.textContent = (randomnessSlider.value / 100).toFixed(2);
    });

    // Intensity buttons
    intensityControl.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            intensityControl.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentIntensity = btn.dataset.value;
        });
    });

    // Genre change -> update constraint panel + accomp
    genreSelector.onchange = (genreId) => {
        constraintPanel.setGenre(genreId);
        if (config.genres[genreId]?.accomp_pattern) {
            accompSelect.value = 'auto';
        }
    };

    // Advanced toggle
    advancedToggle.addEventListener('click', () => {
        const isOpen = !advancedSection.classList.contains('collapsed');
        advancedSection.classList.toggle('collapsed', isOpen);
        advancedToggle.classList.toggle('open', !isOpen);
        advancedToggle.setAttribute('aria-expanded', !isOpen);
    });

    // Reset constraints button
    resetConstraints.addEventListener('click', () => constraintPanel.resetToGenre());

    // Generate
    generateBtn.addEventListener('click', doGenerate);

    // Vary
    varyBtn.addEventListener('click', doVary);

    // Transport
    playBtn.addEventListener('click', () => playback.play());
    pauseBtn.addEventListener('click', () => playback.pause());
    stopBtn.addEventListener('click', () => {
        playback.stop();
        pianoRoll.setCursor(-1);
    });

    // Download MIDI
    downloadMidi.addEventListener('click', () => playback.downloadMidi());

    // Playback callbacks
    playback.onprogress = (cur, total, beat) => {
        const pct = total > 0 ? (cur / total) * 100 : 0;
        progressBar.style.width = `${pct}%`;
        timeDisplay.textContent = `${fmtTime(cur)} / ${fmtTime(total)}`;
        pianoRoll.setCursor(beat);
    };

    playback.onstatechange = (playing) => {
        playBtn.disabled = playing;
        pauseBtn.disabled = !playing;
        stopBtn.disabled = false;
    };

    // Vary mode description updates
    document.querySelectorAll('#vary-mode-control button').forEach(btn => {
        btn.addEventListener('click', () => {
            const desc = document.getElementById('vary-mode-desc');
            if (btn.dataset.value === 'continue') {
                desc.textContent = 'Keep the opening and generate a new continuation from that point.';
            } else {
                desc.textContent = 'Apply classical techniques or genre transfer to the whole piece.';
            }
        });
    });
}

function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// -------------------------------------------------------------------------
// Generate (compose tab)
// -------------------------------------------------------------------------

async function doGenerate() {
    playback.stop();

    const start = moodPad.getStart();
    const end = moodPad.getEnd();
    const overrides = constraintPanel.getOverrides();

    const body = {
        from_valence: start.v,
        from_arousal: start.a,
        to_valence: end.v,
        to_arousal: end.a,
        duration: parseInt(durationSlider.value),
        randomness: parseInt(randomnessSlider.value) / 100,
        genre: genreSelector.getSelected(),
        form: formSelect.value,
        accompaniment: accompSelect.value,
        intensity: currentIntensity,
        rhythm: rhythmToggle.checked,
        refine: parseInt(refineSelect.value),
        refine_piece: parseInt(refinePieceSelect.value),
        disabled_constraints: overrides.disabled_constraints,
        weight_overrides: overrides.weight_overrides,
    };

    await runRequest('/api/generate', body, LOADING_MESSAGES, generateBtn);
}

// -------------------------------------------------------------------------
// Vary (variation tab)
// -------------------------------------------------------------------------

async function doVary() {
    playback.stop();

    const err = varySection.validate();
    if (err) {
        alert(err);
        return;
    }

    await runRequest('/api/variation', varySection.getRequest(), VARY_LOADING_MESSAGES, varyBtn);
}

// -------------------------------------------------------------------------
// Shared request runner
// -------------------------------------------------------------------------

async function runRequest(endpoint, body, messages, triggerBtn) {
    triggerBtn.disabled = true;
    loadingOverlay.style.display = 'flex';

    let msgIdx = 0;
    loadingText.textContent = messages[0];
    loadingInterval = setInterval(() => {
        msgIdx = (msgIdx + 1) % messages.length;
        loadingText.textContent = messages[msgIdx];
    }, 3000);

    try {
        const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: 'Unknown error' }));
            const msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
            alert('Generation failed: ' + msg);
            return;
        }

        const data = await resp.json();

        outputSection.style.display = 'block';
        pianoRoll.setNotes(data.notes, data.tempo_changes);
        playback.setNotes(data.notes, data.tempo_changes, data.midi_base64);
        picatOutput.textContent = data.picat_output || '';
        timeDisplay.textContent = `0:00 / ${fmtTime(playback.totalDurationSec)}`;
        progressBar.style.width = '0%';

        playBtn.disabled = false;
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        downloadMidi.style.display = data.midi_base64 ? '' : 'none';

        outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        clearInterval(loadingInterval);
        loadingOverlay.style.display = 'none';
        triggerBtn.disabled = false;
    }
}

// Boot
init();
