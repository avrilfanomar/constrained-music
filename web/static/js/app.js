/**
 * app.js - Main orchestrator: config loading, generate flow, wiring
 */

import { MoodPad } from './mood-pad.js';
import { GenreSelector } from './genre-selector.js';
import { ConstraintPanel } from './constraint-panel.js';
import { PianoRoll } from './piano-roll.js';
import { Playback } from './playback.js';
import { VarySection } from './variation.js';
import { Library } from './library.js';

// --- Components ---
const moodPad = new MoodPad('mood-pad');
const genreSelector = new GenreSelector('genre-cards');
const constraintPanel = new ConstraintPanel('constraint-panel');
const pianoRoll = new PianoRoll('piano-roll');
const playback = new Playback();
const varySection = new VarySection();
const library = new Library('library-list');

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
const countSelect = document.getElementById('count-select');
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
const downloadMusicXml = document.getElementById('download-musicxml');
const downloadWav = document.getElementById('download-wav');
const downloadMp3 = document.getElementById('download-mp3');
const downloadStemMelody = document.getElementById('download-stem-melody');
const downloadStemAccomp = document.getElementById('download-stem-accomp');
const picatOutput = document.getElementById('picat-output');
const resetConstraints = document.getElementById('reset-constraints');
const advancedToggle = document.getElementById('advanced-toggle');
const advancedSection = document.getElementById('advanced-section');
const loadingText = document.getElementById('loading-text');
const keySelect = document.getElementById('key-select');
const tempoInput = document.getElementById('tempo-input');
const meterSelect = document.getElementById('meter-select');
const ornamentsSlider = document.getElementById('ornaments-slider');
const ornamentsValue = document.getElementById('ornaments-value');
const seedInput = document.getElementById('seed-input');
const seedDice = document.getElementById('seed-dice');
const outputPieceName = document.getElementById('output-piece-name');
const errorPanel = document.getElementById('error-panel');
const errorMessage = document.getElementById('error-message');
const errorOutput = document.getElementById('error-output');
const errorClose = document.getElementById('error-close');
const volumeSlider = document.getElementById('volume-slider');
const melodyMuteBtn = document.getElementById('melody-mute-btn');
const accompMuteBtn = document.getElementById('accomp-mute-btn');
const rerollBtn = document.getElementById('reroll-btn');
const selectionHint = document.getElementById('selection-hint');
const progressContainer = document.getElementById('progress-container');

let config = null;
let currentIntensity = 'standard';
let loadingInterval = null;
let currentLibraryId = null;   // library id of the piece in the player

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

// --- Error Panel ---
function showErrorPanel(message, outputTail = []) {
    errorMessage.textContent = message;
    errorOutput.textContent = outputTail.length > 0
        ? outputTail.join('\n')
        : '(No Picat output available)';
    errorPanel.style.display = 'block';
}

function hideErrorPanel() {
    errorPanel.style.display = 'none';
}

