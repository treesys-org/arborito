import { getArboritoStore } from '../core/store-singleton.js';
import { mountCurriculum } from '../features/sources/api/mount-curriculum.js';
import { isBibliotecaUiOpen, isBibliotecaSoftMount, isSourcesWelcomeLoadClose } from '../features/sources/api/sources-session.js';
import { DataProcessor } from '../features/tree-graph/api/data-processor.js';
import { normalizeLoadedTreeJson } from '../features/tree-graph/api/tree-load-pipeline.js';
import { repairTreeViewFromRawAction } from './tree-graph-store-actions.js';
import { mergeRemoteGamification } from '../core/user-store/gamification-merge.js';
import { dismissModalAction, notifyAction } from './shell-ui-store-actions.js';
import { isSameActiveNetworkSource } from '../features/sources/api/modals/logic/sources-helpers.js';
import { stripShareTreeParams } from '../features/sources/api/share-tree-url.js';
import {
    maybeSeedArboritoDemo,
    bundledDemoBootSource,
} from '../core/demo/seed-arborito-demo.js';
import { DEMO_BRANCH_ID } from '../core/demo/arborito-demo-ids.js';

function shell() {
    return getArboritoStore();
}

export function commitSourcesState(partial) {
    const store = getArboritoStore();
    if (!store || !partial) return;
    store.update(partial);
}

export async function loadDataAction(source, forceRefresh = true, opts = {}) {
    const store = shell();
    if (!store) return undefined;
    return mountCurriculum(store, source, forceRefresh, opts);
}

function isActiveBundledDemo(store) {
    const src = store?.state?.activeSource;
    if (!src) return false;
    const id = String(src.id || '').trim();
    const url = String(src.url || '').trim();
    return (
        id === DEMO_BRANCH_ID ||
        url === `branch://${DEMO_BRANCH_ID}` ||
        (src.type === 'branch' && id === DEMO_BRANCH_ID)
    );
}

/**
 * Never leave an empty sky graph. Seed + mount the bundled Arborito demo.
 * @param {{ force?: boolean }} [opts] force: remount even when another tree is painted
 * @returns {Promise<boolean>} true when a curriculum source was mounted
 */
export async function ensureMinimumDemoMountedAction(opts = {}) {
    const store = shell();
    if (!store) return false;
    const force = !!opts.force;
    if (!force) {
        if (store.state.treeHydrating) return true;
        if (store.state.data && isActiveBundledDemo(store)) return true;
        if (store.state.data) return true;
    }
    store.update({ constructionMode: false, curriculumEditLang: null });
    try {
        await store.userStore?.ensureBranchesHydrated?.();
    } catch {
        /* ignore */
    }
    try {
        maybeSeedArboritoDemo(store.userStore);
        let src = bundledDemoBootSource(store.userStore);
        if (!src) src = await store.sourceManager?.getDefaultSource?.();
        if (!src) return false;
        if (
            !force &&
            isActiveBundledDemo(store) &&
            String(store.state.activeSource?.id || '') === String(src.id || '') &&
            (store.state.data || store.state.treeHydrating)
        ) {
            return true;
        }
        await loadDataAction(src, true, { skipConstructionLoadConfirm: true });
        return true;
    } catch (e) {
        console.warn('[Arborito] ensure minimum demo failed', e);
        return false;
    }
}

/**
 * After removing the active course: remount Arborito demo (never a blank graph).
 */
export async function clearCanvasAndShowLoadTreeWelcomeAction() {
    const store = shell();
    if (!store) return;
    store.update({ constructionMode: false, curriculumEditLang: null });
    const ok = await ensureMinimumDemoMountedAction({ force: true });
    if (!ok) {
        await loadDataAction(null);
        store.setModal?.({ type: 'sources' });
    }
}

function activeLocalBranchHasStoredData(store) {
    const url = String(store.state.activeSource?.url || '');
    if (!url.startsWith('branch://')) return false;
    const id = url.slice('branch://'.length).split('/')[0];
    if (!id) return false;
    const entry = store.userStore?.state?.branches?.find((b) => String(b.id) === id);
    return !!(entry?.data);
}

