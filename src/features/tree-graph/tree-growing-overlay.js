/**
 * "Tree is growing…" loading state, in two flavours:
 *
 *  1. **Blocking** (online tree load / publish): a full-viewport dimmed
 *     backdrop with a centred "Please wait" card. Pointer events are
 *     captured so the user cannot click around the app while the network
 *     fetch + parse are in flight (clicking elsewhere during a Nostr pull
 *     used to fire off a second mount and produced racing states). This is
 *     the explicit "block the rest of the app and show 'please wait'"
 *     behaviour requested for slow Nostr operations.
 *
 *  2. **Compact toast** (local tree load): the previous small top-centre
 *     pill. Local loads are instant; a blocking modal would just flash and
 *     be jarring. Same 250ms delay-then-show trick, ignores pointer events.
 *
 * The mode is decided by which flag is true in the store:
 *   • `publishingTree` or `treeGrowingOverlay` → BLOCKING
 *       (only the three Sources actions that pull from the network set
 *        `treeGrowingOverlay`; local mounts only set `treeHydrating`).
 *   • `treeHydrating` only             → compact toast (local).
 *
 * Lifecycle (single source of truth = the store):
 *   • Sources action dispatch sets `state.treeGrowingOverlay = true` right
 *     before calling `store.loadData(...)` for install-source / global-open
 *     / load-source (the only paths that hit Nostr / WebTorrent).
 *   • `mountCurriculum`'s `finally` clears both flags together so we cover
 *     happy path AND every error rollback without per-call cleanup.
 *
 * Styles are inline (single `<style>` block injected once on first paint) so
 * the component is fully self-contained — no rebuild of `main.css` needed
 * just to ship this widget.
 */
import { store } from '../../core/store.js';
import { escHtml } from '../../shared/lib/html-escape.js';

const STYLE_ID = 'arborito-tree-growing-overlay-style';

const STYLE_CSS = `
/* ---------------- Compact toast (local / fast loads) ---------------- */
.arborito-tree-growing-toast {
    position: fixed;
    top: max(1rem, env(safe-area-inset-top, 0px));
    left: 50%;
    transform: translateX(-50%);
    z-index: 10000;
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.9rem;
    max-width: min(22rem, calc(100vw - 2rem));
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.96);
    color: rgb(15 118 110);
    border: 1px solid rgba(20, 184, 166, 0.3);
    box-shadow: 0 8px 22px rgb(15 23 42 / 0.18);
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.3;
    pointer-events: none;
    /* Don't pop instantly: most loads complete in under a second on good
     * connections, so we delay the show by ~250ms. If the load already
     * finished by then, we never appear at all — the previous fullscreen
     * version flashing for a frame is exactly what the user reported as
     * "scary". */
    animation: arborito-tree-growing-toast-in 200ms ease-out 250ms both;
}
html.dark .arborito-tree-growing-toast {
    background: rgba(6, 38, 30, 0.94);
    color: rgb(167 243 208);
    border-color: rgba(45, 212, 191, 0.3);
    box-shadow: 0 8px 22px rgb(0 0 0 / 0.45);
}
.arborito-tree-growing-toast__spinner {
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 9999px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    flex-shrink: 0;
    animation: arborito-tree-growing-spin 0.85s linear infinite;
}
.arborito-tree-growing-toast__text {
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ---------------- Blocking overlay (online / publish) --------------- */
.arborito-tree-growing-block {
    position: fixed;
    inset: 0;
    z-index: 100000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
    background: rgba(241, 245, 249, 0.78);
    -webkit-backdrop-filter: blur(2px);
    backdrop-filter: blur(2px);
    /* IMPORTANT: capture pointer events to disable the rest of the UI while
     * the network fetch is in flight. */
    pointer-events: auto;
    cursor: progress;
    animation: arborito-tree-growing-block-in 180ms ease-out 250ms both;
}
html.dark .arborito-tree-growing-block {
    background: rgba(2, 6, 23, 0.75);
}
.arborito-tree-growing-block__card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1.5rem 1.75rem;
    min-width: min(20rem, calc(100vw - 3rem));
    max-width: 26rem;
    border-radius: 1rem;
    background: rgb(255 255 255);
    color: rgb(15 118 110);
    border: 1px solid rgba(20, 184, 166, 0.35);
    box-shadow: 0 18px 48px rgb(15 23 42 / 0.28);
    text-align: center;
    cursor: default;
}
html.dark .arborito-tree-growing-block__card {
    background: rgb(6 38 30);
    color: rgb(167 243 208);
    border-color: rgba(45, 212, 191, 0.4);
    box-shadow: 0 18px 48px rgb(0 0 0 / 0.55);
}
.arborito-tree-growing-block__spinner {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 9999px;
    border: 3px solid currentColor;
    border-right-color: transparent;
    animation: arborito-tree-growing-spin 0.85s linear infinite;
}
.arborito-tree-growing-block__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.25;
}
.arborito-tree-growing-block__subtitle {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 500;
    line-height: 1.35;
    opacity: 0.85;
}

@keyframes arborito-tree-growing-spin {
    to { transform: rotate(360deg); }
}
@keyframes arborito-tree-growing-toast-in {
    from { opacity: 0; transform: translate(-50%, -0.4rem); }
    to   { opacity: 1; transform: translate(-50%, 0); }
}
@keyframes arborito-tree-growing-block-in {
    from { opacity: 0; }
    to   { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
    .arborito-tree-growing-toast__spinner,
    .arborito-tree-growing-block__spinner { animation: none !important; }
    .arborito-tree-growing-toast,
    .arborito-tree-growing-block { animation: none !important; opacity: 1; }
}
`;

