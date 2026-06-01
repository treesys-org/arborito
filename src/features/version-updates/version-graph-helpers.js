import { store } from '../../core/store.js';

export const VERSION_TOGGLE_ID = 'arborito-version-toggle';
export const VERSION_LIVE_ID = 'arborito-version-live';
export const VERSION_DROPDOWN_ID = 'arborito-version-dropdown-panel';
export const VERSION_DROPDOWN_BACKDROP_ID = 'arborito-version-dropdown-backdrop';
export const VERSION_ARCHIVE_ITEM_CLASS = 'arborito-version-archive-item';
/** Below modals (125) and inline search (131); above fixed chrome (~115). */
const VERSION_DROPDOWN_Z = '135';

/**
 * Version / timeline switch: chip + panel positioned under button (JS).
 * Delegates to the unified curriculum switcher (Version + Tree in one overlay)
 * implemented in `sources/modals/curriculum-switcher.js`, which is mixed into
 * the same prototype.
 */
export function buildVersionSwitchHTML() {
    return this.buildUnifiedCurriculumSwitcherHTML();
}

/** Version menu anchored to button (JS); on desktop opens downward when space allows. */
export function positionVersionDropdownPanel() {
        const panel =
            this.querySelector(`#${VERSION_DROPDOWN_ID}`) || document.getElementById(VERSION_DROPDOWN_ID);
        const btn = this.querySelector(`#${VERSION_TOGGLE_ID}`);
        if (!panel || !btn || !this._versionMenuOpen) {
            this._clearVersionDropdownPanelStyles();
            return;
        }

        this._ensureVersionDropdownBackdrop();

        if (panel.parentElement !== document.body) {
            document.body.appendChild(panel);
            panel.classList.add('arborito-version-dropdown--portaled');
        }

        const r = btn.getBoundingClientRect();
        const margin = 10;
        const gap = 8;
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const spaceAbove = r.top - margin;
        const spaceBelow = vh - r.bottom - margin;
        const isDesktop = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 768px)').matches;
        const panelW = Math.min(isDesktop ? 22 * 16 : 19 * 16, vw - 2 * margin);
        let left = r.left + r.width / 2 - panelW / 2;
        left = Math.max(margin, Math.min(left, vw - margin - panelW));

        const preferBelow =
            isDesktop && spaceBelow >= 160 && spaceBelow + 24 >= spaceAbove;

        let maxH;
        let styleLines;
        if (preferBelow) {
            maxH = Math.max(168, Math.min(spaceBelow - gap, vh * 0.58));
            styleLines = [
                'position:fixed',
                `left:${left}px`,
                `width:${panelW}px`,
                `top:${r.bottom + gap}px`,
                'bottom:auto',
                `max-height:${maxH}px`,
                `z-index:${VERSION_DROPDOWN_Z}`,
                'overflow:auto',
                'pointer-events:auto'
            ];
        } else {
            maxH = Math.max(140, Math.min(spaceAbove - gap, vh * 0.5));
            styleLines = [
                'position:fixed',
                `left:${left}px`,
                `width:${panelW}px`,
                `bottom:${vh - r.top + gap}px`,
                'top:auto',
                `max-height:${maxH}px`,
                `z-index:${VERSION_DROPDOWN_Z}`,
                'overflow:auto',
                'pointer-events:auto'
            ];
        }
        panel.style.cssText = styleLines.join(';');
    }

/** Visual veil on body (pointer-events: none) so it doesn't cover the chip; closing happens via document click. */
export function _ensureVersionDropdownBackdrop() {
        let el = document.getElementById(VERSION_DROPDOWN_BACKDROP_ID);
        if (!el) {
            el = document.createElement('div');
            el.id = VERSION_DROPDOWN_BACKDROP_ID;
            el.className = 'arborito-version-dropdown-backdrop';
            el.setAttribute('aria-hidden', 'true');
            document.body.appendChild(el);
        }
        return el;
    }


export function _clearVersionDropdownPanelStyles() {
        document.getElementById(VERSION_DROPDOWN_BACKDROP_ID)?.remove();
        const panel = document.getElementById(VERSION_DROPDOWN_ID);
        if (panel) panel.remove();
    }


export function afterVersionSwitchCloseMenu() {
        this._versionMenuOpen = false;
        this._clearVersionDropdownPanelStyles();
        this.invalidateMobilePrototypeKeys();
        if (store.value.data) this.renderMobilePrototypeTree(store.value.data);
        this._syncMobileTreeUiLayer();
    }
