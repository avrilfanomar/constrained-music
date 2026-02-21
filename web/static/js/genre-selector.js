/**
 * genre-selector.js - Genre card rendering and selection with era indicators
 */

const GENRE_ERAS = {
    classical_period: '1750\u20131820',
    baroque: '1600\u20131750',
    romantic: '1820\u20131900',
    traditional_jazz: '1920s+',
    folk_traditional: 'Traditional',
    contemporary: '20th C+',
    sacred_chant: 'Medieval',
    children_songs: 'Universal',
    minimalist: '1960s+',
    modal: '1880\u20131920',
    blues: '1900s+',
    galant: '1720\u20131770',
    high_classical: '1770\u20131800',
    sturm_und_drang: '1760\u20131780',
};

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

            const era = GENRE_ERAS[id];
            if (era) {
                const eraSpan = document.createElement('span');
                eraSpan.className = 'genre-era';
                eraSpan.textContent = era;
                card.appendChild(eraSpan);
            }

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
