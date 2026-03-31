import { store } from '../../store.js';
import {
    curriculumBaseName,
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
export const VERSION_DROPDOWN_Z = '130';

/** Switch de versiones / timeline: chip + panel posicionado bajo el botón (JS). */
export function buildVersionSwitchHTML() {
        const state = store.value;
        const ui = store.ui;
        const src = state.activeSource;
        if (!src) return '';
        const releases = state.availableReleases || [];
        const vp = getVersionPresentation(src, releases, ui);
        const treeName = curriculumBaseName(src) || src.name || '—';
        const versionEyebrow = ui.releasesVersionsChip || ui.releasesSnapshot || 'Versions';
        const ariaLabel = `${versionEyebrow}: ${treeName} · ${vp.chipSub}`;

        let dropdownHtml = '';
        if (this._versionMenuOpen && !vp.isLocal) {
            const archives = releases.filter((r) => r.type === 'archive').sort((a, b) => b.url.localeCompare(a.url));
            const archiveRows = archives.length
                ? archives
                      .map((r) => {
                          const isActive = vp.isArchive && src.url === r.url;
                          return `
                        <button type="button" class="${VERSION_ARCHIVE_ITEM_CLASS} w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-xs font-bold transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}" data-json="${encodeURIComponent(JSON.stringify(r))}">
                            <span class="flex items-center gap-2"><span>📦</span><span>${r.year || r.name}</span></span>
                            ${isActive ? '<span>✔</span>' : ''}
                        </button>`;
                      })
                      .join('')
                : `<div class="p-4 text-center text-xs text-slate-400 italic">${ui.releasesEmpty || 'No versions found.'}</div>`;

            dropdownHtml = `
            <div id="${VERSION_DROPDOWN_ID}" class="arborito-version-dropdown arborito-version-dropdown--popover bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
                <div class="p-2 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">${ui.releasesTimeline || 'Timeline'}</div>
                <div class="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-1 space-y-1">
                    <button type="button" id="${VERSION_LIVE_ID}" class="w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-xs font-bold transition-colors ${vp.isRolling ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}">
                        <span class="flex items-center gap-2"><span>🌊</span><span>${ui.releasesLive || 'Live / Rolling'}</span></span>
                        ${vp.isRolling ? '<span>✔</span>' : ''}
                    </button>
                    ${archiveRows}
                </div>
                <div class="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-[9px] text-center text-slate-400 shrink-0">${ui.releasesSwitchHint || 'Switching reloads the tree.'}</div>
            </div>`;
        }

        if (vp.isLocal) {
            return `<div class="arborito-timeline-local-pill shrink-0 flex items-center gap-2 px-2.5 py-1 rounded-full border-2 shadow-sm text-[10px] font-black" data-arborito-version-kind="local" aria-label="${escAttr(`${vp.chipLabel}: ${vp.chipSub}`)}"><span class="text-sm" aria-hidden="true">${vp.icon}</span><span class="arborito-timeline-local-sub line-clamp-2 break-words max-w-[10rem]">${escHtml(vp.chipSub)}</span></div>`;
        }
        return `<div class="arborito-version-chip-host relative shrink-0 overflow-visible w-full min-w-0 md:w-auto">
                <button type="button" id="${VERSION_TOGGLE_ID}" class="arborito-timeline-chip arborito-timeline-chip--btn flex items-start gap-2 rounded-2xl border-2 shadow-sm px-2.5 py-2 min-w-0 w-full" data-arborito-version-kind="${vp.versionKind}" aria-expanded="${this._versionMenuOpen}" aria-haspopup="listbox" aria-label="${escAttr(ariaLabel)}">
                    <span class="text-lg leading-none shrink-0 mt-0.5" aria-hidden="true">${vp.icon}</span>
                    <span class="min-w-0 flex-1 text-left space-y-0.5">
                        <span class="block text-[8px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 leading-tight">${escHtml(versionEyebrow)}</span>
                        <span class="block text-[10px] font-semibold leading-snug line-clamp-2 break-words text-slate-700 dark:text-slate-200">${escHtml(treeName)}</span>
                        <span class="block text-[11px] font-bold leading-snug line-clamp-2 break-words">${escHtml(vp.chipSub)}</span>
                    </span>
                    <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 shrink-0 mt-1" aria-hidden="true">${this._versionMenuOpen ? '▲' : '▼'}</span>
                </button>
                ${dropdownHtml}
            </div>`;
    }

/** Menú de versiones anclado al botón (JS); en escritorio abre hacia abajo si hay espacio. */
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