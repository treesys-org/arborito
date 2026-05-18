/**
 * Drill-down guide for Sage «¿Qué es Arborito?» — hub → group → section.
 * Breadcrumb navigation only (no duplicate back buttons).
 */

import { escAttr, escHtml } from './html-escape.js';
import { getManualTileGroups } from './manual-tile-nav.js';
import { getManualSections, renderManualSectionHtml } from './manual-sections.js';

/** @returns {{ level: 'hub'|'group'|'section', groupId?: string, sectionId?: string }} */
export function defaultSageGuideNav() {
    return { level: 'hub' };
}

const GROUP_ICONS = {
    discover: '🧭',
    play: '🎯',
    create: '🛠️',
    more: '✨'
};

/** @param {object} ui @param {string} groupId */
function sageGroupHint(ui, groupId) {
    const key = `sageGuideGroup${groupId.charAt(0).toUpperCase()}${groupId.slice(1)}Hint`;
    const fallbacks = {
        discover: ui.manualGroupDiscoverHint || 'Mapa, nodos del árbol y cómo estudiar lecciones',
        play: ui.manualGroupPlayHint || 'Mochila, semillas, racha y juegos del Arcade',
        create: ui.manualGroupCreateHint || 'Modo construcción y autoría de cursos',
        more: ui.manualGroupMoreHint || 'Sage, datos locales y sincronización opcional'
    };
    return ui[key] || fallbacks[groupId] || '';
}

/** @param {object} ui @param {string} sectionId */
function sageSectionHint(ui, sectionId) {
    const key = `sageGuideSection${sectionId.charAt(0).toUpperCase()}${sectionId.slice(1)}Hint`;
    const fallbacks = {
        intro: ui.manualIntroText || '',
        nav: ui.manualNavDesc || '',
        learn: ui.manualLearnDesc || '',
        garden: ui.manualGardenDesc || '',
        arcade: ui.manualArcadeDesc || '',
        sage: ui.manualSageIntro || '',
        construct: ui.manualConstructDesc || '',
        authoring: ui.manualAuthoringDesc || '',
        data: ui.manualDataDesc || ''
    };
    const raw = ui[key] || fallbacks[sectionId] || '';
    const t = String(raw).trim();
    if (t.length <= 100) return t;
    return `${t.slice(0, 97)}…`;
}

/**
 * @param {object} ui
 * @param {{ level: string, groupId?: string, sectionId?: string }} nav
 */
function buildBreadcrumb(ui, nav) {
    const hubLbl = ui.sageGuideBreadcrumbHub || ui.manualTitle || 'Guía';
    const level = nav?.level || 'hub';
    const groups = getManualTileGroups(ui);
    const sections = getManualSections(ui);
    const byId = Object.fromEntries(sections.map((s) => [s.id, s]));

    const crumbs = [];
    crumbs.push(
        `<button type="button" class="sage-guide-crumb rounded-md px-1 py-0.5 text-indigo-600 dark:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800${level === 'hub' ? ' is-current text-slate-800 dark:text-slate-100 font-bold pointer-events-none' : ''}" data-guide-nav="hub">${escHtml(hubLbl)}</button>`
    );

    if (level === 'group' || level === 'section') {
        const group = groups.find((g) => g.id === nav.groupId);
        if (group) {
            crumbs.push(`<span class="sage-guide-crumb-sep opacity-50" aria-hidden="true">›</span>`);
            crumbs.push(
                `<button type="button" class="sage-guide-crumb rounded-md px-1 py-0.5 text-indigo-600 dark:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800${level === 'group' ? ' is-current text-slate-800 dark:text-slate-100 font-bold pointer-events-none' : ''}" data-guide-nav="group" data-group="${escAttr(group.id)}">${escHtml(group.label)}</button>`
            );
        }
    }

    if (level === 'section' && nav.sectionId) {
        const sec = byId[nav.sectionId];
        if (sec) {
            crumbs.push(`<span class="sage-guide-crumb-sep opacity-50" aria-hidden="true">›</span>`);
            crumbs.push(`<span class="sage-guide-crumb text-slate-800 dark:text-slate-100 font-bold truncate max-w-[10rem]">${escHtml(sec.title)}</span>`);
        }
    }

    return `<nav class="sage-guide-breadcrumb shrink-0 flex flex-wrap items-center gap-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400 pb-2 mb-2 border-b border-slate-200/80 dark:border-slate-700/80" aria-label="${escAttr(ui.sageGuideBreadcrumbAria || 'Guía Arborito')}">${crumbs.join('')}</nav>`;
}

