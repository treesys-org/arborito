import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSourcesStore } from '../../hooks/useSources.js';
import { runAfterPaint, scheduleIdle } from '../../../../shared/lib/yield-to-paint.js';
import { runThrottledBackgroundTask } from '../../../../shared/lib/background-task-gate.js';
import { collectBranchesTabItems } from '../../api/modals/logic/sources-collect-branches.js';
import {
    scheduleGlobalDirectoryFetch,
    applyGlobalDirectorySortAndMetrics,
} from '../../api/modals/logic/sources-directory-fetch.js';
import { closeSourcesModal } from '../../api/modals/logic/sources-actions/index.js';

function readInitialMainTab(store) {
    const m = store.value.modal;
    if (m && typeof m === 'object' && (m.focusTab === 'trees' || m.focusTab === 'tree' || m.focusTab === 'forest')) {
        return 'trees';
    }
    return 'branches';
}

export function useSourcesState({ embed }) {
    const store = useSourcesStore();
    const [mainTab, setMainTab] = useState(() => readInitialMainTab(store));
    const [activeTab, setActiveTab] = useState(() =>
        readInitialMainTab(store) === 'trees' ? 'trees' : 'branch'
    );
    const [overlay, setOverlay] = useState(null);
    const [targetId, setTargetId] = useState(null);
    const [deleteOverlayTitle, setDeleteOverlayTitle] = useState(null);
    const [deleteOverlayBody, setDeleteOverlayBody] = useState(null);
    const [exportTarget, setExportTarget] = useState(null);
    const [exportBusy, setExportBusy] = useState(false);
    const [sourcesQ, setSourcesQ] = useState('');
    const [treesQ, setTreesQ] = useState('');
    const [treesScope, setTreesScope] = useState('all');
    const [treesAdvancedOpen, setTreesAdvancedOpen] = useState(false);
    const [sourcesScope, setSourcesScope] = useState('all');
    const [sourcesAdvancedOpen, setSourcesAdvancedOpen] = useState(false);
    const [treeFreezeBusy, setTreeFreezeBusy] = useState({});
    const [rowActionsOpen, setRowActionsOpen] = useState(() => new Set());
    const [globalDirFilter, setGlobalDirFilter] = useState('discover');
    const [sourcesLangFilter, setSourcesLangFilter] = useState('*');
    const [globalDirHitCap, setGlobalDirHitCap] = useState(false);
    const [globalDirUiTruncated, setGlobalDirUiTruncated] = useState(false);
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
            closeSourcesModal(opts, embed);
        },
        [embed]
    );

    const modalApiRef = useRef({});
    modalApiRef.current = {
        get _sourcesMainTab() {
            return mainTab;
        },
        set _sourcesMainTab(v) {
            setMainTab(v);
        },
        get activeTab() {
            return activeTab;
        },
        set activeTab(v) {
            setActiveTab(v);
        },
        selectedVersionUrl: null,
        isConnected: true,
        updateContent: bump,
        close,
    };

    const directorySetters = useMemo(
        () => ({
            setGlobalDirRows,
            setGlobalDirMetrics,
            setGlobalDirLoading,
            setGlobalDirError,
            setGlobalDirHitCap,
            setGlobalDirLastFetchAt,
            setGlobalDirLastQuery,
            setGlobalDirTimer,
        }),
        []
    );

    const directoryState = useCallback(
        () => ({
            globalDirFilter,
            globalDirRows,
            globalDirMetrics,
            globalDirLoading,
            globalDirQ,
            globalDirLastFetchAt,
            globalDirLastQuery,
            globalDirTimer,
        }),
        [
            globalDirFilter,
            globalDirRows,
            globalDirMetrics,
            globalDirLoading,
            globalDirQ,
            globalDirLastFetchAt,
            globalDirLastQuery,
            globalDirTimer,
        ]
    );

    const collectCtx = useMemo(
        () => ({
            _sourcesScope: sourcesScope,
            _sourcesQ: sourcesQ,
            _sourcesLangFilter: sourcesLangFilter,
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
            sourcesLangFilter,
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
        deleteOverlayTitle,
        deleteOverlayBody,
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
        setSourcesLangFilter,
        setSourcesTreeLoading,
        toggleRowActions,
        directoryState,
        directorySetters,
    };

    useEffect(() => {
        setGlobalDirQ(sourcesQ);
    }, [sourcesQ]);

    useEffect(() => {
        scheduleGlobalDirectoryFetch(directoryState(), directorySetters, {
            reason: 'input',
            onUpdate: bump,
        });
        return () => {
            const t = globalDirTimer;
            if (t) clearTimeout(t);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [globalDirQ]);

    useEffect(() => {
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
    }, []);

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
                setMainTab(v);
                setActiveTab(v === 'trees' ? 'trees' : 'branch');
                bump();
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
        [mainTab, activeTab, close, bump]
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
        setDeleteOverlayTitle,
        setDeleteOverlayBody,
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
        treeFreezeBusy,
        rowActionsOpen,
        toggleRowActions,
        globalDirFilter,
        setGlobalDirFilter,
        globalDirUiTruncated,
        globalDirLoading,
        globalDirError,
        globalDirRows,
        globalDirMetrics,
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
