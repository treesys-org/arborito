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
