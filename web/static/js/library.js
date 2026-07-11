/**
 * library.js - Piece library tab: list, play, star, rename, export, delete,
 * and "another take" (regenerate with the same settings).
 */

export class Library {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.pieces = [];
        this.exports = { midi: true, musicxml: true, wav: false, mp3: false };

        // Callbacks wired by app.js
        this.onload = null;        // (pieceData, meta) => {}  play a piece
        this.onregenerate = null;  // (id) => {}               another take
    }

    setExports(exports) {
        this.exports = exports || this.exports;
    }

    async refresh() {
        try {
            const resp = await fetch('/api/library');
            const data = await resp.json();
            this.pieces = data.pieces || [];
        } catch (e) {
            this.pieces = [];
        }
        this.render();
    }

    render() {
        this.container.innerHTML = '';
        if (this.pieces.length === 0) {
            const p = document.createElement('p');
            p.className = 'library-empty';
            p.textContent = 'Nothing here yet — compose something first.';
            this.container.appendChild(p);
            return;
        }

        for (const piece of this.pieces) {
            this.container.appendChild(this._renderRow(piece));
        }
    }

    _renderRow(piece) {
        const row = document.createElement('div');
        row.className = 'library-row' + (piece.starred ? ' starred' : '');
        row.dataset.id = piece.id;

        // Star toggle
        const star = document.createElement('button');
        star.className = 'lib-star' + (piece.starred ? ' on' : '');
        star.title = piece.starred ? 'Unstar' : 'Star this take';
        star.textContent = piece.starred ? '★' : '☆';
        star.addEventListener('click', async () => {
            await this._patch(piece.id, { starred: !piece.starred });
        });

        // Name (click to rename)
        const name = document.createElement('span');
        name.className = 'lib-name';
        name.textContent = piece.name;
        name.title = 'Click to rename';
        name.addEventListener('click', () => this._startRename(piece, name));

        // Details line
        const detailBits = [];
        if (piece.key_name) detailBits.push(piece.key_name);
        if (piece.genre && piece.genre !== 'none') {
            detailBits.push(String(piece.genre).replace(/_/g, ' '));
        }
        if (piece.base_tempo) detailBits.push(`${piece.base_tempo} BPM`);
        if (piece.duration) detailBits.push(`${piece.duration}s`);
        const created = piece.created ? piece.created.replace('T', ' ').slice(0, 16) : '';
        if (created) detailBits.push(created);
        const details = document.createElement('span');
        details.className = 'lib-details';
        details.textContent = detailBits.join(' · ');

        // Actions
        const actions = document.createElement('div');
        actions.className = 'lib-actions';

        const playBtn = this._actionBtn('▶ Play', 'Load into the player', async () => {
            const resp = await fetch(`/api/library/${piece.id}`);
            if (!resp.ok) return alert('Could not load piece');
            const data = await resp.json();
            if (this.onload) this.onload(data, piece);
        });
        actions.appendChild(playBtn);

        if (piece.kind === 'generate') {
            actions.appendChild(this._actionBtn('↻ Another take', 'Regenerate with the same settings', () => {
                if (this.onregenerate) this.onregenerate(piece.id);
            }));
        }

        for (const [fmt, label] of [['midi', 'MIDI'], ['musicxml', 'MusicXML'], ['wav', 'WAV'], ['mp3', 'MP3']]) {
            if (!this.exports[fmt]) continue;
            actions.appendChild(this._actionBtn('⬇ ' + label, `Download ${label}`, () => {
                window.location.href = `/api/library/${piece.id}/export/${fmt}`;
            }));
        }

        // Two-click delete: first click arms the button, second confirms
        const delBtn = this._actionBtn('✕', 'Delete this take', async () => {
            if (!delBtn.classList.contains('armed')) {
                delBtn.classList.add('armed');
                delBtn.textContent = 'Delete?';
                setTimeout(() => {
                    delBtn.classList.remove('armed');
                    delBtn.textContent = '✕';
                }, 3000);
                return;
            }
            await fetch(`/api/library/${piece.id}`, { method: 'DELETE' });
            await this.refresh();
        });
        delBtn.classList.add('lib-delete');
        actions.appendChild(delBtn);

        const main = document.createElement('div');
        main.className = 'lib-main';
        const nameLine = document.createElement('div');
        nameLine.className = 'lib-name-line';
        nameLine.appendChild(star);
        nameLine.appendChild(name);
        main.appendChild(nameLine);
        main.appendChild(details);

        row.appendChild(main);
        row.appendChild(actions);
        return row;
    }

    _actionBtn(label, title, handler) {
        const btn = document.createElement('button');
        btn.className = 'btn-small lib-action';
        btn.textContent = label;
        btn.title = title;
        btn.addEventListener('click', handler);
        return btn;
    }

    _startRename(piece, nameEl) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'lib-rename-input';
        input.value = piece.name;
        input.maxLength = 120;
        nameEl.replaceWith(input);
        input.focus();
        input.select();

        const commit = async () => {
            const newName = input.value.trim();
            if (newName && newName !== piece.name) {
                await this._patch(piece.id, { name: newName });
            } else {
                this.render();
            }
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') { input.value = piece.name; input.blur(); }
        });
        input.addEventListener('blur', commit, { once: true });
    }

    async _patch(id, body) {
        await fetch(`/api/library/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        await this.refresh();
    }
}
