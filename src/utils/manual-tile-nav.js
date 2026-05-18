/**
 * Grouped tile navigation for embedded manual (Sage “What is Arborito?”).
 */

import { getManualSections } from './manual-sections.js';
import { escAttr, escHtml } from './html-escape.js';

/** @param {object} ui */
export function getManualTileGroups(ui) {
    return [
        {
            id: 'discover',
            label: ui.manualGroupDiscover || 'Descubrir',
            sectionIds: ['intro', 'nav', 'learn']
        },
        {
            id: 'play',
            label: ui.manualGroupPlay || 'Practicar',
            sectionIds: ['garden', 'arcade']
        },
        {
            id: 'create',
            label: ui.manualGroupCreate || 'Crear',
            sectionIds: ['construct', 'authoring']
        },
        {
            id: 'more',
            label: ui.manualGroupMore || 'Más',
            sectionIds: ['sage', 'data']
        }
    ];
}

/**
 * @param {object} ui
 * @param {string} [activeId]
 */
export function buildManualTileNavHtml(ui, activeId = 'intro') {
    const sections = getManualSections(ui);
    const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
    const groups = getManualTileGroups(ui);

    return groups
        .map((g) => {
            const tiles = g.sectionIds
                .filter((id) => byId[id])
                .map((id) => {
                    const s = byId[id];
                    const active = activeId === id;
                    return `<button type="button" class="manual-tile-btn flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border text-center min-h-[4.25rem] transition-all ${
                        active
                            ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 ring-2 ring-indigo-400/40 shadow-sm'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:border-indigo-300 dark:hover:border-indigo-600'
                    }" data-section="${escAttr(id)}">
                        <span class="text-xl leading-none" aria-hidden="true">${s.icon}</span>
                        <span class="text-[10px] font-bold leading-tight text-slate-700 dark:text-slate-200 line-clamp-2">${escHtml(s.title)}</span>
                    </button>`;
                })
                .join('');
            if (!tiles) return '';
            return `<div class="manual-tile-group mb-3 last:mb-0">
                <p class="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 m-0 mb-1.5 px-0.5">${escHtml(g.label)}</p>
                <div class="grid grid-cols-3 gap-1.5 sm:gap-2">${tiles}</div>
            </div>`;
        })
        .join('');
}