// --- Init ---
async function init() {
    const resp = await fetch('/api/config');
    config = await resp.json();

    // Warm up the Tone.js sampler ONLY when it will actually be used — it
    // streams samples from a CDN, so on machines with server audio (the
    // offline path) we must not fetch it on page load.
    if (!(config.exports && config.exports.wav)) playback.init();

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

    // Key select
    for (const k of (config.keys || [])) {
        const opt = document.createElement('option');
        opt.value = k.id;
        opt.textContent = k.name;
        keySelect.appendChild(opt);
    }
    keySelect.value = 'auto';

    // Meter select
    for (const m of (config.meters || [{ id: '4/4', name: '4/4' }])) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        meterSelect.appendChild(opt);
    }
    meterSelect.value = '4/4';

    // Hide audio export buttons the server can't render
    const exports = config.exports || {};
    downloadWav.style.display = exports.wav ? '' : 'none';
    downloadMp3.style.display = exports.mp3 ? '' : 'none';

    // Constraint panel
    constraintPanel.init(config.constraints, config.constraint_categories, config.genre_weights);
    constraintPanel.setGenre('classical_period');

    // Vary section
    varySection.init(config.pieces, config.genres);

    // Library
    library.setExports(exports);
    library.onload = loadLibraryPiece;
    library.onregenerate = regenerateLibraryPiece;
    library.refresh();

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
            document.getElementById('tab-library').style.display = tab === 'library' ? '' : 'none';
            if (tab === 'library') library.refresh();
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

    // Cancel
    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelCurrentJob);
    }

    // Error panel close
    errorClose.addEventListener('click', hideErrorPanel);

    // Vary
    varyBtn.addEventListener('click', doVary);

    // Transport
    playBtn.addEventListener('click', () => playback.play());
    pauseBtn.addEventListener('click', () => playback.pause());
    stopBtn.addEventListener('click', () => {
        playback.stop();
        pianoRoll.setCursor(-1);
    });

    // Volume slider
    volumeSlider.addEventListener('input', () => {
        const vol = volumeSlider.value / 100;
        playback.setVolume(vol);
    });

    // Mute buttons
    melodyMuteBtn.addEventListener('click', () => {
        playback.setMelodyMute(!playback.melodyMuted);
        melodyMuteBtn.classList.toggle('muted', playback.melodyMuted);
    });

    accompMuteBtn.addEventListener('click', () => {
        playback.setAccompMute(!playback.accompMuted);
        accompMuteBtn.classList.toggle('muted', playback.accompMuted);
    });

    // Click to seek on progress bar
    progressContainer.addEventListener('click', (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = x / rect.width;
        const seekSec = pct * playback.totalDurationSec;
        playback.seek(seekSec);
    });

    // Ornaments slider
    ornamentsSlider.addEventListener('input', () => {
        ornamentsValue.textContent = (ornamentsSlider.value / 100).toFixed(2);
    });

    // Seed dice
    seedDice.addEventListener('click', () => {
        seedInput.value = Math.floor(Math.random() * 1000000);
    });

    // Exports: server-side files with proper names when the take is in the
    // library; MIDI falls back to the in-memory base64 blob otherwise
    downloadMidi.addEventListener('click', () => {
        if (currentLibraryId) {
            window.location.href = `/api/library/${currentLibraryId}/export/midi`;
        } else {
            playback.downloadMidi();
        }
    });
    downloadMusicXml.addEventListener('click', () => {
        if (currentLibraryId) window.location.href = `/api/library/${currentLibraryId}/export/musicxml`;
    });
    downloadWav.addEventListener('click', () => {
        if (currentLibraryId) window.location.href = `/api/library/${currentLibraryId}/export/wav`;
    });
    downloadMp3.addEventListener('click', () => {
        if (currentLibraryId) window.location.href = `/api/library/${currentLibraryId}/export/mp3`;
    });
    downloadStemMelody.addEventListener('click', () => {
        if (currentLibraryId) window.location.href = `/api/library/${currentLibraryId}/export/stem/melody`;
    });
    downloadStemAccomp.addEventListener('click', () => {
        if (currentLibraryId) window.location.href = `/api/library/${currentLibraryId}/export/stem/accomp`;
    });

    // Reroll selection
    pianoRoll.onSelectionChange = (selection) => {
        if (selection && currentLibraryId) {
            rerollBtn.style.display = 'inline-block';
            selectionHint.style.display = 'none';
        } else {
            rerollBtn.style.display = 'none';
            selectionHint.style.display = currentLibraryId ? 'block' : 'none';
        }
    };

    rerollBtn.addEventListener('click', async () => {
        const selection = pianoRoll.getSelection();
        if (!selection || !currentLibraryId) return;

        playback.stop();
        const body = {
            bar_start: selection.bar_start,
            bar_end: selection.bar_end,
        };

        await runRequest(`/api/library/${currentLibraryId}/reroll`, body, LOADING_MESSAGES, rerollBtn);
        // clearSelection() is already called inside showPiece() (via runRequest → pollJob → showPiece)
    });

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

    // First Play on the server engine triggers a fluidsynth render — show it.
    playback.onbuffering = (isBuffering) => {
        playBtn.classList.toggle('buffering', isBuffering);
        if (isBuffering) {
            timeDisplay.textContent = 'Rendering audio…';
        } else {
            timeDisplay.textContent =
                `${fmtTime(0)} / ${fmtTime(playback.totalDurationSec)}`;
        }
    };

    // Click to seek on piano roll
    pianoRoll.canvas.addEventListener('click', (e) => {
        if (pianoRoll.totalBeats === 0) return;
        const rect = pianoRoll.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const margin = 36; // left margin from piano-roll.js
        const plotW = rect.width - margin - 12;
        if (x < margin) return; // clicked on pitch labels
        const pct = (x - margin) / plotW;
        const beat = pct * pianoRoll.totalBeats;
        // Convert beat to seconds using the tempo map
        import('./timeline.js').then(({ buildTempoMap, beatToSec }) => {
            const tempoMap = buildTempoMap(playback.tempoChanges, playback.ts);
            const sec = beatToSec(tempoMap, beat);
            playback.seek(sec);
        });
    });

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

    const tempoVal = parseInt(tempoInput.value);
    const seedVal = parseInt(seedInput.value);

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
        count: parseInt(countSelect.value),
        disabled_constraints: overrides.disabled_constraints,
        weight_overrides: overrides.weight_overrides,
        key: keySelect.value === 'auto' ? '' : keySelect.value,
        tempo: Number.isFinite(tempoVal) ? Math.min(220, Math.max(40, tempoVal)) : null,
        meter: meterSelect.value,
        ornaments: parseInt(ornamentsSlider.value) / 100,
        seed: Number.isFinite(seedVal) && seedVal >= 0 ? seedVal : null,
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

