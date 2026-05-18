import { store } from '../store.js';
import { escHtml, escAttr } from '../components/graph/graph-mobile.js';

function bookmarkProgressLabel(ui, pct) {
    const tpl = ui.bookmarkProgressPercent || '{n}% read';
    return escHtml(tpl.replace(/\{n\}/g, String(Math.min(99, Number(pct) || 0))));
}

/**
 * Shared markup + DOM refresh for modal search and desktop header inline search.
 * @param {{ isSearching: boolean, results: unknown[], query: string }} state
 * @param {boolean} lightChrome — dock sheet y modal tarjeta (filas claras); false = dropdown oscuro barra superior
 */
export function getSearchResultsListHTML(state, ui, isBookmarks = false, lightChrome = false) {
    const { isSearching, results } = state;
    const statePad = 'py-10';
    if (isSearching) {
        const proc = escHtml(ui.editorProcessing || 'Processing...');
        if (lightChrome) {
            return `
             <div class="text-center text-slate-500 dark:text-slate-400 ${statePad} flex flex-col items-center gap-2">
                 <div class="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                 <span class="text-sm font-bold text-emerald-600 dark:text-emerald-400/90 animate-pulse">${proc}</span>
             </div>`;
        }
        return `
             <div class="text-center text-slate-400 ${statePad} flex flex-col items-center gap-2">
                 <div class="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                 <span class="text-sm font-bold text-sky-400 animate-pulse">${proc}</span>
             </div>`;
    }

    if (results.length === 0) {
        if (isBookmarks) {
            const emptyCls = lightChrome
                ? `text-center text-slate-600 dark:text-slate-400 ${statePad} flex flex-col items-center gap-2`
                : `text-center text-slate-500 ${statePad} flex flex-col items-center gap-2`;
            return `<div class="${emptyCls}">
                    <span class="text-3xl opacity-50">📖</span>
                    <span>${escHtml(ui.searchBookmarksEmpty || 'Start reading to save your place here.')}</span>
                 </div>`;
        }
        const noResCls = lightChrome
            ? `text-center text-slate-500 dark:text-slate-400 ${statePad} flex flex-col items-center gap-2`
            : `text-center text-slate-400 ${statePad} flex flex-col items-center gap-2`;
        return `<div class="${noResCls}"><span class="text-2xl opacity-50">🍃</span><span>${escHtml(ui.noResults)}</span></div>`;
    }

    const priority = { branch: 0, root: 0, exam: 1, leaf: 2 };
    const sortedResults = [...results].sort((a, b) => {
        if (isBookmarks) return 0;
        const pA = priority[a.type] !== undefined ? priority[a.type] : 99;
        const pB = priority[b.type] !== undefined ? priority[b.type] : 99;
        if (pA !== pB) return pA - pB;
        return a.name.localeCompare(b.name);
    });

    const recentHeaderText = escHtml(ui.searchRecentBookmarksHeader || 'Recent lessons (in progress)');
    const header = isBookmarks
        ? lightChrome
            ? `<div class="px-4 py-2 bg-slate-100/90 dark:bg-slate-800/70 text-[10px] font-bold text-sky-700 dark:text-sky-300 uppercase tracking-widest border-b border-slate-200 dark:border-slate-700">${recentHeaderText}</div>`
            : `<div class="px-4 py-2 bg-slate-800/50 text-[10px] font-bold text-sky-400 uppercase tracking-widest border-b border-slate-700">${recentHeaderText}</div>`
        : '';

    const rowBorder = lightChrome ? 'border-slate-200 dark:border-slate-700/80' : 'border-slate-700/50';
    const rowHover = lightChrome ? 'hover:bg-slate-100/90 dark:hover:bg-slate-800/40' : 'hover:bg-white/5';
    const iconBox = lightChrome
        ? 'w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-200 flex items-center justify-center text-lg leading-none shrink-0 group-hover:scale-105 transition-transform shadow-sm'
        : 'w-10 h-10 rounded-lg bg-[#0f172a] border border-slate-700 text-slate-300 flex items-center justify-center text-lg leading-none shrink-0 group-hover:scale-105 transition-transform shadow-md';
    const titleCls = lightChrome ? 'font-bold text-slate-800 dark:text-white truncate text-base min-w-0' : 'font-bold text-slate-100 truncate text-base min-w-0';
    const pathCls = lightChrome ? 'text-xs text-slate-500 dark:text-slate-400 truncate font-medium' : 'text-xs text-slate-400 truncate font-medium';
    const progressCls = lightChrome
        ? 'text-[10px] text-green-600 dark:text-green-400 font-mono shrink-0'
        : 'text-[10px] text-green-400 font-mono shrink-0';
    const delBorder = lightChrome ? 'border-slate-200 dark:border-slate-700' : 'border-slate-700/50';

    return (
        header +
        sortedResults
            .map((res) => {
                let tag = ui.tagModule || 'MODULE';
                let tagClass = lightChrome
                    ? 'border-blue-400 text-blue-700 dark:text-blue-300 bg-blue-500/15 dark:bg-blue-500/10'
                    : 'border-blue-500 text-blue-400 bg-blue-500/10';
                if (res.type === 'leaf') {
                    tag = ui.tagLesson || 'LESSON';
                    tagClass = lightChrome
                        ? 'border-sky-400 text-sky-800 dark:text-sky-200 bg-sky-500/15 dark:bg-sky-500/10'
                        : 'border-sky-500 text-sky-400 bg-sky-500/10';
                }
                if (res.type === 'exam') {
                    tag = ui.tagExam || 'EXAM';
                    tagClass = lightChrome
                        ? 'border-red-400 text-red-800 dark:text-red-300 bg-red-500/15 dark:bg-red-500/10'
                        : 'border-red-500 text-red-400 bg-red-500/10';
                }
                const pathDisplay = (res.path || '').replace(/ \/ /g, ' › ');
                let progressIndicator = '';
                if (isBookmarks && res.progress !== undefined) {
                    progressIndicator = `<span class="${progressCls}">${bookmarkProgressLabel(ui, res.progress)}</span>`;
                }
                const delTitle = escAttr(ui.bookmarkTooltipRemove || ui.bookmarkDeleteTitle || 'Remove bookmark');
                const deleteAction = isBookmarks
                    ? `
                <button type="button" class="btn-delete-bookmark w-14 flex items-center justify-center border-l ${delBorder} text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors text-lg" data-id="${escAttr(String(res.id))}" title="${delTitle}" aria-label="${delTitle}">🗑️</button>
            `
                    : '';
                const nodeIdAttr = encodeURIComponent(String(res.id ?? ''));
                const crumbAttr = encodeURIComponent(String(res.path || res.p || ''));
                const iconRaw = res.icon || '📄';
                const nameSafe = escHtml(res.name);
                const pathSafe = escHtml(pathDisplay);
                return `
            <div class="flex items-stretch w-full border-b ${rowBorder} ${rowHover} transition-colors group">
                <button type="button" class="btn-search-result flex-1 text-left p-4 flex items-start gap-4 min-w-0" data-node-id="${nodeIdAttr}" data-breadcrumb="${crumbAttr}" data-json="${encodeURIComponent(JSON.stringify(res))}">
                    <div class="${iconBox}" aria-hidden="true">
                        ${escHtml(iconRaw)}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex flex-col gap-2 mb-1 min-w-0">
                            <div class="flex items-center gap-2 min-w-0">
                                <h4 class="${titleCls} flex-1">${nameSafe}</h4>
                                ${progressIndicator}
                            </div>
                            <span class="inline-block text-[10px] uppercase font-bold px-1.5 py-0.5 border rounded leading-tight ${tagClass}">${escHtml(tag)}</span>
                        </div>
                        <p class="${pathCls}">${pathSafe}</p>
                    </div>
                </button>
                ${deleteAction}
            </div>
            `;
            })
            .join('') + '<div class="h-10"></div>'
    );
}