/**
 * @param {object} ui
 * @param {{ level: string, groupId?: string, sectionId?: string }} nav
 */
export function buildSageGuideDrillHtml(ui, nav) {
    const n = nav || defaultSageGuideNav();
    const level = n.level || 'hub';
    const breadcrumb = buildBreadcrumb(ui, n);

    if (level === 'section' && n.sectionId) {
        return `${breadcrumb}
        <div class="sage-guide-stage flex flex-col min-h-0 flex-1 overflow-hidden">
            <div class="sage-guide-stage__scroll flex-1 min-h-0 overflow-y-auto custom-scrollbar prose prose-sm prose-slate dark:prose-invert max-w-none px-0.5 py-1">
                ${renderManualSectionHtml(ui, n.sectionId)}
            </div>
        </div>`;
    }

    if (level === 'group' && n.groupId) {
        const groups = getManualTileGroups(ui);
        const sections = getManualSections(ui);
        const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
        const group = groups.find((g) => g.id === n.groupId);
        if (!group) return buildSageGuideDrillHtml(ui, defaultSageGuideNav());
        const tiles = group.sectionIds
            .filter((id) => byId[id])
            .map((id) => {
                const s = byId[id];
                const hint = sageSectionHint(ui, id);
                return `<button type="button" class="sage-guide-tile sage-guide-section-tile w-full flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all text-left active:scale-[0.99]" data-section="${escAttr(id)}">
                    <span class="text-2xl leading-none shrink-0" aria-hidden="true">${s.icon}</span>
                    <span class="min-w-0 flex-1">
                        <span class="block text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">${escHtml(s.title)}</span>
                        ${hint ? `<span class="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">${escHtml(hint)}</span>` : ''}
                    </span>
                    <span class="text-slate-400 shrink-0" aria-hidden="true">›</span>
                </button>`;
            })
            .join('');
        return `${breadcrumb}
        <div class="sage-guide-stage flex flex-col min-h-0 flex-1 overflow-hidden">
            <p class="text-xs text-slate-500 dark:text-slate-400 m-0 mb-2 shrink-0 leading-relaxed">${escHtml(sageGroupHint(ui, group.id))}</p>
            <div class="sage-guide-stage__scroll flex flex-col gap-2 min-h-0 flex-1 overflow-y-auto custom-scrollbar">${tiles}</div>
        </div>`;
    }

    const groups = getManualTileGroups(ui);
    const hubTiles = groups
        .map((g) => {
            const icon = GROUP_ICONS[g.id] || '📚';
            const hint = sageGroupHint(ui, g.id);
            return `<button type="button" class="sage-guide-tile sage-guide-group-tile w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-gradient-to-r from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-lg transition-all text-left active:scale-[0.99]" data-group="${escAttr(g.id)}">
                <span class="text-3xl leading-none shrink-0" aria-hidden="true">${icon}</span>
                <span class="min-w-0 flex-1">
                    <span class="block text-sm font-black text-slate-800 dark:text-slate-100">${escHtml(g.label)}</span>
                    ${hint ? `<span class="block text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">${escHtml(hint)}</span>` : ''}
                </span>
                <span class="text-slate-400 shrink-0 text-lg" aria-hidden="true">›</span>
            </button>`;
        })
        .join('');

    const hubIntro = (ui.sageTreeAboutIntro || ui.manualIntroText || '').trim();
    return `${breadcrumb}
    <div class="sage-guide-stage flex flex-col min-h-0 flex-1 overflow-hidden">
        ${hubIntro ? `<p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed m-0 mb-3 shrink-0">${escHtml(hubIntro)}</p>` : ''}
        <p class="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 m-0 mb-2 shrink-0">${escHtml(ui.manualChooseTopic || 'Elegí un tema')}</p>
        <div class="sage-guide-stage__scroll flex flex-col gap-2.5 min-h-0 flex-1 overflow-y-auto custom-scrollbar">${hubTiles}</div>
    </div>`;
}
