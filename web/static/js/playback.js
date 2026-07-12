/**
 * playback.js - Two playback engines behind one interface:
 *   - 'server'  : plays the exact fluidsynth-rendered WAV the export produces
 *                 (preview == export, works offline, correct for any meter)
 *   - 'sampler' : Tone.js Salamander piano, CDN-streamed — fallback when the
 *                 machine can't render server audio (no fluidsynth/soundfont)
 * app.js picks the engine by passing a wavUrl (server) or null (sampler).
 */

import {
    timeSig, buildTempoMap, beatToSec, secToBeat, noteStartBeat, noteDurBeats,
} from './timeline.js';

const ACCOMP_VOICE = 10;

export class Playback {
    constructor() {
        this.sampler = null;
        this.samplerReady = false;
        this.notes = [];
        this.tempoChanges = [];
        this.ts = { beats: 4, beat_unit: 4 };
        this.totalDurationSec = 0;
        this.playing = false;
        this.midiBase64 = null;
        this._scheduledEvents = [];
        this._tempoMap = [{ beat: 0, bpm: 120 }];
        this._rafId = null;
        this._part = null; // Tone.Part for schedulable/cancellable playback

        // Server-audio engine
        this.engine = 'sampler';       // 'server' | 'sampler'
        this.wavUrl = null;
        this._audio = null;            // HTMLAudioElement, created lazily
        this._audioSrc = null;         // currently-loaded src
        this.buffering = false;

        this.onprogress = null;    // (currentSec, totalSec, currentBeat) => {}
        this.onstatechange = null; // (playing) => {}
        this.onbuffering = null;   // (isBuffering) => {}  (server engine only)
    }

    async init() {
        if (this.sampler) return;
        // Load Salamander Grand Piano samples from CDN
        const baseUrl = 'https://tonejs.github.io/audio/salamander/';
        this.sampler = new Tone.Sampler({
            urls: {
                A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
                A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
                A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
                A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
                A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
                A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
                A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
                A7: 'A7.mp3', C8: 'C8.mp3',
            },
            baseUrl,
            onload: () => { this.samplerReady = true; },
        }).toDestination();
    }

    setNotes(notes, tempoChanges, midiBase64, metadata, wavUrl) {
        // Loading a new piece: silence whatever the previous one left running.
        this._resetEngines();
        this.notes = notes;
        this.tempoChanges = tempoChanges;
        this.midiBase64 = midiBase64;
        this.ts = timeSig(metadata);
        this.wavUrl = wavUrl || null;
        this.engine = this.wavUrl ? 'server' : 'sampler';
        this._buildTimeline();
    }

    /** Build absolute time positions for each note using the tempo map */
    _buildTimeline() {
        this._tempoMap = buildTempoMap(this.tempoChanges, this.ts);
        if (this.notes.length === 0) {
            this.totalDurationSec = 0;
            this._scheduledEvents = [];
            return;
        }

        const tempoMap = this._tempoMap;
        this._scheduledEvents = this.notes.map(n => {
            const startBeat = noteStartBeat(n, this.ts);
            const durBeats = noteDurBeats(n);
            const voice = n.voice || 1;
            return {
                time: beatToSec(tempoMap, startBeat),
                beat: startBeat,
                duration: beatToSec(tempoMap, startBeat + durBeats) - beatToSec(tempoMap, startBeat),
                pitch: n.pitch,
                velocity: (n.velocity || 80) / 127,
                gain: voice >= ACCOMP_VOICE ? 0.55 : 1.0,
            };
        });

        // Total duration = end of last note
        let maxEnd = 0;
        for (const e of this._scheduledEvents) {
            maxEnd = Math.max(maxEnd, e.time + e.duration);
        }
        this.totalDurationSec = maxEnd;
    }

