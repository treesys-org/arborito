import { useEffect, useRef } from 'react';
import { useTreeGraphSlice } from '../../../stores/tree-graph-store.js';
import { useTreeGraphStore } from './useTreeGraph.js';
import { buildStateSig, diffStateSig } from '../api/logic/graph-state-sig.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import {
    clampMobileTrunkScrollForVisibleRoot,
    regroundMobileTrunkScroll,
    resolveScrollHosts,
} from '../api/logic/path-scroll.js';
import {
    markTrunkGestureStart,
    markTrunkGestureMove,
    markTrunkGestureScroll,
    markTrunkGestureEnd,
} from '../api/logic/trunk-scroll-gesture.js';
import { syncTreePresentationSlot as syncTreePresentationSlotApi, createGraphPanelRef } from '../api/graph-panel-api.js';
import { linkPanelDom, registerPanelRef, unlinkPanelDom, unregisterPanelRef } from '../../../app/panel-refs.js';
import {
    CURRICULUM_SWITCHER_BTN_ID,
    TREE_SWITCHER_BTN_ID,
    TREE_SWITCHER_PANEL_ID,
} from '../api/logic/graph-mobile-shared.js';

/**
 * Graph panel lifecycle, listeners + scroll clamp; no graph engine.
 */
export function useGraphPanel(rootRef, opts = {}) {
    const store = useTreeGraphStore();
    const optsRef = useRef(opts);
    optsRef.current = opts;
    const dataId = useTreeGraphSlice((s) => s.data?.id);
    const constructionMode = useTreeGraphSlice((s) => s.constructionMode);
    const treeHydrating = useTreeGraphSlice((s) => s.treeHydrating);
    const lastSigRef = useRef('');
    const scrollLockRef = useRef(false);
    const hostRefsRef = useRef(opts.hostRefs);

    hostRefsRef.current = opts.hostRefs;

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return undefined;

        if (optsRef.current.embed) {
            root.dataset.embed = '1';
        }

        const panelApi = createGraphPanelRef(root);
        registerPanelRef('graph', panelApi);
        linkPanelDom(root, panelApi);

        const gc = optsRef.current.graphContainerRef?.current ?? null;
        if (gc) {
            gc.setAttribute('role', 'region');
            gc.setAttribute('aria-label', store.ui?.graphRegionAria || 'Branch map');
        }

        const onStateChange = (e) => {
            const next = buildStateSig(e.detail || {});
            if (next === lastSigRef.current) return;
            const prev = lastSigRef.current;
            lastSigRef.current = next;
            const diff = diffStateSig(prev, next);

            const transientRootClear =
                diff.graphRootId &&
                !diff.dataId &&
                diff.next.treeHydrating === '1' &&
                diff.next.graphRootId === '';
            const realRootChanged = diff.graphRootId && !transientRootClear;

            if (diff.dataId || realRootChanged) {
                store.patchGraphUi({
                    treeSwitcherOpen: false,
                    pendingMoveNodeId: null,
                });
                if (diff.dataId && diff.next.dataId && diff.next.dataId !== diff.prev.dataId) {
                    store.setTreePaintPending(true);
                }
                if (diff.dataId && !diff.next.dataId) {
                    store.setTreePaintPending(false);
                }
                if (diff.dataId && diff.prev.dataId !== '') {
                    store.resetGraphUiForNewTree?.();
                }
            }

            if (diff.constructionMode) {
                store.setGraphMoveMode(false);
                store.setPendingMoveNodeId(null);
                store.bumpGraphUiRevision();
                if (diff.next.constructionMode === '1') {
                    store.patchGraphUi({ syncConstructionRootTrunkScroll: true });
                    const dataRoot = store.value.data;
                    if (dataRoot) {
                        const g = store.state.graphUi;
                        const path = g?.mobilePath;
                        if (!Array.isArray(path) || path.length === 0) {
                            store.navigateMobilePath([String(dataRoot.id)]);
                        }
                        const tailId = (store.state.graphUi?.mobilePath || [])[
                            (store.state.graphUi?.mobilePath || []).length - 1
                        ];
                        const tail = store.findNode(tailId);
                        store.selectMobileNode(
                            tail && tail.type ? String(tailId) : String(dataRoot.id)
                        );
                    } else {
                        store.selectMobileNode(null);
                    }
                } else {
                    store.selectMobileNode(null);
                }
            }

            if (diff.treeHydrating && diff.prev.treeHydrating === '1' && diff.next.treeHydrating === '0') {
                store.closeUnifiedCurriculumSwitcher?.();
            }

            if (diff.editLang) {
                store.bumpGraphUiRevision();
            }

            const needsRepaint =
                diff.dataId ||
                realRootChanged ||
                (diff.treeHydrating && diff.prev.treeHydrating === '1' && diff.next.treeHydrating === '0') ||
                diff.theme ||
                diff.constructionMode ||
                diff.completedSize ||
                diff.harvestedCount ||
                diff.editLang;

            if (needsRepaint) {
                store.bumpGraphUiRevision();
            }

            if (!store.state.data && !store.state.treeHydrating && store.state.rawGraphData?.languages) {
                if (store.state.activeSource && typeof store.repairTreeViewFromRaw === 'function') {
                    queueMicrotask(() => store.repairTreeViewFromRaw());
                }
            }

            const paintPending = !!store.state.graphUi?.treePaintPending;
            if (paintPending && store.state.data) {
                store.setTreePaintPending(false);
            }
        };

        const onGraphUpdate = () => store.bumpGraphUiRevision();

        const onSetMobilePath = (e) => {
            const ids = e.detail?.ids;
            if (!Array.isArray(ids) || ids.length === 0) return;
            store.navigateMobilePath(ids.map((id) => String(id)));
        };

        const onOpenCurriculumSwitcher = (e) => {
            const d = e?.detail || {};
            const p = d.preferTab;
            const tab =
                d.versionsOnly || p === 'version'
                    ? 'version'
                    : p === 'tree' || d.treesOnly
                      ? 'tree'
                      : 'tree';
            store.patchGraphUi({
                curriculumSwitcherTreesOnly: false,
                curriculumSwitcherVersionsOnly: false,
                curriculumSwitcherTab: tab,
            });
            store.openUnifiedCurriculumSwitcher(root);
        };

        const onDocClickCurriculum = (e) => {
            const g = store.state.graphUi;
            if (!g?.treeSwitcherOpen) return;
            if (g.suppressCurriculumDocCloseUntil && Date.now() < g.suppressCurriculumDocCloseUntil) return;
            const t = e.target;
            const inSwitcher =
                typeof t.closest === 'function' &&
                t.closest(
                    `#${CURRICULUM_SWITCHER_BTN_ID}, #${TREE_SWITCHER_BTN_ID}, #${TREE_SWITCHER_PANEL_ID}, .arborito-tree-switcher-chip, .arborito-curriculum-switcher-host`
                );
            if (inSwitcher) return;
            store.closeUnifiedCurriculumSwitcher();
        };

        const handleKeydown = (e) => {
            const t = e.target;
            if (t instanceof Element) {
                if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
                if (t.isContentEditable || t.closest('[contenteditable="true"]')) return;
            }
            const g = store.state.graphUi;
            if (e.key === 'Escape' && g?.treeSwitcherOpen) {
                e.preventDefault();
                store.closeUnifiedCurriculumSwitcher();
                return;
            }
            const selectedId = g?.selectedNodeId;
            if (store.value.constructionMode && selectedId && fileSystem.features.canWrite) {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    const dn = store.findNode(selectedId);
                    if (dn?._composedWrapper) return;
                    store.handleGraphDockAction('delete', {}, root);
                    return;
                }
                if (e.key === 'm' || e.key === 'M') {
                    const mn = store.findNode(selectedId);
                    if (mn?.type === 'root' || mn?._composedWrapper) return;
                    store.openMoveNodePicker(root);
                }
            }
        };

        const onResize = () => {
            const delay = typeof window !== 'undefined' && window.arboritoElectron ? 0 : 120;
            if (onResize._timer) clearTimeout(onResize._timer);
            onResize._timer = setTimeout(() => {
                const w = window.innerWidth;
                const h = window.innerHeight;
                const dimChanged = w !== onResize._lastW || h !== onResize._lastH;
                onResize._lastW = w;
                onResize._lastH = h;
                syncTreePresentationSlotApi(root);
                if (dimChanged) store.bumpGraphUiRevision();
            }, delay);
        };
        onResize._lastW = window.innerWidth;
        onResize._lastH = window.innerHeight;

        const onViewport = () => onResize();
        const onEmojiReady = () => store.bumpGraphUiRevision();
        const onConstructionScopeChanged = () => store.bumpGraphUiRevision();

        const trunkContainer = optsRef.current.hostRefs?.trunkContainer?.current;
        const trunkTouchOpts = { passive: true, capture: true };
        const onTrunkScroll = () => {
            markTrunkGestureScroll();
            const hosts = resolveScrollHosts(hostRefsRef.current);
            clampMobileTrunkScrollForVisibleRoot(hosts, scrollLockRef);
        };
        const onTrunkTouchStart = () => markTrunkGestureStart();
        const onTrunkTouchMove = () => markTrunkGestureMove();
        const onTrunkTouchEnd = () => markTrunkGestureEnd();
        const onTrunkTouchCancel = () => markTrunkGestureEnd();

        const onOrientation = () => {
            if (onOrientation._timer) clearTimeout(onOrientation._timer);
            onOrientation._timer = setTimeout(onResize, 200);
        };

        lastSigRef.current = '';
        onStateChange({ detail: store.value });
        store.addEventListener('state-change', onStateChange);
        store.addEventListener('graph-update', onGraphUpdate);
        store.addEventListener('arborito-set-mobile-path', onSetMobilePath);
        store.addEventListener('open-curriculum-switcher', onOpenCurriculumSwitcher);
        document.addEventListener('click', onDocClickCurriculum);
        window.addEventListener('keydown', handleKeydown);
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onOrientation);
        window.addEventListener('arborito-viewport', onViewport);
        window.addEventListener('arborito-emoji-ready', onEmojiReady);
        window.addEventListener('arborito-construction-scope-changed', onConstructionScopeChanged);
        trunkContainer?.addEventListener('scroll', onTrunkScroll, { passive: true });
        trunkContainer?.addEventListener('touchstart', onTrunkTouchStart, trunkTouchOpts);
        trunkContainer?.addEventListener('touchmove', onTrunkTouchMove, trunkTouchOpts);
        trunkContainer?.addEventListener('touchend', onTrunkTouchEnd, trunkTouchOpts);
        trunkContainer?.addEventListener('touchcancel', onTrunkTouchCancel, trunkTouchOpts);

        return () => {
            store.removeEventListener('state-change', onStateChange);
            store.removeEventListener('graph-update', onGraphUpdate);
            store.removeEventListener('arborito-set-mobile-path', onSetMobilePath);
            store.removeEventListener('open-curriculum-switcher', onOpenCurriculumSwitcher);
            document.removeEventListener('click', onDocClickCurriculum);
            window.removeEventListener('keydown', handleKeydown);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onOrientation);
            if (onOrientation._timer) clearTimeout(onOrientation._timer);
            window.removeEventListener('arborito-viewport', onViewport);
            window.removeEventListener('arborito-emoji-ready', onEmojiReady);
            window.removeEventListener('arborito-construction-scope-changed', onConstructionScopeChanged);
            trunkContainer?.removeEventListener('scroll', onTrunkScroll);
            trunkContainer?.removeEventListener('touchstart', onTrunkTouchStart, trunkTouchOpts);
            trunkContainer?.removeEventListener('touchmove', onTrunkTouchMove, trunkTouchOpts);
            trunkContainer?.removeEventListener('touchend', onTrunkTouchEnd, trunkTouchOpts);
            trunkContainer?.removeEventListener('touchcancel', onTrunkTouchCancel, trunkTouchOpts);
            if (onResize._timer) clearTimeout(onResize._timer);
            unlinkPanelDom(root);
            unregisterPanelRef('graph');
        };
    }, [rootRef]);

    useEffect(() => {
        syncTreePresentationSlotApi(rootRef.current);
    }, [rootRef, dataId, constructionMode]);
}

export { regroundMobileTrunkScroll };
