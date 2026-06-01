import { store } from '../../../core/store.js';
import { fileSystem } from '../../backup-export/filesystem.js';
import { bindMobileTap } from '../../../shared/ui/mobile-tap.js';
import {
    escHtml,
    CURRICULUM_SWITCHER_BTN_ID,
    TREE_SWITCHER_BTN_ID,
    TREE_SWITCHER_PANEL_ID,
    TREE_SWITCHER_BACKDROP_ID,
    TREE_SWITCHER_SEARCH_ID,
    TREE_SWITCHER_LIST_ID,
    TREE_SWITCHER_MORE_ID,
    TREE_SWITCHER_ITEM_CLASS
} from './graph-mobile-shared.js';
import {
    VERSION_TOGGLE_ID,
    VERSION_LIVE_ID,
    VERSION_DROPDOWN_ID,
    VERSION_DROPDOWN_BACKDROP_ID,
    VERSION_ARCHIVE_ITEM_CLASS
} from '../../version-updates/version-graph-helpers.js';

// Re-exported so callers using `Object.assign(prototype, ...)` continue to get
// `bindMobileTap` as a prototype method (used by `this.bindMobileTap(...)` in
// the graph-mobile-tree-* sibling modules).
export { bindMobileTap };

export function _onDocClickCurriculum(e) {
        if (!this._versionMenuOpen && !this._treeSwitcherOpen) return;
        const t = e.target;
        const chrome = this.querySelector('#arborito-curriculum-chrome');
        const panel = document.getElementById(VERSION_DROPDOWN_ID);
        const inVersion =
            (typeof t.closest === 'function' &&
                t.closest(
                    `#${CURRICULUM_SWITCHER_BTN_ID}, #${TREE_SWITCHER_BTN_ID}, #${TREE_SWITCHER_PANEL_ID}, #${TREE_SWITCHER_BACKDROP_ID}, #${TREE_SWITCHER_SEARCH_ID}, #${TREE_SWITCHER_LIST_ID}, #${TREE_SWITCHER_MORE_ID}, .${TREE_SWITCHER_ITEM_CLASS}, #${VERSION_TOGGLE_ID}, #${VERSION_DROPDOWN_ID}, #${VERSION_DROPDOWN_BACKDROP_ID}, .${VERSION_ARCHIVE_ITEM_CLASS}, #${VERSION_LIVE_ID}, .mobile-panel-version-slot, .arborito-tree-switcher-chip, .arborito-tree-switcher-host, .arborito-curriculum-switcher-host`
                )) ||
            chrome?.contains(t) ||
            panel?.contains(t);
        if (inVersion) return;
        if (this._versionMenuOpen) {
            this._versionMenuOpen = false;
        }
        if (this._treeSwitcherOpen) {
            this._treeSwitcherOpen = false;
        }
        this.invalidateMobilePrototypeKeys();
        if (store.value.data) this.renderMobilePrototypeTree(store.value.data);
    }

export function getMobileTone(node) {
        if (!node || !node.type) return 'branch';
        if (node.type === 'root') return 'root';
        if (node.type === 'exam') return 'exam';
        if (node.type === 'leaf') return 'leaf';
        return 'branch';
    }


export function _syncMobileTreeUiLayer() {
        if (!this.mobileTreeUI) return;
        this.mobileTreeUI.classList.toggle('arborito-version-dropdown-open', this._versionMenuOpen);
    }

export function refreshCurriculumChrome() {
        if (!store.value.data) return;
        this.renderMobileTopBanner();
        this._syncMobileTreeUiLayer();
        this.invalidateMobilePrototypeKeys();
        this.renderMobilePrototypeTree(store.value.data);
    }


export function renderMobileTopBanner() {
        const el = this.querySelector('#mobile-overlays');
        if (!el) return;
        el.className =
            'absolute top-0 left-0 right-0 z-40 flex flex-col items-center pointer-events-none px-3';
        el.style.paddingTop = 'max(0.35rem, env(safe-area-inset-top))';

        const ui = store.ui;
        const pendingId = this.pendingMoveNodeId;
        if (pendingId && store.value.constructionMode && fileSystem.features.canWrite) {
            const moving = store.findNode(pendingId);
            if (moving && moving.type !== 'root') {
                el.style.display = 'flex';
                const hint =
                    ui.movePickOnTreeHint ||
                    ui.movePickOnTreeBanner ||
                    'Open the destination folder, then tap Move here.';
                const name = moving.name || '';
                el.innerHTML = `
                <div class="arborito-move-pick-banner pointer-events-auto w-full max-w-xl rounded-xl border border-amber-500/45 bg-amber-50 dark:bg-amber-950/88 text-amber-950 dark:text-amber-50 px-3 py-2 shadow-lg flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <p class="text-xs font-bold leading-snug m-0">${escHtml(hint)}${name ? ` <span class="font-black">${escHtml(name)}</span>` : ''}</p>
                    <button type="button" class="arborito-move-pick-cancel shrink-0 text-xs font-black uppercase tracking-wide px-3 py-1.5 rounded-lg bg-amber-200/90 dark:bg-amber-900/75 text-amber-950 dark:text-amber-100 border border-amber-700/15">${escHtml(
                        ui.cancel || 'Cancel'
                    )}</button>
                </div>`;
                el.querySelector('.arborito-move-pick-cancel')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.pendingMoveNodeId = null;
                    this.invalidateMobilePrototypeKeys();
                    this.renderMobileTopBanner();
                    if (store.value.data) this.renderMobilePrototypeTree(store.value.data);
                });
                return;
            }
            this.pendingMoveNodeId = null;
        }

        el.innerHTML = '';
        el.style.display = 'none';
    }
