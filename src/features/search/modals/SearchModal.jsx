import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearch } from '../hooks/useSearch.js';
import {
    useDockModalChrome,
    isDesktopForestInlineSearch,
    shouldShowMobileUI,
} from '../../../shared/ui/breakpoints.js';
import { applySearchIndexBanner } from '../api/search-index-banner.js';
import { SearchResultsPanel } from '../components/SearchResultsPanel.jsx';
import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { DockHubPanelEmbed } from '../../../shared/ui/DockHubPanelEmbed.jsx';
import { useDockHubEmbedClose } from '../../../shared/ui/DockHubEmbedContext.jsx';

async function pickSearchResultFromData(res, pickResult) {
    await pickResult(res);
}

function SearchBody({
    ui,
    dockChrome,
    mobUi,
    query,
    searchState,
    onInput,
    onClose,
    onPick,
    storeSnapshot,
    onRefresh,
    bannerRef,
    modalRootRef,
}) {
    const inputRadius = dockChrome ? 'rounded-lg' : 'rounded-xl';
    const inputClass = `arborito-input arborito-input--search h-11 py-0 font-semibold ${inputRadius} pr-4 shadow-sm transition-all`;
    const listShell = dockChrome
        ? 'flex-1 overflow-y-auto custom-scrollbar min-h-0 border-0 shadow-none bg-transparent rounded-none arborito-search-results-list arborito-search-results-list--dock-light pt-1'
        : 'flex-1 overflow-y-auto custom-scrollbar min-h-0 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 shadow-inner arborito-search-results-list arborito-search-results-list--dock-light';

    const { isSearching } = searchState;
    const panel = (
        <SearchResultsPanel
            state={searchState}
            ui={ui}
            lightChrome
            onPick={onPick}
            onRefresh={onRefresh}
        />
    );
    const showMsg = !isSearching && query.length === 1;
    const showList = !isSearching && query.length !== 1;

    useEffect(() => {
        applySearchIndexBanner(bannerRef.current, storeSnapshot, ui);
    });

    return (
        <>
            <div className={`arborito-field-wrap w-full ${dockChrome ? 'mb-3' : 'mb-4'} group shrink-0`}>
                <span className="arborito-search-icon">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.25"
                        className="w-[18px] h-[18px]"
                        aria-hidden="true"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                        />
                    </svg>
                </span>
                <input
                    id="inp-search"
                    type="search"
                    enterKeyHint="search"
                    placeholder={ui.searchPlaceholder || 'Search topics...'}
                    className={inputClass}
                    value={query}
                    autoComplete="off"
                    aria-label={ui.navSearch || 'Search'}
                    autoFocus={!mobUi}
                    onChange={(e) => onInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            e.currentTarget.blur();
                            onClose();
                        }
                        if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    onBlur={() => {
                        if (!mobUi) {
                            setTimeout(() => {
                                const root = modalRootRef?.current;
                                if (root && !root.contains(document.activeElement)) onClose();
                            }, 150);
                        }
                    }}
                />
            </div>
            <div
                ref={bannerRef}
                id="search-index-banner"
                className="hidden text-center text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-500/10 dark:bg-amber-500/15 rounded-xl px-3 py-2 mb-2 border border-amber-200/80 dark:border-amber-700/50"
                aria-live="polite"
            />
            <div
                id="search-msg-area"
                className={`text-center text-slate-600 dark:text-slate-400 py-4 font-medium text-sm transition-opacity duration-300${showMsg ? '' : ' hidden'}`}
            >
                {showMsg ? ui.searchKeepTyping : ''}
            </div>
            <div id="search-results-list" className={`${listShell}${showList && panel ? '' : ' hidden'}`}>
                {showList ? panel : null}
            </div>
        </>
    );
}

export function ModalSearch({ dockEmbed = false, dockEmbedActive = false }) {
    const { ui, dismissModal, setModal, search, searchBroad, pickResult, storeSnapshot } =
        useSearch();
    const dockChrome = dockEmbed || useDockModalChrome();
    const mobUi = shouldShowMobileUI();

    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    const bannerRef = useRef(null);
    const modalRootRef = useRef(null);
    const searchTimerRef = useRef(null);

    const searchState = { query, results, isSearching };

    const close = () => dismissModal();

    useDockHubEmbedClose(close, dockEmbedActive);

    const onRefresh = useCallback(() => {
        if (isDesktopForestInlineSearch()) {
            window.dispatchEvent(new CustomEvent('arborito-desktop-search-refresh'));
        } else {
            setModal({ type: 'search', dockUi: useDockModalChrome() });
        }
    }, []);

    const onPick = useCallback(
        (res) => {
            void pickSearchResultFromData(res, pickResult);
        },
        [pickResult]
    );

    useEffect(() => {
        return () => {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        };
    }, []);

    const onInput = (q) => {
        setQuery(q);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

        if (q.length === 0) {
            setResults([]);
            setIsSearching(false);
            return;
        }
        if (q.length === 1) {
            setIsSearching(true);
            searchTimerRef.current = setTimeout(async () => {
                try {
                    setResults(await searchBroad(q));
                } catch {
                    setResults([]);
                } finally {
                    setIsSearching(false);
                }
            }, 500);
            return;
        }
        setIsSearching(true);
        searchTimerRef.current = setTimeout(async () => {
            try {
                setResults(await search(q));
            } catch {
                setResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 300);
    };

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={dockChrome}
            title={ui.navSearch || 'Search'}
            leadingIcon="🔍"
            tagClass="btn-close-search"
            onClose={close}
        />
    );

    const body = (
        <SearchBody
            ui={ui}
            dockChrome={dockChrome}
            mobUi={mobUi}
            query={query}
            searchState={searchState}
            onInput={onInput}
            onClose={close}
            onPick={onPick}
            onRefresh={onRefresh}
            bannerRef={bannerRef}
            modalRootRef={modalRootRef}
            storeSnapshot={storeSnapshot}
        />
    );

    if (dockEmbed) {
        return (
            <div ref={modalRootRef}>
                <DockHubPanelEmbed panelId="modal-search" hero={hero}>
                    {body}
                </DockHubPanelEmbed>
            </div>
        );
    }

    if (dockChrome) {
        return (
            <div ref={modalRootRef} data-arborito-panel="modal-search">
                <DockModalShell
                    mobile
                    useDockChrome={false}
                    shellOpts={{
                        rootFlags: 'arborito-modal--search arborito-search-dock',
                        panelRadius: 'none',
                    }}
                    onBackdropClick={close}
                    hero={hero}
                >
                    {body}
                </DockModalShell>
            </div>
        );
    }

    return (
        <div ref={modalRootRef} data-arborito-panel="modal-search">
            <ModalCenteredShell
                layout="centered"
                sizeTier="COMPACT"
                shellOpts={{ rootFlags: 'arborito-modal--search', panelRadius: '2xl' }}
                onBackdropClick={close}
                hero={hero}
            >
                <div className="flex-1 flex flex-col min-h-0 mt-2">{body}</div>
            </ModalCenteredShell>
        </div>
    );
}