    _midiToNoteName(midi) {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midi / 12) - 1;
        return names[midi % 12] + octave;
    }

    // --- Public transport ---------------------------------------------------

    async play() {
        if (this.playing) return;
        if (this.engine === 'server') return this._playServer();
        return this._playSampler();
    }

    pause() {
        if (!this.playing) return;
        this.playing = false;
        cancelAnimationFrame(this._rafId);
        if (this.engine === 'server') {
            this._audio?.pause();
        } else {
            Tone.Transport.pause();
            this.sampler?.releaseAll();
        }
        if (this.onstatechange) this.onstatechange(false);
    }

    stop() {
        const wasPlaying = this.playing;
        this.playing = false;
        cancelAnimationFrame(this._rafId);
        this._setBuffering(false);
        if (this._audio) {
            this._audio.pause();
            try { this._audio.currentTime = 0; } catch (e) { /* not seekable yet */ }
        }
        if (this._part || wasPlaying) {
            Tone.Transport.stop();
            Tone.Transport.cancel();
            this._disposePart();
            this.sampler?.releaseAll();
            Tone.Transport.position = 0;
        }
        if (this.onprogress) this.onprogress(0, this.totalDurationSec, -1);
        if (this.onstatechange) this.onstatechange(false);
    }

    // --- Server (WAV) engine ------------------------------------------------

    async _playServer() {
        if (!this._audio) {
            this._audio = new Audio();
            this._audio.preload = 'auto';
            this._audio.addEventListener('waiting', () => this._setBuffering(true));
            this._audio.addEventListener('playing', () => this._setBuffering(false));
            this._audio.addEventListener('ended', () => this.stop());
        }
        // Lazily point at the render endpoint; first request triggers the
        // server-side fluidsynth render, so show a buffering state.
        if (this._audioSrc !== this.wavUrl) {
            this._audio.src = this.wavUrl;
            this._audioSrc = this.wavUrl;
        }
        this.playing = true;
        this._setBuffering(true);
        if (this.onstatechange) this.onstatechange(true);
        try {
            await this._audio.play();
        } catch (e) {
            // Autoplay blocked or render failed — surface as stopped.
            this.playing = false;
            this._setBuffering(false);
            if (this.onstatechange) this.onstatechange(false);
            return;
        }
        this._trackProgressServer();
    }

    _trackProgressServer() {
        if (!this.playing || this.engine !== 'server') return;
        const sec = this._audio.currentTime;
        const total = this._audio.duration || this.totalDurationSec;
        const beat = secToBeat(this._tempoMap, sec);
        if (this.onprogress) this.onprogress(sec, total, beat);
        this._rafId = requestAnimationFrame(() => this._trackProgressServer());
    }

    _setBuffering(on) {
        if (this.buffering === on) return;
        this.buffering = on;
        if (this.onbuffering) this.onbuffering(on);
    }

    // --- Sampler (Tone.js) engine ------------------------------------------

    async _playSampler() {
        if (!this.samplerReady) {
            await this.init();
            await new Promise(resolve => {
                const check = () => {
                    if (this.samplerReady) resolve();
                    else setTimeout(check, 100);
                };
                check();
            });
        }

        await Tone.start();
        this.playing = true;
        if (this.onstatechange) this.onstatechange(true);

        this._disposePart();

        const partEvents = this._scheduledEvents.map(evt => ({
            time: evt.time,
            note: this._midiToNoteName(evt.pitch),
            duration: Math.max(0.05, evt.duration),
            velocity: evt.velocity * evt.gain,
            beat: evt.beat,
        }));

        this._part = new Tone.Part((time, evt) => {
            this.sampler.triggerAttackRelease(evt.note, evt.duration, time, evt.velocity);
        }, partEvents);
        this._part.start(0);

        Tone.Transport.start();
        this._trackProgressSampler();
    }

    _trackProgressSampler() {
        if (!this.playing || this.engine !== 'sampler') return;
        const elapsed = Tone.Transport.seconds;
        if (elapsed >= this.totalDurationSec) {
            this.stop();
            return;
        }
        let currentBeat = 0;
        for (const evt of this._scheduledEvents) {
            if (evt.time <= elapsed) currentBeat = evt.beat;
            else break;
        }
        if (this.onprogress) this.onprogress(elapsed, this.totalDurationSec, currentBeat);
        this._rafId = requestAnimationFrame(() => this._trackProgressSampler());
    }

    _disposePart() {
        if (this._part) {
            this._part.stop();
            this._part.dispose();
            this._part = null;
        }
    }

    /** Halt and reset BOTH engines so a piece switch never double-plays. */
    _resetEngines() {
        this.playing = false;
        cancelAnimationFrame(this._rafId);
        this._setBuffering(false);
        if (this._audio) {
            this._audio.pause();
            this._audio.removeAttribute('src');
            this._audio.load();
            this._audioSrc = null;
        }
        this._disposePart();
        if (this.sampler) {
            Tone.Transport.stop();
            Tone.Transport.cancel();
            Tone.Transport.position = 0;
            this.sampler.releaseAll();
        }
    }

    downloadMidi() {
        if (!this.midiBase64) return;
        const bin = atob(this.midiBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'audio/midi' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'composition.mid';
        a.click();
        URL.revokeObjectURL(url);
    }
}
