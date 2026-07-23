import { useSearch } from '../hooks/useSearch.js';
import { useMemo } from 'react';
import { getToc } from '../../learning/api/content-toc.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { TreeUtils } from '../../tree-graph/api/tree-utils.js';

function SearchLoading({ label, lightChrome }) {
    return (
        <div
            className={`py-10 text-center text-sm font-semibold ${lightChrome ? 'text-slate-600 dark:text-slate-300' : 'text-slate-500'}`}
            role="status"
        >
            {label}
        </div>
    );
}

const MAX_RECENT_IN_SEARCH = 8;

function resolveBookmarkSectionTitle(node, bm) {
    if (!bm) return '';
    const stored = String(bm.sectionTitle || '').trim();
    if (stored) return stored;
    if (!node?.content) return '';
    try {
        const toc = getToc({ content: node.content });
        const idx = typeof bm.index === 'number' ? bm.index : 0;
        return String(toc[idx]?.text || '').trim();
    } catch {
        return '';
    }
}

function bookmarkSectionPositionLabel(ui, index, total) {
    const tpl = ui.bookmarkSectionPosition || '{current} / {total}';
    return tpl
        .replace(/\{current\}/g, String((Number(index) || 0) + 1))
        .replace(/\{total\}/g, String(Math.max(1, Number(total) || 1)));
}

function tagForResult(res, ui, listKind) {
    let tag = ui.tagModule || 'MODULE';
    let tone = 'blue';
    if (res.type === 'leaf') {
        tag = ui.tagLesson || 'LESSON';
        tone = 'sky';
    } else if (res.type === 'exam') {
        tag = ui.tagExam || 'EXAM';
        tone = 'red';
    }
    if (listKind === 'manual') {
        tag = ui.tagSection || ui.lessonTopics || 'SECTION';
        tone = 'amber';
    }
    return { tag, tone };
}

function searchRelevanceScore(res, query) {
    const q = TreeUtils.cleanString(query);
    if (!q) return 0;
    const name = TreeUtils.cleanString(res.name || '');
    const body = TreeUtils.cleanString(res.searchBody || res.description || '');
    let score = 0;
    if (name === q) score += 120;
    else if (name.startsWith(q)) score += 90;
    else if (name.includes(q)) score += 70;
    /* Path is display-only for ranking ancestors; do not boost path-only ancestry. */
    if (body.includes(q)) score += 10;
    const typeRank = { root: 0, branch: 1, exam: 2, leaf: 3 };
    score -= (typeRank[res.type] ?? 4) * 4;
    const depth = String(res.path || '').split(' / ').filter(Boolean).length;
    score -= depth * 2;
    return score;
}

