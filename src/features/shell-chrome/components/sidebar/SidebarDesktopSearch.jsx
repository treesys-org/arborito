import { useCallback, useEffect, useRef } from 'react';
import { useShellChrome } from '../../hooks/useShellChrome.js';
import { SearchResultsPanel, searchResultsMsgText } from '../../../search/components/SearchResultsPanel.jsx';

export function SidebarDesktopSearch({
    ui,
    open,
    searchActive,
    deskSearch,
    onOpen,
    onClose,
    onInput,
    onRefresh,
}) {
    const { findNode, navigateTo, searchIndexStatus, searchIndexError } = useShellChrome();
    const inputRef = useRef(null);
    const wrapRef = useRef(null);
    const { query, results, isSearching } = deskSearch;
    const indexStatus = searchIndexStatus || 'idle';

    const pickSearchResult = useCallback(
        async (res) => {
            const nodeId = res?.id != null ? String(res.id) : '';
            if (!nodeId) return;
            const node = findNode(nodeId);
            const payload = node
                ? { ...res, ...node, path: node.path || node.p || res.path || res.p }
                : { ...res, id: nodeId, path: res.path || res.p };
            await navigateTo(nodeId, payload);
        },
        [findNode, navigateTo]
    );

    const handlePick = useCallback(
        async (res) => {
            await pickSearchResult(res);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => onClose());
            });
        },
        [onClose, pickSearchResult]
    );

    useEffect(() => {
        if (!open) return undefined;
        const inp = inputRef.current;
        inp?.focus();
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        inp?.addEventListener('keydown', onKey);
        return () => inp?.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    useEffect(() => {
        if (!open) return undefined;
        const onDocClick = (e) => {
            if (wrapRef.current?.contains(e.target)) return;
            onClose();
        };
        queueMicrotask(() => document.addEventListener('click', onDocClick, true));
        return () => document.removeEventListener('click', onDocClick, true);
    }, [open, onClose]);

    const showIndexBanner = indexStatus === 'indexing' || indexStatus === 'error';
    const indexBannerText =
        indexStatus === 'indexing'
            ? ui.searchIndexBuilding || 'Building search index…'
            : indexStatus === 'error'
              ? ui.searchIndexFailed || 'Search index failed.'
              : '';

    const panel = (
        <SearchResultsPanel
            state={deskSearch}
            ui={ui}
            lightChrome
            onPick={handlePick}
            onRefresh={onRefresh}
        />
    );
    const msgText = searchResultsMsgText(deskSearch, ui);
    const showList = !!(panel && (query.length === 0 || results.length > 0 || query.length >= 2));
    const showMsg = !isSearching && (query.length === 1 || (query.length === 0 && !showList));

    if (!open) {
        return (
            <button
                type="button"
                className={`arborito-desktop-search-trigger js-btn-desktop-search${searchActive ? ' is-active' : ''}`}
                aria-label={ui.navSearch || 'Search'}
                title={ui.navSearch || 'Search'}
                onClick={(e) => {
                    e.stopPropagation();
                    onOpen();
                }}
            >
                <span className="arborito-desktop-search-trigger__icon" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" width="20" height="20">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                </span>
                <span className="arborito-desktop-search-trigger__placeholder">
                    {ui.searchPlaceholder || 'Search topics...'}
                </span>
            </button>
        );
    }

    return (
        <div className="arborito-desktop-search-inline" ref={wrapRef}>
            <div className="arborito-desktop-search-inline__row">
                <span className="arborito-desktop-search-inline__ic" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" width="18" height="18">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                </span>
                <input
                    ref={inputRef}
                    id="arborito-desk-search-input"
                    type="search"
                    enterKeyHint="search"
                    placeholder={ui.searchPlaceholder || 'Search topics...'}
                    autoComplete="off"
                    className="arborito-desktop-search-inline__input"
                    aria-label={ui.navSearch || 'Search'}
                    value={query}
                    onChange={(e) => onInput(e.target.value)}
                />
                <button
                    type="button"
                    className="arborito-desktop-search-inline__close js-desk-search-close"
                    aria-label={ui.close || 'Close'}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                >
                    ×
                </button>
            </div>
            {showIndexBanner ? (
                <div
                    id="arborito-desk-search-index-banner"
                    className="arborito-desktop-search-inline__index-banner px-2 py-1.5 mb-1 text-center text-[11px] font-semibold leading-snug rounded-lg bg-amber-500/15 text-amber-900 dark:text-amber-200 dark:bg-amber-500/10"
                    role={indexStatus === 'error' ? 'alert' : 'status'}
                    aria-live="polite"
                >
                    {indexBannerText}
                </div>
            ) : (
                <div id="arborito-desk-search-index-banner" className="hidden" aria-hidden="true" />
            )}
            <div
                id="arborito-desk-search-msg"
                className={`arborito-desktop-search-inline__msg${showMsg ? '' : ' hidden'}`}
                aria-live="polite"
            >
                {showMsg ? msgText : ''}
            </div>
            <div
                id="arborito-desk-search-results"
                className={`arborito-desktop-search-inline__results custom-scrollbar${showList && panel ? '' : ' hidden'}`}
            >
                {showList ? panel : null}
            </div>
        </div>
    );
}
