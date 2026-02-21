/**
 * mood-pad.js - 2D Valence-Arousal canvas with draggable start/end handles
 * Dark theme with rich gradients and glowing handles
 */

export class MoodPad {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;

        // Start (gold) and End (teal) handles in VA space (-1 to 1)
        this.start = { v: -0.5, a: -0.3 };
        this.end = { v: 0.5, a: 0.6 };
        this.presets = {};
        this.dragging = null; // 'start' | 'end' | null
        this.handleRadius = 12;
        this.hoverHandle = null;

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

    _hitTest(pos) {
        const sp = this._vaToPixel(this.start.v, this.start.a);
        const ep = this._vaToPixel(this.end.v, this.end.a);
        const ds = Math.hypot(pos.x - sp.x, pos.y - sp.y);
        const de = Math.hypot(pos.x - ep.x, pos.y - ep.y);
        if (ds < this.handleRadius + 6) return 'start';
        if (de < this.handleRadius + 6) return 'end';
        return null;
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

        const startDrag = (e) => {
            const pos = getPos(e);
            this.dragging = this._hitTest(pos);
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
            const pos = getPos(e);
            // Update hover state
            const newHover = this._hitTest(pos);
            if (newHover !== this.hoverHandle) {
                this.hoverHandle = newHover;
                this.canvas.style.cursor = newHover ? 'grab' : 'crosshair';
                if (!this.dragging) this.draw();
            }
            if (!this.dragging) return;
            e.preventDefault();
            this.canvas.style.cursor = 'grabbing';
            this._updateHandle(pos);
        };

        const endDrag = () => {
            this.dragging = null;
            this.canvas.style.cursor = this.hoverHandle ? 'grab' : 'crosshair';
        };

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

        // Deep dark background
        ctx.fillStyle = '#0a0e15';
        ctx.fillRect(0, 0, w, h);

        // Quadrant color fills — rich, saturated tints
        // Top-left: Stressed (negative valence, high arousal) — warm red
        const tlGrad = ctx.createRadialGradient(hw * 0.5, hh * 0.5, 0, hw * 0.5, hh * 0.5, hw * 0.8);
        tlGrad.addColorStop(0, 'rgba(180, 50, 60, 0.18)');
        tlGrad.addColorStop(1, 'rgba(180, 50, 60, 0)');
        ctx.fillStyle = tlGrad;
        ctx.fillRect(0, 0, hw, hh);

        // Top-right: Excited (positive valence, high arousal) — warm amber/gold
        const trGrad = ctx.createRadialGradient(hw * 1.5, hh * 0.5, 0, hw * 1.5, hh * 0.5, hw * 0.8);
        trGrad.addColorStop(0, 'rgba(220, 170, 40, 0.15)');
        trGrad.addColorStop(1, 'rgba(220, 170, 40, 0)');
        ctx.fillStyle = trGrad;
        ctx.fillRect(hw, 0, hw, hh);

        // Bottom-left: Sad (negative valence, low arousal) — deep blue
        const blGrad = ctx.createRadialGradient(hw * 0.5, hh * 1.5, 0, hw * 0.5, hh * 1.5, hw * 0.8);
        blGrad.addColorStop(0, 'rgba(40, 70, 160, 0.18)');
        blGrad.addColorStop(1, 'rgba(40, 70, 160, 0)');
        ctx.fillStyle = blGrad;
        ctx.fillRect(0, hh, hw, hh);

        // Bottom-right: Calm (positive valence, low arousal) — teal/green
        const brGrad = ctx.createRadialGradient(hw * 1.5, hh * 1.5, 0, hw * 1.5, hh * 1.5, hw * 0.8);
        brGrad.addColorStop(0, 'rgba(40, 150, 130, 0.14)');
        brGrad.addColorStop(1, 'rgba(40, 150, 130, 0)');
        ctx.fillStyle = brGrad;
        ctx.fillRect(hw, hh, hw, hh);

        // Center vignette — subtle dark gradient
        const vignette = ctx.createRadialGradient(hw, hh, hw * 0.15, hw, hh, w * 0.75);
        vignette.addColorStop(0, 'rgba(15, 20, 30, 0)');
        vignette.addColorStop(1, 'rgba(8, 10, 16, 0.4)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);

        // Fine dot grid
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        for (let gx = 0; gx <= 10; gx++) {
            for (let gy = 0; gy <= 10; gy++) {
                const px = (gx / 10) * w;
                const py = (gy / 10) * h;
                ctx.beginPath();
                ctx.arc(px, py, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Axis lines — subtle glow
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(hw, 0); ctx.lineTo(hw, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, hh); ctx.lineTo(w, hh); ctx.stroke();

        // Axis labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.font = '10px "Source Sans 3", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Positive \u2192', w * 0.78, h - 6);
        ctx.fillText('\u2190 Negative', w * 0.22, h - 6);
        ctx.save();
        ctx.translate(12, hh);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('High Energy \u2191', h * 0.22, 0);
        ctx.restore();
        ctx.save();
        ctx.translate(12, hh);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('\u2193 Low Energy', -h * 0.22, 0);
        ctx.restore();

        // Quadrant mood labels
        ctx.font = '600 10px "Source Sans 3", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(180, 50, 60, 0.35)';
        ctx.fillText('Stressed', w * 0.25, 18);
        ctx.fillStyle = 'rgba(220, 170, 40, 0.35)';
        ctx.fillText('Excited', w * 0.75, 18);
        ctx.fillStyle = 'rgba(60, 90, 180, 0.35)';
        ctx.fillText('Sad', w * 0.25, h - 18);
        ctx.fillStyle = 'rgba(40, 150, 130, 0.35)';
        ctx.fillText('Calm', w * 0.75, h - 18);

        // Preset dots with labels on hover
        for (const [name, { valence, arousal }] of Object.entries(this.presets)) {
            const pp = this._vaToPixel(valence, arousal);
            // Outer glow
            ctx.beginPath();
            ctx.arc(pp.x, pp.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.fill();
            // Core dot
            ctx.beginPath();
            ctx.arc(pp.x, pp.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fill();
        }

        // Transition path — curved dashed line with gradient
        const sp = this._vaToPixel(this.start.v, this.start.a);
        const ep = this._vaToPixel(this.end.v, this.end.a);

        // Glow behind the line
        ctx.save();
        ctx.shadowColor = 'rgba(212, 168, 67, 0.2)';
        ctx.shadowBlur = 8;
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = 'rgba(212, 168, 67, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        // Slight curve through midpoint
        const mx = (sp.x + ep.x) / 2;
        const my = (sp.y + ep.y) / 2 - 15;
        ctx.moveTo(sp.x, sp.y);
        ctx.quadraticCurveTo(mx, my, ep.x, ep.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Arrow at end
        const angle = Math.atan2(ep.y - my, ep.x - mx);
        const arrowLen = 10;
        ctx.fillStyle = 'rgba(212, 168, 67, 0.5)';
        ctx.beginPath();
        ctx.moveTo(ep.x, ep.y);
        ctx.lineTo(ep.x - arrowLen * Math.cos(angle - 0.35), ep.y - arrowLen * Math.sin(angle - 0.35));
        ctx.lineTo(ep.x - arrowLen * Math.cos(angle + 0.35), ep.y - arrowLen * Math.sin(angle + 0.35));
        ctx.closePath();
        ctx.fill();

        // Start handle (warm gold)
        const startHover = this.hoverHandle === 'start' || this.dragging === 'start';
        this._drawHandle(sp.x, sp.y, '#d4a843', '#a07820', 'S', startHover);

        // End handle (teal)
        const endHover = this.hoverHandle === 'end' || this.dragging === 'end';
        this._drawHandle(ep.x, ep.y, '#3a9e8f', '#2a7a6d', 'E', endHover);
    }

    _hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    _drawHandle(x, y, color, darkColor, label, isHover) {
        const ctx = this.ctx;
        const r = this.handleRadius;
        const glowR = isHover ? r + 8 : r + 4;

        // Outer glow ring
        ctx.save();
        const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, glowR + 6);
        glow.addColorStop(0, this._hexToRgba(color, 0.3));
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, glowR + 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Pulse ring on hover
        if (isHover) {
            ctx.strokeStyle = this._hexToRgba(color, 0.15);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(x, y, r + 6, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Main circle with gradient fill
        const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        grad.addColorStop(0, color);
        grad.addColorStop(0.7, color);
        grad.addColorStop(1, darkColor);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Subtle border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Top highlight (specular)
        ctx.beginPath();
        ctx.arc(x, y - r * 0.3, r * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fill();

        // Label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 10px "Source Sans 3", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y + 0.5);
        ctx.textBaseline = 'alphabetic';
    }
}
