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

    _roundRect(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
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

        // Background gradient
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#1E2D42');
        bg.addColorStop(1, '#162232');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        if (this.notes.length === 0) {
            ctx.fillStyle = 'rgba(180, 195, 215, 0.25)';
            ctx.font = '13px "Source Sans 3", sans-serif';
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

        const margin = { left: 32, right: 10, top: 8, bottom: 8 };
        const plotW = w - margin.left - margin.right;
        const plotH = h - margin.top - margin.bottom;
        const beatW = plotW / Math.max(1, this.totalBeats);
        const noteH = Math.max(2, plotH / pitchRange);

        // Horizontal grid — subtle alternating pitch rows
        for (let p = minPitch; p <= maxPitch; p++) {
            const y = margin.top + plotH - (p - minPitch + 1) * noteH;
            if (p % 2 === 0) {
                ctx.fillStyle = 'rgba(200, 215, 235, 0.02)';
                ctx.fillRect(margin.left, y, plotW, noteH);
            }
        }

        // Octave C lines
        ctx.lineWidth = 0.5;
        for (let p = minPitch; p <= maxPitch; p++) {
            if (p % 12 === 0) {
                const y = margin.top + plotH - (p - minPitch) * noteH;
                ctx.strokeStyle = 'rgba(180, 195, 215, 0.1)';
                ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(w - margin.right, y); ctx.stroke();
                ctx.fillStyle = 'rgba(180, 195, 215, 0.2)';
                ctx.font = '9px "Source Sans 3", sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(`C${Math.floor(p / 12) - 1}`, margin.left - 4, y + 3);
            }
        }

        // Vertical bar lines
        const totalBars = Math.ceil(this.totalBeats / 4);
        for (let bar = 0; bar <= totalBars; bar++) {
            const x = margin.left + bar * 4 * beatW;
            ctx.strokeStyle = bar % 4 === 0 ? 'rgba(180, 195, 215, 0.1)' : 'rgba(180, 195, 215, 0.04)';
            ctx.lineWidth = bar % 4 === 0 ? 0.8 : 0.4;
            ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, h - margin.bottom); ctx.stroke();
        }

        // Note glow layer (drawn first, behind notes)
        const ACCOMP_VOICE = 10;
        ctx.save();
        for (const n of this.notes) {
            const startBeat = (n.bar - 1) * 4 + (n.beat - 1) + (n.sub || 0);
            const durBeats = (n.dur_num * 4) / n.dur_den;
            const voice = n.voice || 1;

            const x = margin.left + startBeat * beatW;
            const nw = Math.max(2, durBeats * beatW - 1);
            const y = margin.top + plotH - (n.pitch - minPitch + 1) * noteH;
            const nh = Math.max(2, noteH - 1);

            if (voice >= ACCOMP_VOICE) {
                ctx.shadowColor = 'rgba(148, 68, 81, 0.35)';
            } else {
                ctx.shadowColor = 'rgba(201, 162, 77, 0.4)';
            }
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;
            ctx.fillStyle = 'transparent';
            this._roundRect(ctx, x, y, nw, nh, 2.5);
            ctx.fill();
        }
        ctx.restore();

        // Draw notes
        for (const n of this.notes) {
            const startBeat = (n.bar - 1) * 4 + (n.beat - 1) + (n.sub || 0);
            const durBeats = (n.dur_num * 4) / n.dur_den;
            const voice = n.voice || 1;

            const x = margin.left + startBeat * beatW;
            const nw = Math.max(2, durBeats * beatW - 1);
            const y = margin.top + plotH - (n.pitch - minPitch + 1) * noteH;
            const nh = Math.max(2, noteH - 1);

            // Note body with gradient
            if (voice >= ACCOMP_VOICE) {
                const ng = ctx.createLinearGradient(x, y, x, y + nh);
                ng.addColorStop(0, 'rgba(148, 68, 81, 0.65)');
                ng.addColorStop(1, 'rgba(122, 54, 64, 0.55)');
                ctx.fillStyle = ng;
            } else {
                const ng = ctx.createLinearGradient(x, y, x, y + nh);
                ng.addColorStop(0, 'rgba(223, 192, 122, 0.9)');
                ng.addColorStop(1, 'rgba(201, 162, 77, 0.8)');
                ctx.fillStyle = ng;
            }
            this._roundRect(ctx, x, y, nw, nh, 2.5);
            ctx.fill();

            // Top highlight
            ctx.fillStyle = voice >= ACCOMP_VOICE
                ? 'rgba(170, 100, 115, 0.6)'
                : 'rgba(240, 220, 160, 0.7)';
            this._roundRect(ctx, x, y, nw, Math.min(1.5, nh * 0.3), 1);
            ctx.fill();
        }

        // Playback cursor
        if (this.cursorBeat >= 0 && this.cursorBeat <= this.totalBeats) {
            const cx = margin.left + this.cursorBeat * beatW;
            // Cursor glow
            const cGrad = ctx.createLinearGradient(cx - 6, 0, cx + 6, 0);
            cGrad.addColorStop(0, 'rgba(201, 162, 77, 0)');
            cGrad.addColorStop(0.5, 'rgba(201, 162, 77, 0.15)');
            cGrad.addColorStop(1, 'rgba(201, 162, 77, 0)');
            ctx.fillStyle = cGrad;
            ctx.fillRect(cx - 6, margin.top, 12, plotH);
            // Cursor line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(cx, margin.top); ctx.lineTo(cx, h - margin.bottom); ctx.stroke();
        }
    }
}
