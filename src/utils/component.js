import { store } from '../store.js';

/**
 * Base class for Arborito custom elements: batched store subscription + safe teardown.
 * Optional `onState(detail)` runs on mount and on every `state-change` (detail === store snapshot).
 * Return `false` from `onState` to skip scheduling a paint for that event.
 */
export class ArboritoComponent extends HTMLElement {
    constructor() {
        super();
        this._arboritoRaf = null;
        this._onStore = this._onStore.bind(this);
    }

    connectedCallback() {
        store.addEventListener('state-change', this._onStore);
        if (typeof this.onState === 'function') {
            if (this.onState(store.value) !== false) {
                this.scheduleUpdate(true);
            }
        } else {
            this.scheduleUpdate(true);
        }
    }

    disconnectedCallback() {
        store.removeEventListener('state-change', this._onStore);
        if (this._arboritoRaf != null) {
            cancelAnimationFrame(this._arboritoRaf);
            this._arboritoRaf = null;
        }
        this.onDisconnected?.();
    }

    _onStore(ev) {
        const detail = ev.detail;
        if (typeof this.onState === 'function') {
            if (this.onState(detail) === false) return;
        }
        this.scheduleUpdate();
    }

    /** @param {boolean} [immediate] skip rAF once */
    scheduleUpdate(immediate = false) {
        if (immediate) {
            if (this._arboritoRaf != null) {
                cancelAnimationFrame(this._arboritoRaf);
                this._arboritoRaf = null;
            }
            this.update?.();
            return;
        }
        if (this._arboritoRaf != null) return;
        this._arboritoRaf = requestAnimationFrame(() => {
            this._arboritoRaf = null;
            this.update?.();
        });
    }

    get state() {
        return store.value;
    }

    get i18n() {
        return store.ui;
    }
}