export function isSourcesDismissBlockedAction() {
    const store = shell();
    if (!store) return false;
    /* Soft-mount already left Biblioteca for trunk/comic on the graph — not trapped. */
    if (isBibliotecaSoftMount()) return false;
    if (store.state.treeHydrating && !store.state.data) return true;
    const sourcesOpen = isBibliotecaUiOpen(store);
    if (sourcesOpen && (!store.state.data || store.state.treeHydrating)) {
        /* A failed remote load can briefly clear the canvas while activeSource still
         * points at a local branch, do not trap the user in the picker. */
        if (!store.state.data && !store.state.treeHydrating && activeLocalBranchHasStoredData(store)) {
            return false;
        }
        return true;
    }
    const locals = store.userStore?.state?.branches?.length ?? 0;
    return locals === 0 && !store.state.data;
}

export async function maybeAutoLoadCommunityAfterAddAction(addResult) {
    const store = shell();
    if (!store || !addResult || addResult.ok !== true) return;
    const added = addResult.source;
    if (!added?.id) return;
    /* Desktop uses modal `sources`; mobile library is an embed panel.
     * Soft mount keeps this true after we close Biblioteca for progressive graph paint. */
    if (!isBibliotecaUiOpen(store) && !isBibliotecaSoftMount()) return;
    /* Already viewing this network tree — bookmark only, skip remount. */
    if (isSameActiveNetworkSource(store.state.activeSource, added)) {
        if (isSourcesWelcomeLoadClose()) {
            dismissModalAction({ returnToMore: false });
        }
        return true;
    }
    try {
        const ok = await store.loadAndSmartMerge?.(added.id);
        if (!ok) return;
    } catch (e) {
        console.warn('[Arborito] maybeAutoLoadCommunityAfterAdd', e);
        const ui = store.ui || {};
        const msg = String(e?.message || e || '').trim();
        if (msg) {
            const tpl = ui.curriculumLoadFailedSummary || '{message}';
            try {
                notifyAction(tpl.replace(/\{message\}/g, msg), true);
            } catch {
                /* ignore */
            }
        }
        return;
    }
    if (isSourcesWelcomeLoadClose()) {
        dismissModalAction({ returnToMore: false });
    }
    return true;
}

export function proceedWithUntrustedLoadAction() {
    const store = shell();
    if (!store) return;
    let source = store.state.pendingUntrustedSource;
    if (source) {
        /* Shared links default to Add so the course stays in the garden. */
        if (source._fromShareParam && source.url && store.sourceManager?.addCommunitySource) {
            try {
                const added = store.sourceManager.addCommunitySource(null, {
                    resolvedNostrTreeUrl: source.url,
                    codeLabel: source.shareCode || null,
                    contentKind: source.contentKind || undefined,
                });
                if (added?.ok && added.source) {
                    source = { ...added.source, _fromShareParam: true, _openTreeInfoAfterLoad: true };
                } else if (added?.reason === 'duplicate' && added.existing) {
                    source = { ...added.existing, _fromShareParam: true, _openTreeInfoAfterLoad: true };
                }
            } catch {
                /* keep ephemeral source */
            }
        }
        store.update({ modal: null, pendingUntrustedSource: null });
        void loadDataAction(source).then((ok) => {
            if (ok && source._openTreeInfoAfterLoad) {
                queueMicrotask(() => {
                    try {
                        const shareKey = String(source?.id || source?.url || '').trim();
                        const lsKey = `arborito-tree-info-opened-from-share:${shareKey || 'unknown'}`;
                        try {
                            if (localStorage.getItem(lsKey) === '1') return;
                            localStorage.setItem(lsKey, '1');
                        } catch {
                            /* ignore localStorage failures */
                        }
                        store.openTreeInfoModal?.({ fromShare: true });
                    } catch {
                        /* ignore */
                    }
                });
            }
        });
    }
}

export async function cancelUntrustedLoadAction() {
    const store = shell();
    if (!store) return;
    store.update({ modal: null, pendingUntrustedSource: null });
    stripShareTreeParams();
    const defaultSource = await store.sourceManager.getDefaultSource();
    if (defaultSource) {
        loadDataAction(defaultSource);
    } else {
        store.update({ loading: false, error: null });
    }
}

export function processLoadedDataAction(json) {
    const store = shell();
    if (!store) return;
    const graphJson = normalizeLoadedTreeJson(json, store, store.state.activeSource);
    if (!graphJson) return;
    DataProcessor.process(store, graphJson, store.state.activeSource, { suppressReadmeAutoOpen: true });
}

