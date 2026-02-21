/**
 * variation.js - Variation Studio: extend or rework famous compositions
 *
 * Modes:
 *   Extend  (continue)   — keep first N% of notes, generate the rest via CP
 *   Rework  (transform)  — apply inversion/retrograde/augmentation/diminution
 *                          and/or genre transfer
 */

export class VarySection {
    constructor() {
        this.pieces = {};
        this.genres = {};
        this.selectedPieceId = 'mozart_k545_theme';
        this.mode = 'continue';
    }

    init(pieces, genres) {
        this.pieces = pieces;
        this.genres = genres;
        this._renderPieceBrowser();
        this._populateGenreSelects();
        this._wireEvents();
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    _renderPieceBrowser() {
        const container = document.getElementById('piece-browser');
        container.innerHTML = '';

        for (const [, group] of Object.entries(this.pieces)) {
            const section = document.createElement('div');
            section.className = 'piece-group';

            const header = document.createElement('div');
            header.className = 'piece-group-header';
            header.textContent = group.name;
            section.appendChild(header);

            for (const piece of group.pieces) {
                const card = document.createElement('div');
                card.className = 'piece-card' + (piece.id === this.selectedPieceId ? ' active' : '');
                card.dataset.id = piece.id;
                card.innerHTML =
                    `<span class="piece-card-name">${piece.name}</span>` +
                    `<span class="piece-card-meta">${piece.notes} notes · ${piece.key}</span>`;
                card.addEventListener('click', () => this._selectPiece(piece.id));
                section.appendChild(card);
            }

            container.appendChild(section);
        }
    }

    _selectPiece(id) {
        this.selectedPieceId = id;
        document.querySelectorAll('.piece-card').forEach(c => {
            c.classList.toggle('active', c.dataset.id === id);
        });
    }

    _populateGenreSelects() {
        const baseOption = '<option value="">Original genre</option>';
        const genreOptions = baseOption + Object.entries(this.genres)
            .map(([id, g]) => `<option value="${id}">${g.name}</option>`)
            .join('');

        document.getElementById('vary-genre-select').innerHTML = genreOptions;
        document.getElementById('transform-genre-select').innerHTML = genreOptions;
    }

    // -------------------------------------------------------------------------
    // Event wiring
    // -------------------------------------------------------------------------

    _wireEvents() {
        // Mode selector
        document.querySelectorAll('#vary-mode-control button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#vary-mode-control button')
                    .forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.mode = btn.dataset.value;
                this._updateModeView();
            });
        });

        // Split slider
        const splitSlider = document.getElementById('split-slider');
        const splitValue = document.getElementById('split-value');
        splitSlider.addEventListener('input', () => {
            splitValue.textContent = `${splitSlider.value}%`;
        });

        // Vary randomness slider
        const randSlider = document.getElementById('vary-randomness-slider');
        const randValue = document.getElementById('vary-randomness-value');
        randSlider.addEventListener('input', () => {
            randValue.textContent = (randSlider.value / 100).toFixed(2);
        });
    }

    _updateModeView() {
        const isContinue = this.mode === 'continue';
        document.getElementById('continue-options').style.display = isContinue ? '' : 'none';
        document.getElementById('transform-options').style.display = isContinue ? 'none' : '';
    }

    // -------------------------------------------------------------------------
    // Request building
    // -------------------------------------------------------------------------

    getRequest() {
        const randomness = parseInt(document.getElementById('vary-randomness-slider').value) / 100;

        if (this.mode === 'continue') {
            return {
                mode: 'continue',
                piece: this.selectedPieceId,
                split: document.getElementById('split-slider').value,
                genre: document.getElementById('vary-genre-select').value,
                randomness,
            };
        } else {
            return {
                mode: 'transform',
                piece: this.selectedPieceId,
                technique: document.getElementById('technique-select').value,
                genre: document.getElementById('transform-genre-select').value,
                randomness,
            };
        }
    }

    validate() {
        if (!this.selectedPieceId) {
            return 'Please select a piece.';
        }
        if (this.mode === 'transform') {
            const technique = document.getElementById('technique-select').value;
            const genre = document.getElementById('transform-genre-select').value;
            if (!technique && !genre) {
                return 'Rework requires at least a technique or a target genre.';
            }
        }
        return null;
    }
}
