import { shouldShowMobileUI } from './breakpoints.js';

/**
 * Shared chrome for dock “sheets” (search, arcade, …).
 *
 * How to use (no magic):
 * - Import `DOCK_SHEET_BODY_WRAP` and put that string on the `class` of the container
 *   directly under the hero row (← and title).
 * - Concrete content (lists, tabs, etc.) still lives in each modal.
 *
 * Examples in the repo: `modals/search.js` (dock mode), `modals/arcade-ui.js` (mobile `#modal-content`).
 */
export const DOCK_SHEET_BODY_WRAP =
    'flex-1 flex flex-col min-h-0 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]';

const MODAL_WIN_X_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" class="w-[1.125rem] h-[1.125rem]"><path d="M18 6 6 18M6 6l12 12"/></svg>';

function escModalAttr(s) {
    return String(s != null ? s : '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

/**
 * Close × button (popup window), to the right of the title in the header.
 * @param {object} ui - e.g. store.ui (uses `close` for aria-label)
 * @param {string} [extraClasses] - extra classes (e.g. `btn-close` for delegation in Arcade)
 * @param {{ tone?: 'inverse'; showOnMobile?: boolean }} [opts] - `inverse`: dark header; `showOnMobile`: show × on mobile (default off)
 */
export function modalWindowCloseXHtml(ui, extraClasses = 'btn-close', opts = {}) {
    if (!opts.showOnMobile && shouldShowMobileUI()) return '';
    const label = escModalAttr((ui && ui.close) || 'Close');
    const inv = opts.tone === 'inverse';
    const toneCls = inv ? ' arborito-modal-window-x--inverse' : '';
    const extra = extraClasses ? ` ${extraClasses}` : '';
    return `<button type="button" class="arborito-modal-window-x${extra} shrink-0${toneCls}" aria-label="${label}">${MODAL_WIN_X_SVG}</button>`;
}

/**
 * ← back arrow on mobile only (sheets / dock). On desktop centered windows close with ×.
 * @param {string} extraClasses - extra classes (e.g. `arborito-mmenu-back shrink-0`)
 * @param {{ tagClass?: string; ariaLabel?: string }} [opts] - tagClass: first button class (e.g. `btn-close-search`, `btn-release-back`)
 */
export function modalNavBackHtml(ui, extraClasses = 'arborito-mmenu-back shrink-0', opts = {}) {
    if (!shouldShowMobileUI()) return '';
    const label = escModalAttr(opts.ariaLabel || (ui && ui.navBack) || (ui && ui.close) || 'Back');
    const tag = opts.tagClass || 'btn-close';
    return `<button type="button" class="${tag} ${extraClasses}" aria-label="${label}">←</button>`;
}