export async function reloadCurrentSourceAction() {
    const store = shell();
    if (!store) return;
    const source = store.state.activeSource;
    if (!source) return;
    if (source.url?.startsWith('tree://')) {
        return store.loadComposedTree?.(source.treeId || source.id);
    }
    if (source.url?.startsWith('branch://')) {
        await store.userStore?.ensureBranchesHydrated?.();
        const { json } = store.sourceManager.readBranchSync(source);
        if (json) processLoadedDataAction(json);
    } else if (typeof store.isNostrTreeSource === 'function' && store.isNostrTreeSource()) {
        return loadDataAction(source, false);
    } else {
        try {
            const out = await store.sourceManager.loadData(source, store.state.lang, false, store.state.rawGraphData);
            if (out.json) processLoadedDataAction(out.json);
        } catch (e) {
            console.warn('[reloadCurrentSource] failed', e);
        }
    }
}

export function applyBundlePayloadAction(unpacked, finalSource) {
    const store = shell();
    if (!store) return;
    const p = unpacked.progress;
    if (p) {
        const us = store.userStore.state;
        for (const id of p.completedNodes || []) {
            us.completedNodes.add(id);
        }
        if (p.memory && typeof p.memory === 'object') {
            for (const [k, v] of Object.entries(p.memory)) {
                us.memory[k] = v;
            }
        }
        if (p.bookmarks && typeof p.bookmarks === 'object') {
            for (const [k, v] of Object.entries(p.bookmarks)) {
                us.bookmarks[k] = v;
            }
        }
        if (p.gameData && typeof p.gameData === 'object') {
            us.gameData = { ...us.gameData, ...p.gameData };
        }
        if (p.gamification && typeof p.gamification === 'object') {
            us.gamification = mergeRemoteGamification(us.gamification, p.gamification);
        }
        store.userStore.persist();
        try {
            localStorage.setItem('arborito-bookmarks', JSON.stringify(us.bookmarks));
        } catch {
            /* ignore */
        }
    }
    if (unpacked.forum && finalSource?.id && finalSource.origin !== 'nostr') {
        store.forumStore.replaceSnapshot(finalSource.id, {
            threads: unpacked.forum.threads,
            messages: unpacked.forum.messages,
            moderationLog: unpacked.forum.moderationLog,
        });
    }
}

export function addCommunitySourceAction(url, opts) {
    return shell()?.addCommunitySource?.(url, opts);
}

export function applyCurriculumPresetLanguageAction(code) {
    return shell()?.applyCurriculumPresetLanguage?.(code);
}

/** Store.prototype, source loading and bundle merge. */
export const mountBundleMethods = {
    loadData: loadDataAction,
    ensureMinimumDemoMounted: ensureMinimumDemoMountedAction,
    clearCanvasAndShowLoadTreeWelcome: clearCanvasAndShowLoadTreeWelcomeAction,
    isSourcesDismissBlocked: isSourcesDismissBlockedAction,
    maybeAutoLoadCommunityAfterAdd: maybeAutoLoadCommunityAfterAddAction,
    repairTreeViewFromRaw: repairTreeViewFromRawAction,
    proceedWithUntrustedLoad: proceedWithUntrustedLoadAction,
    cancelUntrustedLoad: cancelUntrustedLoadAction,
    processLoadedData: processLoadedDataAction,
    reloadCurrentSource: reloadCurrentSourceAction,
    applyBundlePayload: applyBundlePayloadAction,
};

export const sourcesActions = {
    loadData: loadDataAction,
    ensureMinimumDemoMounted: ensureMinimumDemoMountedAction,
    clearCanvasAndShowLoadTreeWelcome: clearCanvasAndShowLoadTreeWelcomeAction,
    isSourcesDismissBlocked: isSourcesDismissBlockedAction,
    maybeAutoLoadCommunityAfterAdd: maybeAutoLoadCommunityAfterAddAction,
    proceedWithUntrustedLoad: proceedWithUntrustedLoadAction,
    cancelUntrustedLoad: cancelUntrustedLoadAction,
    processLoadedData: processLoadedDataAction,
    reloadCurrentSource: reloadCurrentSourceAction,
    applyBundlePayload: applyBundlePayloadAction,
    addCommunitySource: addCommunitySourceAction,
    applyCurriculumPresetLanguage: applyCurriculumPresetLanguageAction,
};
