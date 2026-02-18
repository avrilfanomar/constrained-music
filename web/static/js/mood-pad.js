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
        this.handleRadius = 11;

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
        const hw = w / 2;
        const hh = h / 2;

        // Quadrant color fills (soft, muted tones)
        // Top-left: Stressed (negative valence, high arousal) — muted red/warm
        ctx.fillStyle = 'rgba(140, 70, 80, 0.12)';
        ctx.fillRect(0, 0, hw, hh);
        // Top-right: Excited (positive valence, high arousal) — warm gold
        ctx.fillStyle = 'rgba(190, 160, 60, 0.1)';
        ctx.fillRect(hw, 0, hw, hh);
        // Bottom-left: Sad (negative valence, low arousal) — cool blue
        ctx.fillStyle = 'rgba(50, 70, 110, 0.12)';
        ctx.fillRect(0, hh, hw, hh);
        // Bottom-right: Calm (positive valence, low arousal) — soft green-blue
        ctx.fillStyle = 'rgba(60, 120, 100, 0.08)';
        ctx.fillRect(hw, hh, hw, hh);

        // Soft radial overlay to blend quadrants
        const blend = ctx.createRadialGradient(hw, hh, 0, hw, hh, w * 0.55);
        blend.addColorStop(0, 'rgba(30, 45, 66, 0.2)');
        blend.addColorStop(1, 'rgba(22, 34, 50, 0.85)');
        ctx.fillStyle = blend;
        ctx.fillRect(0, 0, w, h);

        // Grid lines (very subtle)
        ctx.strokeStyle = 'rgba(180, 195, 215, 0.06)';
        ctx.lineWidth = 0.5;
        for (let i = 1; i < 10; i++) {
            const p = (i / 10) * w;
            ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke();
        }

        // Axis lines
        ctx.strokeStyle = 'rgba(180, 195, 215, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(hw, 0); ctx.lineTo(hw, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, hh); ctx.lineTo(w, hh); ctx.stroke();

        // Axis labels
        ctx.fillStyle = 'rgba(180, 195, 215, 0.4)';
        ctx.font = '10px "Source Sans 3", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Positive', w * 0.75, h - 5);
        ctx.fillText('Negative', w * 0.25, h - 5);
        ctx.save();
        ctx.translate(11, hh);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('High Energy', 0, 0);
        ctx.restore();
        ctx.save();
        ctx.translate(11, hh);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Low Energy', -h * 0.4, 0);
        ctx.restore();

        // Quadrant labels (softer)
        ctx.fillStyle = 'rgba(180, 195, 215, 0.18)';
        ctx.font = '600 10px "Source Sans 3", sans-serif';
        ctx.fillText('Stressed', w * 0.25, 16);
        ctx.fillText('Excited', w * 0.75, 16);
        ctx.fillText('Sad', w * 0.25, h - 16);
        ctx.fillText('Calm', w * 0.75, h - 16);

        // Preset dots
        ctx.font = '8px "Source Sans 3", sans-serif';
        for (const [name, { valence, arousal }] of Object.entries(this.presets)) {
            const pp = this._vaToPixel(valence, arousal);
            ctx.beginPath();
            ctx.arc(pp.x, pp.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(180, 195, 215, 0.2)';
            ctx.fill();
        }

        // Transition line
        const sp = this._vaToPixel(this.start.v, this.start.a);
        const ep = this._vaToPixel(this.end.v, this.end.a);
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(200, 185, 140, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(ep.x, ep.y); ctx.stroke();
        ctx.setLineDash([]);

        // Arrow at end
        const angle = Math.atan2(ep.y - sp.y, ep.x - sp.x);
        const arrowLen = 9;
        ctx.fillStyle = 'rgba(200, 185, 140, 0.5)';
        ctx.beginPath();
        ctx.moveTo(ep.x, ep.y);
        ctx.lineTo(ep.x - arrowLen * Math.cos(angle - 0.3), ep.y - arrowLen * Math.sin(angle - 0.3));
        ctx.lineTo(ep.x - arrowLen * Math.cos(angle + 0.3), ep.y - arrowLen * Math.sin(angle + 0.3));
        ctx.closePath();
        ctx.fill();

        // Start handle (warm gold)
        this._drawHandle(sp.x, sp.y, '#C9A24D', '#A6832E', 'S');

        // End handle (burgundy)
        this._drawHandle(ep.x, ep.y, '#7A3640', '#5C2830', 'E');
    }

    _drawHandle(x, y, color, shadowColor, label) {
        const ctx = this.ctx;
        const r = this.handleRadius;

        // Glow
        ctx.save();
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();

        // Outer ring
        ctx.beginPath();
        ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Inner fill gradient
        const grad = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, r);
        grad.addColorStop(0, color);
        grad.addColorStop(1, shadowColor);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 10px "Source Sans 3", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
        ctx.textBaseline = 'alphabetic';
    }
}
