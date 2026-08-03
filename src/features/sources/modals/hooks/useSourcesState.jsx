import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { useSourcesStore } from '../../hooks/useSources.js';
import { runAfterPaint, scheduleIdle } from '../../../../shared/lib/yield-to-paint.js';
import { runThrottledBackgroundTask } from '../../../../shared/lib/background-task-gate.js';
import { collectBranchesTabItems } from '../../api/modals/logic/sources-collect-branches.js';
import {
    scheduleGlobalDirectoryFetch,
    applyGlobalDirectorySortAndMetrics,
    invalidateGlobalDirectoryFetch,
} from '../../api/modals/logic/sources-directory-fetch.js';
import { closeSourcesModal } from '../../api/modals/logic/sources-actions/index.js';
import {
    DIRECTORY_CLIENT_FETCH_MAX,
    DIRECTORY_CLIENT_FETCH_PAGE,
} from '../../../p2p-webtorrent/api/directory-index-config.js';
import {
    normalizeSourcesMainTab,
    sourcesScopeForMainTab,
    hasSeenSourcesExplore,
    markSourcesExploreSeen,
} from '../../api/modals/logic/sources-main-tab.js';

function readInitialMainTab(store) {
    const m = store.value.modal;
    if (m && typeof m === 'object') {
        if (m.focusTab === 'trees' || m.focusTab === 'tree' || m.focusTab === 'forest') {
            return 'trees';
        }
        if (m.focusTab === 'explore' || m.focusTab === 'internet') {
            markSourcesExploreSeen();
            return 'explore';
        }
        if (m.focusTab === 'branch' || m.focusTab === 'mine' || m.focusTab === 'branches') {
            return 'mine';
        }
        if (m.fromOnboarding) {
            /* First open from welcome: Explorar (catalog). Daily home stays Mis cursos. */
            markSourcesExploreSeen();
            return 'explore';
        }
    }
    /* First open: Explorar so the catalog is obvious. Later opens: Mis cursos. */
    if (!hasSeenSourcesExplore()) {
        markSourcesExploreSeen();
        return 'explore';
    }
    return 'mine';
}

