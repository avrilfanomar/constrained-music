/**
 * constraint-panel.js - Collapsible categorized constraint weight sliders
 */

export class ConstraintPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.constraints = [];
        this.categories = [];
        this.genreWeights = {};
        this.currentGenre = null;
        // State: { constraintId: { enabled: bool, weight: number } }
        this.state = {};
    }

    init(constraints, categories, genreWeights) {
        this.constraints = constraints;
        this.categories = categories;
        this.genreWeights = genreWeights;
    }

    setGenre(genreId) {
        this.currentGenre = genreId;
        const weights = this.genreWeights[genreId] || {};
        // Reset state: enable constraints that have a weight in this genre
        this.state = {};
        for (const c of this.constraints) {
            const gw = weights[c.id];
            this.state[c.id] = {
                enabled: gw !== undefined && gw > 0,
                weight: gw !== undefined ? gw : c.default_weight,
            };
        }
        this._render();
    }

    resetToGenre() {
        if (this.currentGenre) this.setGenre(this.currentGenre);
    }

    /** Returns { disabled_constraints: [...], weight_overrides: {...} } */
    getOverrides() {
        const disabled = [];
        const overrides = {};
        const genreW = this.genreWeights[this.currentGenre] || {};

        for (const c of this.constraints) {
            const st = this.state[c.id];
            if (!st) continue;
            const genreHas = genreW[c.id] !== undefined;

            if (genreHas && !st.enabled) {
                disabled.push(c.id);
            } else if (st.enabled) {
                const defaultW = genreW[c.id] ?? c.default_weight;
                if (st.weight !== defaultW) {
                    overrides[c.id] = st.weight;
                }
            }
        }
        return { disabled_constraints: disabled, weight_overrides: overrides };
    }

    _render() {
        this.container.innerHTML = '';
        const grouped = {};
        for (const cat of this.categories) {
            grouped[cat.id] = { name: cat.name, items: [] };
        }
        for (const c of this.constraints) {
            const catId = c.category;
            if (!grouped[catId]) grouped[catId] = { name: catId, items: [] };
            grouped[catId].items.push(c);
        }

        for (const [catId, cat] of Object.entries(grouped)) {
            if (cat.items.length === 0) continue;
            const section = document.createElement('div');
            section.className = 'constraint-category';

            const header = document.createElement('div');
            header.className = 'constraint-category-header';
            const arrow = document.createElement('span');
            arrow.className = 'arrow open';
            arrow.textContent = '\u25B6';
            const title = document.createElement('span');
            title.textContent = cat.name;
            const count = document.createElement('span');
            count.className = 'count';
            count.textContent = `(${cat.items.length})`;
            header.append(arrow, title, count);

            const list = document.createElement('div');
            list.className = 'constraint-list';

            for (const c of cat.items) {
                list.appendChild(this._renderConstraint(c));
            }

            header.addEventListener('click', () => {
                list.classList.toggle('collapsed');
                arrow.classList.toggle('open');
            });

            section.append(header, list);
            this.container.appendChild(section);
        }
    }

    _renderConstraint(c) {
        const st = this.state[c.id] || { enabled: false, weight: c.default_weight };
        const item = document.createElement('div');
        item.className = 'constraint-item' + (st.enabled ? '' : ' disabled');

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = st.enabled;

        const name = document.createElement('span');
        name.className = 'constraint-name';
        name.textContent = c.label || c.id.replace(/_/g, ' ');
        name.title = c.description;

        const weightDiv = document.createElement('div');
        weightDiv.className = 'constraint-weight';
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = st.weight;
        slider.disabled = !st.enabled;

        const val = document.createElement('span');
        val.className = 'weight-val';
        val.textContent = st.weight;

        cb.addEventListener('change', () => {
            this.state[c.id].enabled = cb.checked;
            slider.disabled = !cb.checked;
            item.classList.toggle('disabled', !cb.checked);
        });

        slider.addEventListener('input', () => {
            this.state[c.id].weight = parseInt(slider.value);
            val.textContent = slider.value;
        });

        weightDiv.append(slider);
        item.append(cb, name, weightDiv, val);
        return item;
    }
}