function ensureStyleInjected() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE_CSS;
    document.head.appendChild(style);
}

class ArboritoTreeGrowingOverlay extends HTMLElement {
    connectedCallback() {
        ensureStyleInjected();
        this._onState = () => this._paint();
        store.addEventListener('state-change', this._onState);
        this._paint();
    }

    disconnectedCallback() {
        if (this._onState) {
            store.removeEventListener('state-change', this._onState);
            this._onState = null;
        }
        if (this._scrollLocked) {
            document.body.style.removeProperty('overflow');
            this._scrollLocked = false;
        }
    }

    /**
     * Returns the current mode:
     *   • 'block'  — full-viewport blocking overlay (online tree load / publish).
     *   • 'toast'  — compact non-blocking pill (local tree load).
     *   • null     — nothing to show.
     */
    _currentMode() {
        const s = store.state || {};
        if (s.publishingTree) return 'block';
        // `treeGrowingOverlay: true` is only set by the three Sources actions
        // that pull from the network (install-source / global-open / load-source).
        if (s.treeGrowingOverlay) return 'block';
        // Plain `treeHydrating` (no overlay flag) means local mount — instant,
        // fall back to the compact toast so we don't blank the screen for it.
        if (s.treeHydrating && s.treeGrowingOverlay !== false) return 'toast';
        return null;
    }

    _currentText() {
        const s = store.state || {};
        const ui = store.ui || {};
        if (s.publishingTree) {
            return ui.publishingTreeShort || ui.publishingTreeTitle || 'Publishing tree\u2026';
        }
        return ui.treeGrowingShort || ui.treeGrowingTitle || 'Loading tree\u2026';
    }

    _paint() {
        const mode = this._currentMode();
        const nextText = mode ? this._currentText() : '';
        const stateKey = mode ? `${mode}::${nextText}` : '';
        if (!mode) {
            if (this._painted) {
                this.innerHTML = '';
                this._painted = false;
                this._lastKey = '';
                // Re-enable scrolling that the blocking overlay may have suppressed.
                if (this._scrollLocked) {
                    document.body.style.removeProperty('overflow');
                    this._scrollLocked = false;
                }
            }
            return;
        }
        /* Re-render only when the mode or visible text changes (publish→done→load
         * transitions): avoids re-triggering the entry animation on every
         * unrelated `state-change` event. */
        if (this._painted && this._lastKey === stateKey) return;

        if (mode === 'block') {
            const ui = store.ui || {};
            const title = ui.treeGrowingPleaseWait || 'Please wait';
            const subtitle = nextText;
            this.innerHTML = `
                <div class="arborito-tree-growing-block" role="dialog" aria-modal="true" aria-busy="true" aria-live="polite">
                    <div class="arborito-tree-growing-block__card">
                        <span class="arborito-tree-growing-block__spinner" aria-hidden="true"></span>
                        <p class="arborito-tree-growing-block__title">${escHtml(title)}</p>
                        <p class="arborito-tree-growing-block__subtitle">${escHtml(subtitle)}</p>
                    </div>
                </div>`;
            if (!this._scrollLocked) {
                document.body.style.overflow = 'hidden';
                this._scrollLocked = true;
            }
        } else {
            this.innerHTML = `
                <div class="arborito-tree-growing-toast" role="status" aria-live="polite" aria-busy="true">
                    <span class="arborito-tree-growing-toast__spinner" aria-hidden="true"></span>
                    <p class="arborito-tree-growing-toast__text">${escHtml(nextText)}</p>
                </div>`;
            if (this._scrollLocked) {
                document.body.style.removeProperty('overflow');
                this._scrollLocked = false;
            }
        }
        this._painted = true;
        this._lastKey = stateKey;
    }
}

customElements.define('arborito-tree-growing-overlay', ArboritoTreeGrowingOverlay);
