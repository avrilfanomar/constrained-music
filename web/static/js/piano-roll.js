/**
 * piano-roll.js - Canvas note visualization with playback cursor
 */

export class PianoRoll {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.notes = [];
        this.tempoChanges = [];
        this.totalBeats = 0;
        this.cursorBeat = -1;
        this._animFrame = null;
    }

    setNotes(notes, tempoChanges) {
        this.notes = notes;
        this.tempoChanges = tempoChanges;
        if (notes.length === 0) return;

        // Calculate total beats
        let maxBeat = 0;
        for (const n of notes) {
            const startBeat = (n.bar - 1) * 4 + (n.beat - 1) + (n.sub || 0);
            const durBeats = (n.dur_num * 4) / n.dur_den;
            maxBeat = Math.max(maxBeat, startBeat + durBeats);
        }
        this.totalBeats = maxBeat;
        this.draw();
    }

    setCursor(beat) {
        this.cursorBeat = beat;
        this.draw();
    }

    draw() {
        const ctx = this.ctx;
        const dpr = window.devicePixelRatio || 1;
        const dispW = this.canvas.clientWidth;
        const dispH = this.canvas.clientHeight;
        this.canvas.width = dispW * dpr;
        this.canvas.height = dispH * dpr;
        ctx.scale(dpr, dpr);
        const w = dispW;
        const h = dispH;

        // Background
        ctx.fillStyle = '#1B2A4A';
        ctx.fillRect(0, 0, w, h);

        if (this.notes.length === 0) {
            ctx.fillStyle = 'rgba(200, 208, 220, 0.3)';
            ctx.font = '14px "Source Sans 3", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Generate music to see the piano roll', w / 2, h / 2);
            return;
        }

        // Compute pitch range
        let minPitch = 127, maxPitch = 0;
        for (const n of this.notes) {
            minPitch = Math.min(minPitch, n.pitch);
            maxPitch = Math.max(maxPitch, n.pitch);
        }
        minPitch = Math.max(0, minPitch - 2);
        maxPitch = Math.min(127, maxPitch + 2);
        const pitchRange = maxPitch - minPitch + 1;

        const margin = { left: 30, right: 10, top: 6, bottom: 6 };
        const plotW = w - margin.left - margin.right;
        const plotH = h - margin.top - margin.bottom;
        const beatW = plotW / Math.max(1, this.totalBeats);
        const noteH = Math.max(2, plotH / pitchRange);

        // Horizontal grid lines (every octave C)
        ctx.strokeStyle = 'rgba(200, 208, 220, 0.08)';
        ctx.lineWidth = 0.5;
        for (let p = minPitch; p <= maxPitch; p++) {
            if (p % 12 === 0) {
                const y = margin.top + plotH - (p - minPitch) * noteH;
                ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(w - margin.right, y); ctx.stroke();
                ctx.fillStyle = 'rgba(200, 208, 220, 0.2)';
                ctx.font = '9px "Source Sans 3", sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(`C${Math.floor(p / 12) - 1}`, margin.left - 3, y + 3);
            }
        }

        // Vertical bar lines
        const totalBars = Math.ceil(this.totalBeats / 4);
        ctx.strokeStyle = 'rgba(200, 208, 220, 0.06)';
        for (let bar = 0; bar <= totalBars; bar++) {
            const x = margin.left + bar * 4 * beatW;
            ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, h - margin.bottom); ctx.stroke();
        }

        // Draw notes
        const ACCOMP_VOICE = 10;
        for (const n of this.notes) {
            const startBeat = (n.bar - 1) * 4 + (n.beat - 1) + (n.sub || 0);
            const durBeats = (n.dur_num * 4) / n.dur_den;
            const voice = n.voice || 1;

            const x = margin.left + startBeat * beatW;
            const nw = Math.max(1, durBeats * beatW - 1);
            const y = margin.top + plotH - (n.pitch - minPitch + 1) * noteH;
            const nh = Math.max(2, noteH - 1);

            if (voice >= ACCOMP_VOICE) {
                ctx.fillStyle = 'rgba(114, 47, 55, 0.7)'; // burgundy
            } else {
                ctx.fillStyle = 'rgba(212, 168, 67, 0.85)'; // gold
            }
            ctx.fillRect(x, y, nw, nh);

            // Slight highlight on top edge
            ctx.fillStyle = voice >= ACCOMP_VOICE
                ? 'rgba(139, 58, 66, 0.9)'
                : 'rgba(232, 201, 122, 0.9)';
            ctx.fillRect(x, y, nw, 1);
        }

        // Playback cursor
        if (this.cursorBeat >= 0 && this.cursorBeat <= this.totalBeats) {
            const cx = margin.left + this.cursorBeat * beatW;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(cx, margin.top); ctx.lineTo(cx, h - margin.bottom); ctx.stroke();
        }
    }
}
