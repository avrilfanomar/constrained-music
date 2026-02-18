/**
 * playback.js - Tone.js sampler + transport controls + MIDI download
 */

export class Playback {
    constructor() {
        this.sampler = null;
        this.samplerReady = false;
        this.notes = [];
        this.tempoChanges = [];
        this.totalDurationSec = 0;
        this.playing = false;
        this.midiBase64 = null;
        this._scheduledEvents = [];
        this._rafId = null;
        this._part = null; // Tone.Part for schedulable/cancellable playback

        this.onprogress = null; // (currentSec, totalSec, currentBeat) => {}
        this.onstatechange = null; // (playing) => {}
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

    setNotes(notes, tempoChanges, midiBase64) {
        this.notes = notes;
        this.tempoChanges = tempoChanges;
        this.midiBase64 = midiBase64;
        this._buildTimeline();
    }

    /** Build absolute time positions for each note using the tempo map */
    _buildTimeline() {
        if (this.notes.length === 0) {
            this.totalDurationSec = 0;
            this._scheduledEvents = [];
            return;
        }

        // Build tempo map: sorted list of { beat, bpm }
        const tempoMap = (this.tempoChanges || [])
            .map(tc => ({ beat: (tc.bar - 1) * 4, bpm: tc.bpm }))
            .sort((a, b) => a.beat - b.beat);

        if (tempoMap.length === 0) tempoMap.push({ beat: 0, bpm: 120 });

        // Convert beat position to absolute seconds
        const beatToSec = (targetBeat) => {
            let sec = 0;
            let prevBeat = 0;
            let bpm = tempoMap[0].bpm;
            for (const tc of tempoMap) {
                if (tc.beat >= targetBeat) break;
                if (tc.beat > prevBeat) {
                    sec += (tc.beat - prevBeat) * (60 / bpm);
                    prevBeat = tc.beat;
                }
                bpm = tc.bpm;
            }
            sec += (targetBeat - prevBeat) * (60 / bpm);
            return sec;
        };

        const ACCOMP_VOICE = 10;
        this._scheduledEvents = this.notes.map(n => {
            const startBeat = (n.bar - 1) * 4 + (n.beat - 1) + (n.sub || 0);
            const durBeats = (n.dur_num * 4) / n.dur_den;
            const voice = n.voice || 1;
            return {
                time: beatToSec(startBeat),
                beat: startBeat,
                duration: beatToSec(startBeat + durBeats) - beatToSec(startBeat),
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

    async play() {
        if (this.playing) return;
        if (!this.samplerReady) {
            await this.init();
            // Wait for sampler to load
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

        // Dispose previous Part if any
        this._disposePart();

        // Build Tone.Part events — Transport-scheduled so they can be cancelled
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

        // Start transport from current position (handles resume after pause)
        Tone.Transport.start();

        // Progress loop
        this._trackProgress();
    }

    _trackProgress() {
        if (!this.playing) return;
        const elapsed = Tone.Transport.seconds;
        if (elapsed >= this.totalDurationSec) {
            this.stop();
            return;
        }
        // Find current beat for piano roll cursor
        let currentBeat = 0;
        for (const evt of this._scheduledEvents) {
            if (evt.time <= elapsed) currentBeat = evt.beat;
            else break;
        }
        if (this.onprogress) this.onprogress(elapsed, this.totalDurationSec, currentBeat);
        this._rafId = requestAnimationFrame(() => this._trackProgress());
    }

    _disposePart() {
        if (this._part) {
            this._part.stop();
            this._part.dispose();
            this._part = null;
        }
    }

    pause() {
        if (!this.playing) return;
        this.playing = false;
        Tone.Transport.pause();
        this.sampler.releaseAll();
        cancelAnimationFrame(this._rafId);
        if (this.onstatechange) this.onstatechange(false);
    }

    stop() {
        this.playing = false;
        // Stop transport and cancel all scheduled events
        Tone.Transport.stop();
        Tone.Transport.cancel();
        this._disposePart();
        this.sampler?.releaseAll();
        // Reset transport position to beginning
        Tone.Transport.position = 0;
        cancelAnimationFrame(this._rafId);
        if (this.onprogress) this.onprogress(0, this.totalDurationSec, -1);
        if (this.onstatechange) this.onstatechange(false);
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
