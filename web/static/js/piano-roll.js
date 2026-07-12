/**
 * piano-roll.js - Canvas note visualization with velocity-based colors and playback cursor
 */

import {
    timeSig, quartersPerBeat, quarterBeatsPerBar, noteStartBeat, noteDurBeats,
} from './timeline.js';

export class PianoRoll {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.notes = [];
        this.tempoChanges = [];
        this.ts = { beats: 4, beat_unit: 4 };
        this.totalBeats = 0;
        this.cursorBeat = -1;
        this._animFrame = null;

        // Selection state (for reroll)
        this.selection = null; // { bar_start, bar_end }
        this._dragStart = null;
        this.onSelectionChange = null; // callback(selection)

        // Wire drag-select
        this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
        this.canvas.addEventListener('mouseleave', () => this._cancelDrag());
    }

    setNotes(notes, tempoChanges, metadata) {
        this.notes = notes;
        this.tempoChanges = tempoChanges;
        this.ts = timeSig(metadata);
        if (notes.length === 0) return;

        // Calculate total beats (quarter-beats)
        let maxBeat = 0;
        for (const n of notes) {
            const startBeat = noteStartBeat(n, this.ts);
            const durBeats = noteDurBeats(n);
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
        if (r < 0.5) {
            ctx.fillRect(x, y, w, h);
            return;
        }
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

        // Background
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#0c1018');
        bg.addColorStop(0.5, '#0a0e14');
        bg.addColorStop(1, '#080b10');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        if (this.notes.length === 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.font = '13px "Source Sans 3", system-ui, sans-serif';
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
        minPitch = Math.max(0, minPitch - 3);
        maxPitch = Math.min(127, maxPitch + 3);
        const pitchRange = maxPitch - minPitch + 1;

        const margin = { left: 36, right: 12, top: 10, bottom: 10 };
        const plotW = w - margin.left - margin.right;
        const plotH = h - margin.top - margin.bottom;
        const beatW = plotW / Math.max(1, this.totalBeats);
        const noteH = Math.max(2, plotH / pitchRange);

        // Black key shading — highlight black keys with subtle background
        for (let p = minPitch; p <= maxPitch; p++) {
            const pc = p % 12;
            const isBlack = [1, 3, 6, 8, 10].includes(pc);
            const y = margin.top + plotH - (p - minPitch + 1) * noteH;
            if (isBlack) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.012)';
                ctx.fillRect(margin.left, y, plotW, noteH);
            }
        }

        // Octave C lines and labels
        ctx.lineWidth = 0.5;
        for (let p = minPitch; p <= maxPitch; p++) {
            if (p % 12 === 0) {
                const y = margin.top + plotH - (p - minPitch) * noteH;
                // Glow line
                ctx.strokeStyle = 'rgba(212, 168, 67, 0.08)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(w - margin.right, y); ctx.stroke();
                // Label
                ctx.fillStyle = 'rgba(212, 168, 67, 0.3)';
                ctx.font = '9px "Source Sans 3", system-ui, sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(`C${Math.floor(p / 12) - 1}`, margin.left - 5, y + 3);
            }
        }

        // Vertical bar lines (meter-aware: bars span quarterBeatsPerBar quarters)
        const qpBar = quarterBeatsPerBar(this.ts);
        const qpBeat = quartersPerBeat(this.ts);
        const totalBars = Math.ceil(this.totalBeats / qpBar);
        for (let bar = 0; bar <= totalBars; bar++) {
            const x = margin.left + bar * qpBar * beatW;
            const isMajor = bar % 4 === 0;
            ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.02)';
            ctx.lineWidth = isMajor ? 0.8 : 0.4;
            ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, h - margin.bottom); ctx.stroke();

            // Beat subdivisions (one line per meter beat)
            if (bar < totalBars) {
                for (let beat = 1; beat < this.ts.beats; beat++) {
                    const bx = x + beat * qpBeat * beatW;
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
                    ctx.lineWidth = 0.3;
                    ctx.beginPath(); ctx.moveTo(bx, margin.top); ctx.lineTo(bx, h - margin.bottom); ctx.stroke();
                }
            }
        }

        // Draw notes — two passes: glow then body
        const ACCOMP_VOICE = 10;

        // Pass 1: Glow layer
        ctx.save();
        for (const n of this.notes) {
            const startBeat = noteStartBeat(n, this.ts);
            const durBeats = noteDurBeats(n);
            const voice = n.voice || 1;
            const vel = (n.velocity || 80) / 127;

            const x = margin.left + startBeat * beatW;
            const nw = Math.max(3, durBeats * beatW - 1);
            const y = margin.top + plotH - (n.pitch - minPitch + 1) * noteH;
            const nh = Math.max(2, noteH - 1);

            const isAccomp = voice >= ACCOMP_VOICE;
            const glowAlpha = isAccomp ? vel * 0.15 : vel * 0.3;
            ctx.shadowColor = isAccomp
                ? `rgba(168, 68, 85, ${glowAlpha})`
                : `rgba(212, 168, 67, ${glowAlpha})`;
            ctx.shadowBlur = isAccomp ? 4 : 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;
            ctx.fillStyle = 'transparent';
            this._roundRect(ctx, x, y, nw, nh, 2.5);
            ctx.fill();
        }
        ctx.restore();

        // Pass 2: Note bodies
        for (const n of this.notes) {
            const startBeat = noteStartBeat(n, this.ts);
            const durBeats = noteDurBeats(n);
            const voice = n.voice || 1;
            const vel = (n.velocity || 80) / 127;

            const x = margin.left + startBeat * beatW;
            const nw = Math.max(3, durBeats * beatW - 1);
            const y = margin.top + plotH - (n.pitch - minPitch + 1) * noteH;
            const nh = Math.max(2, noteH - 1);
            const isAccomp = voice >= ACCOMP_VOICE;

            // Note gradient — velocity affects brightness
            const ng = ctx.createLinearGradient(x, y, x, y + nh);
            if (isAccomp) {
                const a1 = 0.35 + vel * 0.25;
                const a2 = 0.25 + vel * 0.2;
                ng.addColorStop(0, `rgba(180, 80, 100, ${a1})`);
                ng.addColorStop(1, `rgba(140, 55, 75, ${a2})`);
            } else {
                const a1 = 0.6 + vel * 0.35;
                const a2 = 0.5 + vel * 0.3;
                ng.addColorStop(0, `rgba(235, 200, 100, ${a1})`);
                ng.addColorStop(1, `rgba(200, 155, 60, ${a2})`);
            }
            ctx.fillStyle = ng;
            this._roundRect(ctx, x, y, nw, nh, 2.5);
            ctx.fill();

            // Top specular highlight
            if (nh > 3) {
                const hlAlpha = isAccomp ? 0.12 : 0.2;
                ctx.fillStyle = `rgba(255, 255, 255, ${hlAlpha})`;
                this._roundRect(ctx, x + 0.5, y, nw - 1, Math.min(1.5, nh * 0.25), 1);
                ctx.fill();
            }

            // Left edge accent for melody notes
            if (!isAccomp && nw > 6) {
                ctx.fillStyle = `rgba(255, 230, 150, ${vel * 0.4})`;
                this._roundRect(ctx, x, y, 2, nh, 1);
                ctx.fill();
            }
        }

        // Playback cursor
        if (this.cursorBeat >= 0 && this.cursorBeat <= this.totalBeats) {
            const cx = margin.left + this.cursorBeat * beatW;

            // Wide glow
            const cGrad = ctx.createLinearGradient(cx - 12, 0, cx + 12, 0);
            cGrad.addColorStop(0, 'rgba(212, 168, 67, 0)');
            cGrad.addColorStop(0.3, 'rgba(212, 168, 67, 0.06)');
            cGrad.addColorStop(0.5, 'rgba(212, 168, 67, 0.12)');
            cGrad.addColorStop(0.7, 'rgba(212, 168, 67, 0.06)');
            cGrad.addColorStop(1, 'rgba(212, 168, 67, 0)');
            ctx.fillStyle = cGrad;
            ctx.fillRect(cx - 12, margin.top, 24, plotH);

            // Cursor line with glow
            ctx.save();
            ctx.shadowColor = 'rgba(240, 200, 100, 0.5)';
            ctx.shadowBlur = 6;
            ctx.strokeStyle = 'rgba(255, 240, 200, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(cx, margin.top); ctx.lineTo(cx, h - margin.bottom); ctx.stroke();
            ctx.restore();

            // Top marker
            ctx.fillStyle = 'rgba(240, 200, 100, 0.8)';
            ctx.beginPath();
            ctx.moveTo(cx - 4, margin.top);
            ctx.lineTo(cx + 4, margin.top);
            ctx.lineTo(cx, margin.top + 6);
            ctx.closePath();
            ctx.fill();
        }

        // Draw selection overlay (for reroll)
        if (this.selection) {
            const { bar_start, bar_end } = this.selection;
            const qpb = quarterBeatsPerBar(this.ts);
            const startBeat = (bar_start - 1) * qpb;
            const endBeat = bar_end * qpb;
            const x1 = margin.left + (startBeat / this.totalBeats) * plotW;
            const x2 = margin.left + (endBeat / this.totalBeats) * plotW;
            ctx.fillStyle = 'rgba(102, 187, 106, 0.15)';
            ctx.fillRect(x1, margin.top, x2 - x1, plotH);
            ctx.strokeStyle = 'rgba(102, 187, 106, 0.6)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x1, margin.top, x2 - x1, plotH);
        }
    }

    _onMouseDown(e) {
        if (this.notes.length === 0) return;
        const rect = this.canvas.getBoundingClientRect();
        this._dragStart = e.clientX - rect.left;
        e.preventDefault();
    }

    _onMouseMove(e) {
        if (!this._dragStart) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        this._updateSelection(this._dragStart, x);
    }

    _onMouseUp(e) {
        if (!this._dragStart) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        this._updateSelection(this._dragStart, x);
        this._dragStart = null;
    }

    _cancelDrag() {
        this._dragStart = null;
    }

    _updateSelection(x1, x2) {
        const margin = { left: 36 };
        const plotW = this.canvas.clientWidth - margin.left - 12;
        const beat1 = ((x1 - margin.left) / plotW) * this.totalBeats;
        const beat2 = ((x2 - margin.left) / plotW) * this.totalBeats;
        const qpb = quarterBeatsPerBar(this.ts);
        const bar1 = Math.max(1, Math.floor(Math.min(beat1, beat2) / qpb) + 1);
        const bar2 = Math.max(bar1, Math.floor(Math.max(beat1, beat2) / qpb) + 1);
        this.selection = { bar_start: bar1, bar_end: bar2 };
        this.draw();
        if (this.onSelectionChange) this.onSelectionChange(this.selection);
    }

    clearSelection() {
        this.selection = null;
        this.draw();
        if (this.onSelectionChange) this.onSelectionChange(null);
    }

    getSelection() {
        return this.selection;
    }
}