function sortResults(results, listKind, query) {
    if (listKind) return results;
    const q = String(query || '').trim();
    return [...results].sort((a, b) => {
        if (q.length >= 2) {
            const d = searchRelevanceScore(b, q) - searchRelevanceScore(a, q);
            if (d !== 0) return d;
        }
        const priority = { root: 0, branch: 1, exam: 2, leaf: 3 };
        const pA = priority[a.type] !== undefined ? priority[a.type] : 99;
        const pB = priority[b.type] !== undefined ? priority[b.type] : 99;
        if (pA !== pB) return pA - pB;
        return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
}

function SearchResultRow({ res, ui, listKind, onPick, onDeleteBookmark, confirm, removeBookmark }) {
    const pathDisplay = (res.path || '').replace(/ \/ /g, ' › ');
    const { tag, tone } = tagForResult(res, ui, listKind);
    const displayTitle =
        listKind === 'manual' && res.bookmarkSectionTitle ? res.bookmarkSectionTitle : res.name;
    const lessonName = res.bookmarkLessonName || res.name || '';
    const pathText =
        listKind === 'manual' && res.bookmarkSectionTitle
            ? lessonName && pathDisplay
                ? `${lessonName} · ${pathDisplay}`
                : lessonName || pathDisplay
            : pathDisplay;

    let progressIndicator = null;
    if (listKind === 'manual' && res.bookmarkSectionTitle) {
        const pos =
            typeof res.bookmarkIndex === 'number' && res.bookmarkSectionTotal
                ? bookmarkSectionPositionLabel(ui, res.bookmarkIndex, res.bookmarkSectionTotal)
                : '';
        if (pos) progressIndicator = <span className="arborito-mmenu-drill-hint shrink-0">{pos}</span>;
    } else if (listKind === 'recent' && res.progress !== undefined) {
        const tpl = ui.bookmarkProgressPercent || '{n}% read';
        progressIndicator = (
            <span className="arborito-mmenu-drill-hint shrink-0">
                {tpl.replace(/\{n\}/g, String(Math.min(99, Number(res.progress) || 0)))}
            </span>
        );
    }

    const rowInner = (
        <>
            <span className="w-9 text-center text-xl shrink-0 leading-none" aria-hidden="true">
                <ChromeEmoji emoji={res.icon || '📄'} size={22} className="arborito-emoji-glyph" />
            </span>
            <span className="flex-1 min-w-0 text-left">
                <span className="flex items-center gap-2 min-w-0">
                    <span className="font-bold truncate">{displayTitle}</span>
                    {progressIndicator}
                </span>
                <span
                    className={`arborito-pill arborito-pill--xs arborito-pill--bordered arborito-pill--${tone} self-start mt-1`}
                >
                    {tag}
                </span>
                {pathText ? (
                    <span className="arborito-mmenu-drill-hint block truncate mt-0.5">{pathText}</span>
                ) : null}
            </span>
        </>
    );

    const pick = () => onPick(res);

    if (listKind === 'manual') {
        const delTitle = ui.bookmarkTooltipRemove || ui.bookmarkDeleteTitle || 'Remove bookmark';
        return (
            <div className="arborito-search-result-wrap arborito-search-result-wrap--with-delete">
                <button
                    type="button"
                    className="arborito-mmenu-drill-row btn-search-result arborito-search-result-row flex-1 min-w-0"
                    onClick={pick}
                >
                    {rowInner}
                </button>
                <button
                    type="button"
                    className="btn-delete-bookmark arborito-search-result-delete"
                    title={delTitle}
                    aria-label={delTitle}
                    onClick={async (e) => {
                        e.stopPropagation();
                        if (
                            await confirm(
                                ui.bookmarkDeleteBody || 'Delete this bookmark?',
                                ui.bookmarkDeleteTitle || 'Remove bookmark'
                            )
                        ) {
                            removeBookmark(String(res.id));
                            onDeleteBookmark?.();
                        }
                    }}
                >
                    <ChromeEmoji emoji="🗑️" size={18} />
                </button>
            </div>
        );
    }

    return (
        <button
            type="button"
            className="arborito-mmenu-drill-row btn-search-result arborito-search-result-row w-full"
            onClick={pick}
        >
            {rowInner}
        </button>
    );
}

function ResultsList({ results, ui, listKind, query, onPick, onDeleteBookmark, sectionHeader, confirm, removeBookmark }) {
    const sorted = useMemo(() => sortResults(results, listKind, query), [results, listKind, query]);
    if (!sorted.length) return null;
    return (
        <>
            {sectionHeader ? (
                <p className="arborito-menu-section arborito-search-results-section">{sectionHeader}</p>
            ) : null}
            {sorted.map((res) => (
                <SearchResultRow
                    key={`${listKind || 'search'}-${res.id}-${res.bookmarkIndex ?? ''}`}
                    res={res}
                    ui={ui}
                    listKind={listKind}
                    onPick={onPick}
                    onDeleteBookmark={onDeleteBookmark}
                    confirm={confirm}
                    removeBookmark={removeBookmark}
                />
            ))}
        </>
    );
}

/**
 * Shared search results body for modal + desktop inline search.
 */
export function SearchResultsPanel({ state, ui, lightChrome = false, onPick, onRefresh }) {
    const {
        confirm,
        removeBookmark,
        findNode,
        getManualBookmarks,
        getRecentLessons,
        isCompleted,
    } = useSearch();

    const { isSearching, results, query } = state;

    const bookmarkLists = useMemo(() => {
        if (query.length > 0) return null;
        const manualBookmarks = getManualBookmarks();
        const manualIds = new Set(manualBookmarks.map((bm) => bm.id));
        const manualNodes = [];
        manualBookmarks.forEach((bm) => {
            const node = findNode(bm.id);
            if (node) {
                let sectionTotal = 0;
                try {
                    if (node.content) sectionTotal = getToc({ content: node.content }).length;
                } catch {
                    sectionTotal = 0;
                }
                manualNodes.push({
                    ...node,
                    bookmarkIndex: typeof bm.index === 'number' ? bm.index : 0,
                    bookmarkVisited: Array.isArray(bm.visited) ? bm.visited : [],
                    bookmarkSectionTitle: resolveBookmarkSectionTitle(node, bm),
                    bookmarkLessonName: node.name,
                    bookmarkSectionTotal: sectionTotal,
                });
            }
        });
        const recentNodes = [];
        getRecentLessons()
            .filter((rl) => !manualIds.has(rl.id) && !isCompleted(rl.id))
            .slice(0, MAX_RECENT_IN_SEARCH)
            .forEach((rl) => {
                const node = findNode(rl.id);
                if (node) {
                    recentNodes.push({
                        ...node,
                        recentIndex: typeof rl.index === 'number' ? rl.index : 0,
                        recentVisited: Array.isArray(rl.visited) ? rl.visited : [],
                        progress: Math.min(99, (rl.visited ? rl.visited.length : 0) * 10),
                    });
                }
            });
        return { manualNodes, recentNodes };
    }, [query, state, onRefresh]);

    if (isSearching) {
        return (
            <SearchLoading
                lightChrome={lightChrome}
                label={ui.editorProcessing || 'Procesando…'}
            />
        );
    }

    if (query.length > 0) {
        if (results.length > 0 || query.length >= 2) {
            if (!results.length) {
                return (
                    <div className="arborito-empty py-10 flex flex-col items-center gap-2">
                        <ChromeEmoji emoji="🍃" size={24} className="text-2xl opacity-50" />
                        <span>{ui.noResults}</span>
                    </div>
                );
            }
            return (
                <>
                    <ResultsList results={results} ui={ui} query={query} onPick={onPick} confirm={confirm} removeBookmark={removeBookmark} />
                    <div className="h-6" aria-hidden="true" />
                </>
            );
        }
        return null;
    }

    if (!bookmarkLists) return null;
    const { manualNodes, recentNodes } = bookmarkLists;
    if (!manualNodes.length && !recentNodes.length) return null;

    return (
        <>
            <ResultsList
                results={manualNodes}
                ui={ui}
                listKind="manual"
                onPick={onPick}
                onDeleteBookmark={onRefresh}
                sectionHeader={ui.searchManualBookmarksHeader || 'Your bookmarks'}
                confirm={confirm}
                removeBookmark={removeBookmark}
            />
            <ResultsList
                results={recentNodes}
                ui={ui}
                listKind="recent"
                onPick={onPick}
                sectionHeader={ui.searchRecentLessonsHeader || 'Recently viewed'}
                confirm={confirm}
                removeBookmark={removeBookmark}
            />
            <div className="h-6" aria-hidden="true" />
        </>
    );
}

export function searchResultsMsgText(state, ui) {
    const { query, results, isSearching } = state;
    if (isSearching) return '';
    if (query.length === 1) return ui.searchKeepTyping;
    if (query.length === 0) return ui.searchBookmarksEmpty || ui.searchKeepTyping;
    if (!results.length) return ui.noResults;
    return '';
}