export function useSourcesState({ embed }) {
    const store = useSourcesStore();
    const [mainTab, setMainTabRaw] = useState(() => readInitialMainTab(store));
    const setMainTab = useCallback((v) => {
        setMainTabRaw(normalizeSourcesMainTab(v));
    }, []);
    const [activeTab, setActiveTab] = useState(() =>
        readInitialMainTab(store) === 'trees' ? 'trees' : 'branch'
    );
    const [overlay, setOverlay] = useState(null);
    const [targetId, setTargetId] = useState(null);
    const [deleteOverlayTitle, setDeleteOverlayTitle] = useState(null);
    const [deleteOverlayBody, setDeleteOverlayBody] = useState(null);
    const [deleteAlsoMembersOption, setDeleteAlsoMembersOption] = useState(false);
    const [deleteAlsoMembersDefault, setDeleteAlsoMembersDefault] = useState(true);
    const [deleteAlsoRetractOption, setDeleteAlsoRetractOption] = useState(false);
    const [deleteAlsoRetractDefault, setDeleteAlsoRetractDefault] = useState(true);
    const [exportTarget, setExportTarget] = useState(null);
    const [exportBusy, setExportBusy] = useState(false);
    const [sourcesQ, setSourcesQ] = useState('');
    const [treesQ, setTreesQ] = useState('');
    const [treesScope, setTreesScope] = useState('device');
    const [treesAdvancedOpen, setTreesAdvancedOpen] = useState(false);
    const [sourcesScope, setSourcesScope] = useState(() =>
        sourcesScopeForMainTab(readInitialMainTab(store))
    );
    const [sourcesAdvancedOpen, setSourcesAdvancedOpen] = useState(false);
    const [sourcesKindFilter, setSourcesKindFilter] = useState('all');
    const [treeFreezeBusy, setTreeFreezeBusy] = useState({});
    const [rowActionsOpen, setRowActionsOpen] = useState(() => new Set());
    const [globalDirFilter, setGlobalDirFilter] = useState('discover');
    const [globalDirHitCap, setGlobalDirHitCap] = useState(false);
    const [globalDirUiTruncated, setGlobalDirUiTruncated] = useState(false);
    const [globalDirFetchLimit, setGlobalDirFetchLimit] = useState(DIRECTORY_CLIENT_FETCH_PAGE);
    const [globalDirLastFetchLimit, setGlobalDirLastFetchLimit] = useState(0);
    /* `collectBranchesTabItems`/`collectTreesTabItems` set this flag while they
     * run, and they run inside the tab panels' `useMemo`, i.e. DURING render.
     * Writing React state there triggers "Cannot update a component while
     * rendering a different component" and, because collect resets the flag to
     * false then back to true every pass, an infinite re-render loop that froze
     * the whole UI (most visibly the first-run onboarding). The collect ctx now
     * writes to this ref (a plain mutation, no setState), and an effect mirrors
     * it into React state once per render, deterministic, so it converges. */
    const truncRef = useRef(false);
    const [globalDirLoading, setGlobalDirLoading] = useState(false);
    const [globalDirError, setGlobalDirError] = useState('');
    const [globalDirRows, setGlobalDirRows] = useState([]);
    const [globalDirMetrics, setGlobalDirMetrics] = useState({});
    const [sourcesTreeLoading, setSourcesTreeLoading] = useState(false);
    const [treeEditor, setTreeEditor] = useState(null);
    const [globalDirQ, setGlobalDirQ] = useState('');
    const [globalDirLastFetchAt, setGlobalDirLastFetchAt] = useState(0);
    const [globalDirLastQuery, setGlobalDirLastQuery] = useState('');
    const [globalDirTimer, setGlobalDirTimer] = useState(null);
    const globalDirTimerRef = useRef(null);
    const setGlobalDirTimerTracked = useCallback((t) => {
        globalDirTimerRef.current = t;
        setGlobalDirTimer(t);
    }, []);
    const [, bumpTick] = useState(0);
    const bump = useCallback(() => bumpTick((n) => n + 1), []);

    const toggleRowActions = useCallback((key) => {
        setRowActionsOpen((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
        bump();
    }, [bump]);

    const close = useCallback(
        (opts = {}) => {
            setOverlay(null);
            setTreeEditor(null);
            setMainTab('mine');
            setSourcesScope('branch');
            setTreesScope('device');
            setSourcesKindFilter('all');
            setSourcesAdvancedOpen(false);
            setTreesAdvancedOpen(false);
            closeSourcesModal(opts, embed);
        },
        [embed, setMainTab]
    );

    const mountedRef = useRef(true);
    const modalApiRef = useRef(null);
    if (!modalApiRef.current) {
        modalApiRef.current = {
            get isConnected() {
                return mountedRef.current;
            },
            updateContent: () => {},
            close: (opts) => {},
            _mainTab: 'mine',
            _activeTab: 'branch',
            get _sourcesMainTab() {
                return this._mainTab;
            },
            set _sourcesMainTab(v) {
                const next = normalizeSourcesMainTab(v);
                this._setMainTab?.(next);
                if (next !== 'trees') {
                    this._setSourcesScope?.(sourcesScopeForMainTab(next));
                }
            },
            get activeTab() {
                return this._activeTab;
            },
            set activeTab(v) {
                this._setActiveTab?.(v);
            },
        };
    }
    const modalApi = modalApiRef.current;
    modalApi._mainTab = mainTab;
    modalApi._activeTab = activeTab;
    modalApi._setMainTab = setMainTab;
    modalApi._setActiveTab = setActiveTab;
    modalApi._setSourcesScope = setSourcesScope;
    modalApi.updateContent = bump;
    modalApi.close = close;

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const directorySetters = useMemo(
        () => ({
            setGlobalDirRows,
            setGlobalDirMetrics,
            setGlobalDirLoading,
            setGlobalDirError,
            setGlobalDirHitCap,
            setGlobalDirLastFetchAt,
            setGlobalDirLastQuery,
            setGlobalDirLastFetchLimit,
            setGlobalDirTimer: setGlobalDirTimerTracked,
        }),
        [setGlobalDirTimerTracked]
    );

    const directoryState = useCallback(
        () => ({
            globalDirFilter,
            globalDirRows,
            globalDirMetrics,
            globalDirLoading,
            globalDirQ,
            globalDirFetchLimit,
            globalDirLastFetchAt,
            globalDirLastQuery,
            globalDirLastFetchLimit,
            globalDirTimer: globalDirTimerRef.current,
        }),
        [
            globalDirFilter,
            globalDirRows,
            globalDirMetrics,
            globalDirLoading,
            globalDirQ,
            globalDirFetchLimit,
            globalDirLastFetchAt,
            globalDirLastQuery,
            globalDirLastFetchLimit,
        ]
    );

    const collectCtx = useMemo(
        () => ({
            _sourcesScope: sourcesScope,
            _sourcesQ: sourcesQ,
            _globalDirRows: globalDirRows,
            _globalDirMetrics: globalDirMetrics,
            treeFreezeBusy,
            setGlobalDirMetrics,
            get _globalDirUiTruncated() {
                return truncRef.current;
            },
            set _globalDirUiTruncated(v) {
                truncRef.current = !!v;
            },
        }),
        [
            sourcesScope,
            sourcesQ,
            globalDirRows,
            globalDirMetrics,
            treeFreezeBusy,
        ]
    );

    /* Mirror the render-phase truncation flag into React state AFTER render. */
    useEffect(() => {
        if (truncRef.current !== globalDirUiTruncated) {
            setGlobalDirUiTruncated(truncRef.current);
        }
    });

    const getBranchesTabRows = useCallback(
        (ui, state, activeSource) =>
            collectBranchesTabItems(collectCtx, ui, state, activeSource, {
                scope: sourcesScope,
                q: sourcesQ,
            }),
        [collectCtx, sourcesScope, sourcesQ]
    );

    const actionCtxRef = useRef(null);
    actionCtxRef.current = {
        modalApi: modalApiRef.current,
        mountedRef,
        bump,
        activeTab,
        overlay,
        targetId,
        treeEditor,
        treeFreezeBusy,
        sourcesAdvancedOpen,
        treesAdvancedOpen,
        globalDirRows,
        globalDirMetrics,
        sourcesScope,
        setOverlay,
        setTargetId,
        setDeleteOverlayTitle,
        setDeleteOverlayBody,
        setDeleteAlsoMembersOption,
        setDeleteAlsoMembersDefault,
        setDeleteAlsoRetractOption,
        setDeleteAlsoRetractDefault,
        deleteOverlayTitle,
        deleteOverlayBody,
        deleteAlsoMembersOption,
        deleteAlsoMembersDefault,
        deleteAlsoRetractOption,
        deleteAlsoRetractDefault,
        exportTarget,
        setExportTarget,
        exportBusy,
        setExportBusy,
        setTreeEditor,
        setTreeFreezeBusy,
        setSourcesAdvancedOpen,
        setTreesAdvancedOpen,
        setSourcesScope,
        setTreesScope,
        setGlobalDirFilter,
        setSourcesTreeLoading,
        toggleRowActions,
        directoryState,
        directorySetters,
        setGlobalDirMetrics,
    };

    useEffect(() => {
        setGlobalDirFetchLimit(DIRECTORY_CLIENT_FETCH_PAGE);
        setGlobalDirQ(sourcesQ);
    }, [sourcesQ]);

    /* Discover only while on Explorar (or legacy internet scope). Mine “Todos”
     * must not kick relays — that felt like the sheet reloading itself. */
    const directoryFetchEnabled =
        mainTab === 'explore' || sourcesScope === 'internet';

    useEffect(() => {
        if (!directoryFetchEnabled) {
            const t = globalDirTimerRef.current;
            if (t) clearTimeout(t);
            globalDirTimerRef.current = null;
            setGlobalDirTimer(null);
            invalidateGlobalDirectoryFetch();
            setGlobalDirLoading(false);
            return undefined;
        }
        const widening = globalDirFetchLimit > (globalDirLastFetchLimit || 0);
        scheduleGlobalDirectoryFetch(directoryState(), directorySetters, {
            reason: widening ? 'load-more' : 'input',
            onUpdate: bump,
        });
        return () => {
            const t = globalDirTimerRef.current;
            if (t) clearTimeout(t);
            globalDirTimerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [globalDirQ, globalDirFetchLimit, directoryFetchEnabled]);

    const loadMoreDirectoryCatalog = useCallback(() => {
        setGlobalDirFetchLimit((n) => {
            const cur = Math.max(DIRECTORY_CLIENT_FETCH_PAGE, Number(n) || DIRECTORY_CLIENT_FETCH_PAGE);
            return Math.min(DIRECTORY_CLIENT_FETCH_MAX, cur + DIRECTORY_CLIENT_FETCH_PAGE);
        });
    }, []);

    useEffect(() => {
        if (!directoryFetchEnabled) return;
        const dirStale =
            !globalDirLastFetchAt || Date.now() - (globalDirLastFetchAt || 0) > 120000;
        if (!globalDirRows?.length && dirStale) {
            runAfterPaint(() => {
                scheduleIdle(() => {
                    scheduleGlobalDirectoryFetch(directoryState(), directorySetters, {
                        reason: 'render',
                        onUpdate: bump,
                    });
                }, 250);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [directoryFetchEnabled]);

    useEffect(() => {
        scheduleIdle(() => {
            void runThrottledBackgroundTask(
                'catalog-maintain',
                async () => {
                    const { autoMaintainPublishedCatalog } = await import(
                        '../../../publishing/api/published-entry-auto-maintain.js'
                    );
                    const changed = await autoMaintainPublishedCatalog(store.value);
                    if (changed > 0) bump();
                },
                { oncePerSession: true, minIntervalMs: 8000 }
            );
        }, 4500);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const panelApi = useMemo(
        () => ({
            get _sourcesMainTab() {
                return mainTab;
            },
            set _sourcesMainTab(v) {
                const next = normalizeSourcesMainTab(v);
                setMainTab(next);
                setActiveTab(next === 'trees' ? 'trees' : 'branch');
                startTransition(() => {
                    if (next !== 'trees') {
                        setSourcesScope(sourcesScopeForMainTab(next));
                    } else {
                        setTreesScope('device');
                    }
                });
            },
            get activeTab() {
                return activeTab;
            },
            set activeTab(v) {
                setActiveTab(v);
                bump();
            },
            updateContent() {
                bump();
            },
            close,
        }),
        [mainTab, activeTab, close, bump, setMainTab]
    );

    return {
        mainTab,
        setMainTab,
        activeTab,
        setActiveTab,
        overlay,
        setOverlay,
        targetId,
        setTargetId,
        deleteOverlayTitle,
        deleteOverlayBody,
        deleteAlsoMembersOption,
        deleteAlsoMembersDefault,
        deleteAlsoRetractOption,
        deleteAlsoRetractDefault,
        setDeleteOverlayTitle,
        setDeleteOverlayBody,
        setDeleteAlsoMembersOption,
        setDeleteAlsoMembersDefault,
        setDeleteAlsoRetractOption,
        setDeleteAlsoRetractDefault,
        exportTarget,
        setExportTarget,
        exportBusy,
        setExportBusy,
        sourcesQ,
        setSourcesQ,
        treesQ,
        setTreesQ,
        treesScope,
        setTreesScope,
        treesAdvancedOpen,
        setTreesAdvancedOpen,
        sourcesScope,
        setSourcesScope,
        sourcesAdvancedOpen,
        setSourcesAdvancedOpen,
        sourcesKindFilter,
        setSourcesKindFilter,
        treeFreezeBusy,
        rowActionsOpen,
        toggleRowActions,
        globalDirFilter,
        setGlobalDirFilter,
        globalDirUiTruncated,
        globalDirHitCap,
        globalDirLoading,
        globalDirError,
        globalDirRows,
        globalDirMetrics,
        loadMoreDirectoryCatalog,
        sourcesTreeLoading,
        treeEditor,
        setTreeEditor,
        bump,
        close,
        panelApi,
        modalApi: modalApiRef.current,
        collectCtx,
        getBranchesTabRows,
        actionCtxRef,
        applyDirSort: () =>
            applyGlobalDirectorySortAndMetrics(directoryState(), directorySetters, { onUpdate: bump }),
    };
}
