import { shouldShowMobileUI } from './breakpoints.js';

/**
 * Shared chrome for dock “sheets” (search, arcade, …).
 *
 * How to use (no magic):
 * - Import `DOCK_SHEET_BODY_WRAP` and put that string on the `class` of the container
 *   directly under the hero row (← and title).
 * - Concrete content (lists, tabs, etc.) still lives in each modal.
 *
 * Examples: `modals/arcade-ui.js`, `modals/sources.js`, `modals/certificates.js`, `progress-widget.js`.
 */
export const DOCK_SHEET_BODY_WRAP =
    'flex-1 flex flex-col min-h-0 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]';

/** Scroll host under a dock sheet hero (More, construction More, Sage menu…). */
export const DOCK_SHEET_SCROLL = 'arborito-mob-scroll-pane custom-scrollbar';

/**
 * Mobile dock building blocks (React):
 * - MobDockBar, bottom nav shell (wrap → nav.arborito-mob-dock)
 * - MobDockTab, one tab button inside the bar
 * - MobMoreSheet, More menu backdrop + sheet + scroll host
 *
 * Lesson editor toolbar (construction): LessonEditorToolbarBridge.jsx + lesson-toc-nav.css
 * Team hub: ContributorHubShell.jsx + contributor-hub-chrome.js (CONTRIBUTOR_HUB_BODY_SCROLL)
 * Publish hub: ConstructionAboutModal.jsx + publish-hub-chrome.js (PUBLISH_HUB_BODY_SCROLL)
 */

/** Scroll host + standard sheet padding (replaces `p-6` on dock/sage panes). */
export const DOCK_SHEET_SCROLL_PAD = `${DOCK_SHEET_SCROLL} arborito-mob-scroll-pane--pad-lg`;

/** Shared desktop panel size token for hub modals (Arcade, Biblioteca, Logros…). */
export { MODAL_PANEL_SIZE } from './modal-panel-size.js';

/** Desktop hub scroll pane (under headbar + optional tab strip). */
export const DOCK_HUB_BODY_SCROLL = 'arborito-dock-hub-body__scroll custom-scrollbar';

/** Toolbar row under hub headbar (search, filters). */
export const DOCK_HUB_TOOLBAR = 'arborito-dock-hub-toolbar shrink-0';

/** Mochila mobile sheet, same DOM family as browse-dock-hub (DockHubSheet). */
export const PROGRESS_DOCK_BACKDROP_ID = 'progress-dock-backdrop';
export const PROGRESS_DOCK_SHEET_ID = 'progress-dock-sheet';

/** `<html>` classes while panel sheets cover the dock (Mochila / Cambiar, not Buscar). */
export const PROGRESS_MODAL_HTML_CLASS = 'arborito-progress-modal-open';
export const TREE_SWITCHER_SHEET_HTML_CLASS = 'arborito-tree-switcher-sheet-open';

/** Toggle fullbleed panel chrome on `<html>` (hides dock; sheet runs edge-to-edge). */
export function syncPanelSheetFullbleedClass(className, open) {
    if (typeof document === 'undefined' || !className) return;
    document.documentElement.classList.toggle(className, !!open);
}

/**
 * Shared inner shell for dock hub modals (Arcade, Biblioteca, Logros, Progreso…).
 * @param {{ heroHtml: string, bodyHtml: string, toolbarHtml?: string, mobile?: boolean, rootClass?: string, skipBodyWrap?: boolean }} parts
 * `skipBodyWrap`, skip padded scroll host (mobile sheet wrap or desktop hub scroll).
 */
export function dockHubShellHtml(parts) {
    const mob = parts.mobile == null ? shouldShowMobileUI() : !!parts.mobile;
    const toolbar = parts.toolbarHtml || '';
    const extra = parts.rootClass ? ` ${parts.rootClass}` : '';
    if (mob) {
        const bodyWrap = parts.skipBodyWrap
            ? parts.bodyHtml
            : `<div class="${DOCK_SHEET_BODY_WRAP} overflow-y-auto custom-scrollbar">${parts.bodyHtml}</div>`;
        return `<div class="arborito-dock-hub-shell flex flex-col flex-1 min-h-0 h-full overflow-hidden${extra}">${parts.heroHtml}${toolbar}${bodyWrap}</div>`;
    }
    const desktopBase =
        'arborito-dock-hub-body arborito-float-modal-card__inner flex flex-col min-h-0 flex-1 relative';
    const desktopRoot = parts.rootClass ? `${desktopBase} ${parts.rootClass}` : desktopBase;
    const bodyWrap = parts.skipBodyWrap
        ? parts.bodyHtml
        : `<div class="${DOCK_HUB_BODY_SCROLL}">${parts.bodyHtml}</div>`;
    return `<div class="${desktopRoot}">${parts.heroHtml}${toolbar}${bodyWrap}</div>`;
}

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
    const chevron =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="w-5 h-5"><path d="M15 6l-6 6 6 6"/></svg>';
    return `<button type="button" class="${tag} ${extraClasses}" aria-label="${label}">${chevron}</button>`;
}