let currentJobId = null;
let pollInterval = null;

async function runRequest(endpoint, body, messages, triggerBtn) {
    triggerBtn.disabled = true;
    loadingOverlay.style.display = 'flex';
    loadingText.textContent = 'Starting…';

    // Show cancel button
    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) {
        cancelBtn.style.display = 'inline-block';
        cancelBtn.disabled = false;
    }

    try {
        // Start the job
        const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: 'Unknown error' }));
            const msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
            throw new Error(msg);
        }

        const jobResp = await resp.json();
        const jobId = jobResp.job_id;
        currentJobId = jobId;

        // Poll for completion
        await pollJob(jobId);

    } catch (e) {
        // Check if it's an error with output_tail from pollJob
        if (e && e.error) {
            showErrorPanel(e.error, e.output_tail);
        } else {
            // Generic error (network, etc.)
            showErrorPanel(e.message || String(e), []);
        }
    } finally {
        currentJobId = null;
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        if (cancelBtn) cancelBtn.style.display = 'none';
        loadingOverlay.style.display = 'none';
        loadingText.style.color = '';
        triggerBtn.disabled = false;
    }
}

async function pollJob(jobId) {
    return new Promise((resolve, reject) => {
        const poll = async () => {
            try {
                const resp = await fetch(`/api/jobs/${jobId}`);
                if (!resp.ok) {
                    reject(new Error('Job not found'));
                    return;
                }

                const job = await resp.json();
                const progress = Math.round(job.progress * 100);

                // Show queued status
                if (job.status === 'queued') {
                    loadingText.textContent = 'Queued behind current render…';
                } else {
                    loadingText.textContent = `${progress}% — ${job.stage}`;
                }

                if (job.status === 'done') {
                    if (pollInterval) clearInterval(pollInterval);
                    pollInterval = null;
                    showPiece(job.result, job.result.library || null);
                    library.refresh();
                    resolve();
                } else if (job.status === 'error') {
                    if (pollInterval) clearInterval(pollInterval);
                    pollInterval = null;
                    // Show persistent error panel with output_tail
                    reject({ error: job.error || 'Generation failed', output_tail: job.output_tail || [] });
                } else if (job.status === 'cancelled') {
                    if (pollInterval) clearInterval(pollInterval);
                    pollInterval = null;
                    reject(new Error('Cancelled'));
                }
            } catch (e) {
                if (pollInterval) clearInterval(pollInterval);
                pollInterval = null;
                reject(e);
            }
        };

        poll();
        pollInterval = setInterval(poll, 1000);
    });
}