/**
 * @param {{ reopenSearch: () => void, lightChrome?: boolean }} opts
 */
export function updateSearchResultsPanels(list, msgArea, state, ui, opts = {}) {
    const { reopenSearch, lightChrome = false } = opts;
    if (!list || !msgArea) return;

    if (state.isSearching) {
        list.innerHTML = getSearchResultsListHTML({ ...state, results: [] }, ui, false, lightChrome);
        list.classList.remove('hidden');
        msgArea.classList.add('hidden');
        return;
    }

    if (state.query.length > 0) {
        if (state.results.length > 0 || state.query.length >= 2) {
            list.innerHTML = getSearchResultsListHTML(state, ui, false, lightChrome);
            list.classList.remove('hidden');
            msgArea.classList.add('hidden');
        } else if (state.query.length === 1) {
            list.classList.add('hidden');
            msgArea.classList.remove('hidden');
            msgArea.textContent = ui.searchKeepTyping;
        } else {
            list.innerHTML = getSearchResultsListHTML({ ...state, results: [] }, ui, false, lightChrome);
            list.classList.remove('hidden');
            msgArea.classList.add('hidden');
        }
        return;
    }

    const recentBookmarks = store.userStore.getRecentBookmarks();
    const bookmarkedNodes = [];
    recentBookmarks.forEach((bm) => {
        if (!store.isCompleted(bm.id)) {
            const node = store.findNode(bm.id);
            if (node) {
                bookmarkedNodes.push({
                    ...node,
                    progress: Math.min(99, (bm.visited ? bm.visited.length : 0) * 10),
                });
            }
        }
    });
    const limitedNodes = bookmarkedNodes.slice(0, 3);

    if (limitedNodes.length > 0) {
        list.innerHTML = getSearchResultsListHTML({ ...state, results: limitedNodes }, ui, true, lightChrome);
        list.classList.remove('hidden');
        msgArea.classList.add('hidden');

        list.querySelectorAll('.btn-delete-bookmark').forEach((btn) => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                if (
                    await store.confirm(
                        ui.bookmarkDeleteBody || 'Delete this bookmark?',
                        ui.bookmarkDeleteTitle || 'Remove bookmark'
                    )
                ) {
                    store.removeBookmark(btn.dataset.id);
                }
                if (typeof reopenSearch === 'function') reopenSearch();
            };
        });
    } else {
        list.classList.add('hidden');
        msgArea.classList.remove('hidden');
        msgArea.textContent = ui.searchKeepTyping;
    }
}
