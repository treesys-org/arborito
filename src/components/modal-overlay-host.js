/**
 * Capa flotante por encima de <arborito-modals> (p. ej. texto legal CC sin desmontar Fuentes/bienvenida).
 */
import { store } from '../store.js';
import './modals/author-license.js';

class ArboritoModalOverlayHost extends HTMLElement {
    connectedCallback() {
        this._onState = () => this._paint();
        store.addEventListener('state-change', this._onState);
        this._paint();
    }

    disconnectedCallback() {
        store.removeEventListener('state-change', this._onState);
    }

    _paint() {
        const o = store.state.modalOverlay;
        if ((o && o.type) === 'author-license') {
            const key = JSON.stringify(o);
            if (this._key === key && this.querySelector('arborito-modal-author-license')) return;
            this._key = key;
            this.innerHTML = '<arborito-modal-author-license></arborito-modal-author-license>';
        } else {
            this._key = null;
            this.innerHTML = '';
        }
    }
}

customElements.define('arborito-modal-overlay-host', ArboritoModalOverlayHost);
