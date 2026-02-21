/**
 * app.js - Main orchestrator: config loading, generate flow, wiring
 */

import { MoodPad } from './mood-pad.js';
import { GenreSelector } from './genre-selector.js';
import { ConstraintPanel } from './constraint-panel.js';
import { PianoRoll } from './piano-roll.js';
import { Playback } from './playback.js';

// --- Components ---
const moodPad = new MoodPad('mood-pad');
const genreSelector = new GenreSelector('genre-cards');
const constraintPanel = new ConstraintPanel('constraint-panel');
const pianoRoll = new PianoRoll('piano-roll');
const playback = new Playback();

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

// --- Init ---
async function init() {
    // Start loading sampler early
    playback.init();

    // Load config
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

    // Wire events
    wireEvents();
}

function wireEvents() {
    // Mood pad changes
    moodPad.onchange = (s, e) => {
        startCoords.textContent = `Start: V=${s.v.toFixed(2)}, A=${s.a.toFixed(2)}`;
        endCoords.textContent = `End: V=${e.v.toFixed(2)}, A=${e.a.toFixed(2)}`;
    };
    // Trigger initial display
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
        // Update default accompaniment
        const genre = config.genres[genreId];
        if (genre?.accomp_pattern) {
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
}

function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

async function doGenerate() {
    // Stop any current playback
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

    loadingOverlay.style.display = 'flex';
    generateBtn.disabled = true;

    // Rotate loading messages
    let msgIdx = 0;
    loadingText.textContent = LOADING_MESSAGES[0];
    loadingInterval = setInterval(() => {
        msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
        loadingText.textContent = LOADING_MESSAGES[msgIdx];
    }, 3000);

    try {
        const resp = await fetch('/api/generate', {
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

        // Show output
        outputSection.style.display = 'block';
        pianoRoll.setNotes(data.notes, data.tempo_changes);
        playback.setNotes(data.notes, data.tempo_changes, data.midi_base64);
        picatOutput.textContent = data.picat_output || '';
        timeDisplay.textContent = `0:00 / ${fmtTime(playback.totalDurationSec)}`;
        progressBar.style.width = '0%';

        // Enable transport
        playBtn.disabled = false;
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        downloadMidi.style.display = data.midi_base64 ? '' : 'none';

        // Scroll to output
        outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        clearInterval(loadingInterval);
        loadingOverlay.style.display = 'none';
        generateBtn.disabled = false;
    }
}

// Boot
init();
