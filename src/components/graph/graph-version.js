import { store } from '../../store.js';
import {
    curriculumTreeDisplayName,
    getVersionPresentation,
    applyReleaseSwitch,
    applyLiveSwitch
} from '../../utils/version-switch-logic.js';
import { escHtml, escAttr } from './graph-mobile.js';

export const VERSION_TOGGLE_ID = 'arborito-version-toggle';
export const VERSION_LIVE_ID = 'arborito-version-live';
export const VERSION_DROPDOWN_ID = 'arborito-version-dropdown-panel';
export const VERSION_DROPDOWN_BACKDROP_ID = 'arborito-version-dropdown-backdrop';
export const VERSION_ARCHIVE_ITEM_CLASS = 'arborito-version-archive-item';
/** Below modals (125) and inline search (131); above fixed chrome (~115). */
export const VERSION_DROPDOWN_Z = '135';

/** Version / timeline switch: chip + panel positioned under button (JS). */
export function buildVersionSwitchHTML() {
        // New unified control: one button opens one overlay with both Version + Tree.
        // The implementation lives in `graph-mobile.js` so it can reuse the existing tree switcher list/render/bind logic.
        if (typeof this.buildUnifiedCurriculumSwitcherHTML === 'function') {
            return this.buildUnifiedCurriculumSwitcherHTML();
        }

        // Fallback (should be rare): keep old behavior if the unified builder isn't available.
        const state = store.value;
        const ui = store.ui;
        const src = state.activeSource;
        if (!src) return '';
        const releases = state.availableReleases || [];
        const vp = getVersionPresentation(src, releases, ui);
        const treeName = curriculumTreeDisplayName(ui) || '—';
        const versionEyebrow =
            ui.releasesVersionUiTitle || ui.releasesStateVersion || ui.releasesVersionsChip || ui.releasesSnapshot || 'Version';
        const ariaLabel = `${versionEyebrow}: ${treeName} · ${vp.chipSub}`;
        const localBtn = `<button type="button" id="${VERSION_TOGGLE_ID}" class="arborito-timeline-local-pill shrink-0 flex items-center gap-2 px-2.5 py-1 rounded-full border-2 shadow-sm text-[10px] font-black" data-arborito-version-kind="local" aria-label="${escAttr(`${vp.chipLabel}: ${vp.chipSub}`)}" title="${escAttr(ui.releasesModalTitle || ui.menuVersion || 'Versions')}">
                <span class="text-sm" aria-hidden="true">${vp.icon}</span>
                <span class="min-w-0 flex flex-col items-start leading-tight max-w-[11rem]">
                    <span class="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">${escHtml(vp.chipLabel)}</span>
                    <span class="arborito-timeline-local-sub line-clamp-2 break-words">${escHtml(vp.chipSub)}</span>
                </span>
            </button>`;
        if (vp.isLocal) return localBtn;
        return `<div class="arborito-version-chip-host relative shrink-0 overflow-visible w-full min-w-0 md:w-auto">
            <button type="button" id="${VERSION_TOGGLE_ID}" class="arborito-timeline-chip arborito-timeline-chip--btn flex items-start gap-2 rounded-2xl border-2 shadow-sm px-2.5 py-2 min-w-0 w-full" data-arborito-version-kind="${vp.versionKind}" aria-expanded="${this._versionMenuOpen}" aria-haspopup="listbox" aria-label="${escAttr(ariaLabel)}">
                <span class="text-lg leading-none shrink-0 mt-0.5" aria-hidden="true">${vp.icon}</span>
                <span class="min-w-0 flex-1 text-left space-y-0.5">
                    <span class="block text-[8px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 leading-tight">${escHtml(versionEyebrow)}</span>
                    <span class="block text-[10px] font-semibold leading-snug line-clamp-2 break-words text-slate-700 dark:text-slate-200">${escHtml(
                        treeName
                    )}</span>
                    <span class="block text-[11px] font-bold leading-snug line-clamp-2 break-words">${escHtml(vp.chipSub)}</span>
                </span>
                <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 shrink-0 mt-1" aria-hidden="true">▼</span>
            </button>
        </div>`;
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
                '-webkit-overflow-scrolling:touch',
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
                '-webkit-overflow-scrolling:touch',
                'pointer-events:auto'
            ];
        }
        panel.style.cssText = styleLines.join(';');
    }

/** Velo visual en body (pointer-events: none) para no tapar el chip; el cierre va por document click. */
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
        this._mobileRenderKey = null;
        if (store.value.data) this.renderMobilePrototypeTree(store.value.data);
        this._syncMobileTreeUiLayer();
    }