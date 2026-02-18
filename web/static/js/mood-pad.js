/**
 * mood-pad.js - 2D Valence-Arousal canvas with draggable start/end handles
 */

export class MoodPad {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;

        // Start (gold) and End (burgundy) handles in VA space (-1 to 1)
        this.start = { v: -0.5, a: -0.3 };
        this.end = { v: 0.5, a: 0.6 };
        this.presets = {};
        this.dragging = null; // 'start' | 'end' | null
        this.handleRadius = 10;

        this.onchange = null; // callback

        this._bindEvents();
        this.draw();
    }

    setPresets(presets) {
        this.presets = presets;
        this.draw();
    }

    getStart() { return { ...this.start }; }
    getEnd() { return { ...this.end }; }

    // Convert VA (-1..1) to canvas pixel coords
    _vaToPixel(v, a) {
        const x = ((v + 1) / 2) * this.width;
        const y = ((1 - a) / 2) * this.height; // arousal up = canvas top
        return { x, y };
    }

    // Convert canvas pixel to VA
    _pixelToVA(x, y) {
        const v = (x / this.width) * 2 - 1;
        const a = 1 - (y / this.height) * 2;
        return {
            v: Math.max(-1, Math.min(1, Math.round(v * 20) / 20)),
            a: Math.max(-1, Math.min(1, Math.round(a * 20) / 20)),
        };
    }

    _bindEvents() {
        const getPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: (clientX - rect.left) * (this.width / rect.width),
                y: (clientY - rect.top) * (this.height / rect.height),
            };
        };

        const hitTest = (pos) => {
            const sp = this._vaToPixel(this.start.v, this.start.a);
            const ep = this._vaToPixel(this.end.v, this.end.a);
            const ds = Math.hypot(pos.x - sp.x, pos.y - sp.y);
            const de = Math.hypot(pos.x - ep.x, pos.y - ep.y);
            if (ds < this.handleRadius + 4) return 'start';
            if (de < this.handleRadius + 4) return 'end';
            return null;
        };

        const startDrag = (e) => {
            const pos = getPos(e);
            this.dragging = hitTest(pos);
            if (!this.dragging) {
                // Click on empty area: move the nearest handle
                const sp = this._vaToPixel(this.start.v, this.start.a);
                const ep = this._vaToPixel(this.end.v, this.end.a);
                const ds = Math.hypot(pos.x - sp.x, pos.y - sp.y);
                const de = Math.hypot(pos.x - ep.x, pos.y - ep.y);
                this.dragging = ds < de ? 'start' : 'end';
            }
            this._updateHandle(pos);
        };

        const moveDrag = (e) => {
            if (!this.dragging) return;
            e.preventDefault();
            this._updateHandle(getPos(e));
        };

        const endDrag = () => { this.dragging = null; };

        this.canvas.addEventListener('mousedown', startDrag);
        this.canvas.addEventListener('mousemove', moveDrag);
        window.addEventListener('mouseup', endDrag);

        this.canvas.addEventListener('touchstart', startDrag, { passive: false });
        this.canvas.addEventListener('touchmove', moveDrag, { passive: false });
        window.addEventListener('touchend', endDrag);
    }

    _updateHandle(pos) {
        const va = this._pixelToVA(pos.x, pos.y);
        if (this.dragging === 'start') {
            this.start.v = va.v;
            this.start.a = va.a;
        } else if (this.dragging === 'end') {
            this.end.v = va.v;
            this.end.a = va.a;
        }
        this.draw();
        if (this.onchange) this.onchange(this.start, this.end);
    }

    draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // Background gradient
        const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
        bg.addColorStop(0, '#1F3157');
        bg.addColorStop(1, '#1B2A4A');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        // Grid lines
        ctx.strokeStyle = 'rgba(212, 168, 67, 0.12)';
        ctx.lineWidth = 0.5;
        for (let i = 1; i < 10; i++) {
            const p = (i / 10) * w;
            ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke();
        }

        // Axis lines
        ctx.strokeStyle = 'rgba(212, 168, 67, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

        // Axis labels
        ctx.fillStyle = 'rgba(212, 168, 67, 0.5)';
        ctx.font = '11px "Source Sans 3", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Positive', w * 0.75, h - 6);
        ctx.fillText('Negative', w * 0.25, h - 6);
        ctx.save();
        ctx.translate(12, h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('High Energy', 0, 0);
        ctx.restore();
        ctx.save();
        ctx.translate(12, h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Low Energy', -h * 0.4, 0);
        ctx.restore();

        // Quadrant labels
        ctx.fillStyle = 'rgba(200, 208, 220, 0.2)';
        ctx.font = '10px "Source Sans 3", sans-serif';
        ctx.fillText('Stressed', w * 0.25, 16);
        ctx.fillText('Excited', w * 0.75, 16);
        ctx.fillText('Sad', w * 0.25, h - 16);
        ctx.fillText('Calm', w * 0.75, h - 16);

        // Preset dots
        ctx.font = '9px "Source Sans 3", sans-serif';
        for (const [name, { valence, arousal }] of Object.entries(this.presets)) {
            const pp = this._vaToPixel(valence, arousal);
            ctx.beginPath();
            ctx.arc(pp.x, pp.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(200, 208, 220, 0.3)';
            ctx.fill();
        }

        // Transition line
        const sp = this._vaToPixel(this.start.v, this.start.a);
        const ep = this._vaToPixel(this.end.v, this.end.a);
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(212, 168, 67, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(ep.x, ep.y); ctx.stroke();
        ctx.setLineDash([]);

        // Arrow at end
        const angle = Math.atan2(ep.y - sp.y, ep.x - sp.x);
        const arrowLen = 10;
        ctx.fillStyle = 'rgba(212, 168, 67, 0.6)';
        ctx.beginPath();
        ctx.moveTo(ep.x, ep.y);
        ctx.lineTo(ep.x - arrowLen * Math.cos(angle - 0.3), ep.y - arrowLen * Math.sin(angle - 0.3));
        ctx.lineTo(ep.x - arrowLen * Math.cos(angle + 0.3), ep.y - arrowLen * Math.sin(angle + 0.3));
        ctx.closePath();
        ctx.fill();

        // Start handle (gold)
        this._drawHandle(sp.x, sp.y, '#D4A843', 'S');

        // End handle (burgundy)
        this._drawHandle(ep.x, ep.y, '#722F37', 'E');
    }

    _drawHandle(x, y, color, label) {
        const ctx = this.ctx;
        const r = this.handleRadius;

        // Outer ring
        ctx.beginPath();
        ctx.arc(x, y, r + 2, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Fill
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Label
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px "Source Sans 3", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
        ctx.textBaseline = 'alphabetic';
    }
}