async function cancelCurrentJob() {
    if (!currentJobId) return;
    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) cancelBtn.disabled = true;

    try {
        await fetch(`/api/jobs/${currentJobId}`, { method: 'DELETE' });
    } catch (e) {
        console.error('Cancel failed:', e);
    }
}

// -------------------------------------------------------------------------
// Player loading (shared by generate, vary, and the library)
// -------------------------------------------------------------------------

function showPiece(data, libraryMeta) {
    currentLibraryId = libraryMeta ? libraryMeta.id : null;
    outputPieceName.textContent = libraryMeta ? `— ${libraryMeta.name}` : '';

    outputSection.style.display = 'block';
    // Prefer the server-rendered WAV (preview == export, meter-correct, offline);
    // fall back to the Tone.js sampler when this machine can't render audio.
    const exports = (config && config.exports) || {};
    const wavUrl = (currentLibraryId && exports.wav)
        ? `/api/library/${currentLibraryId}/export/wav`
        : null;
    pianoRoll.setNotes(data.notes, data.tempo_changes, data.metadata);
    if (typeof pianoRoll.clearSelection === 'function') {
        pianoRoll.clearSelection();
    }
    playback.setNotes(data.notes, data.tempo_changes, data.midi_base64, data.metadata, wavUrl);
    picatOutput.textContent = data.picat_output || '';
    timeDisplay.textContent = `0:00 / ${fmtTime(playback.totalDurationSec)}`;
    progressBar.style.width = '0%';

    playBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;

    // Show selection hint for library pieces
    selectionHint.style.display = currentLibraryId ? 'block' : 'none';
    rerollBtn.style.display = 'none';
    downloadMidi.style.display = (data.midi_base64 || currentLibraryId) ? '' : 'none';
    downloadMusicXml.style.display = currentLibraryId ? '' : 'none';
    downloadWav.style.display = (currentLibraryId && exports.wav) ? '' : 'none';
    downloadMp3.style.display = (currentLibraryId && exports.mp3) ? '' : 'none';
    downloadStemMelody.style.display = (currentLibraryId && exports.wav) ? '' : 'none';
    downloadStemAccomp.style.display = (currentLibraryId && exports.wav) ? '' : 'none';

    outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function loadLibraryPiece(data, meta) {
    playback.stop();
    showPiece(data, data.meta || meta);
}

async function regenerateLibraryPiece(id) {
    playback.stop();
    const fakeBtn = generateBtn;   // reuse the loading UX
    fakeBtn.disabled = true;
    loadingOverlay.style.display = 'flex';
    loadingText.textContent = 'Starting…';

    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) {
        cancelBtn.style.display = 'inline-block';
        cancelBtn.disabled = false;
    }

    try {
        const resp = await fetch(`/api/library/${id}/regenerate`, { method: 'POST' });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: 'Unknown error' }));
            const msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
            throw new Error(msg);
        }

        const jobResp = await resp.json();
        const jobId = jobResp.job_id;
        currentJobId = jobId;

        await pollJob(jobId);

    } catch (e) {
        // Check if it's an error with output_tail from pollJob
        if (e && e.error) {
            showErrorPanel(e.error, e.output_tail);
        } else {
            // Generic error (network, etc.)
            showErrorPanel(e.message || String(e), []);
        }
    } finally {
        currentJobId = null;
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        if (cancelBtn) cancelBtn.style.display = 'none';
        loadingOverlay.style.display = 'none';
        fakeBtn.disabled = false;
    }
}

// Boot
init();
