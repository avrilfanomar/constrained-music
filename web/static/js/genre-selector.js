/**
 * genre-selector.js - Genre card rendering and selection
 */

export class GenreSelector {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.genres = {};
        this.selected = 'classical_period';
        this.onchange = null;
    }

    setGenres(genres) {
        this.genres = genres;
        this._render();
    }

    getSelected() { return this.selected; }

    _render() {
        this.container.innerHTML = '';
        for (const [id, genre] of Object.entries(this.genres)) {
            const card = document.createElement('button');
            card.className = 'genre-card' + (id === this.selected ? ' active' : '');
            card.dataset.genre = id;
            card.title = genre.description;

            const name = document.createElement('span');
            name.className = 'genre-card-name';
            name.textContent = genre.name;
            card.appendChild(name);

            card.addEventListener('click', () => {
                this.selected = id;
                this._updateActive();
                if (this.onchange) this.onchange(id);
            });

            this.container.appendChild(card);
        }
    }

    _updateActive() {
        this.container.querySelectorAll('.genre-card').forEach(card => {
            card.classList.toggle('active', card.dataset.genre === this.selected);
        });
    }
}
