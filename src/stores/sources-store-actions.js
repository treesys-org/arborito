import { getArboritoStore } from '../core/store-singleton.js';
import { mountCurriculum } from '../features/sources/api/mount-curriculum.js';
import { isSourcesWelcomeLoadClose } from '../features/sources/api/sources-session.js';
import { DataProcessor } from '../features/tree-graph/api/data-processor.js';
import { normalizeLoadedTreeJson } from '../features/tree-graph/api/tree-load-pipeline.js';
import { repairTreeViewFromRawAction } from './tree-graph-store-actions.js';
import { dismissModalAction, notifyAction } from './shell-ui-store-actions.js';

function shell() {
    return getArboritoStore();
}

export function commitSourcesState(partial) {
    const store = getArboritoStore();
    if (!store || !partial) return;
    store.update(partial);
}

export async function loadDataAction(source, forceRefresh = true) {
    const store = shell();
    if (!store) return undefined;
    return mountCurriculum(store, source, forceRefresh);
}

export async function clearCanvasAndShowLoadTreeWelcomeAction() {
    const store = shell();
    if (!store) return;
    await loadDataAction(null);
    store.update({ constructionMode: false, curriculumEditLang: null });
    dismissModalAction();
    queueMicrotask(() => store.setModal?.({ type: 'sources' }));
}

export function isSourcesDismissBlockedAction() {
    const store = shell();
    if (!store) return false;
    if (store.state.treeHydrating && !store.state.data) return true;
    const m = store.state.modal;
    const sourcesOpen = m && (m === 'sources' || (typeof m === 'object' && m.type === 'sources'));
    if (sourcesOpen && (!store.state.data || store.state.treeHydrating)) return true;
    const locals = store.userStore?.state?.branches?.length ?? 0;
    return locals === 0 && !store.state.data;
}

export async function maybeAutoLoadCommunityAfterAddAction(addResult) {
    const store = shell();
    if (!store || !addResult || addResult.ok !== true) return;
    const added = addResult.source;
    if (!added?.id) return;
    const m = store.state.modal;
    const sourcesOpen = m && (m === 'sources' || (typeof m === 'object' && m.type === 'sources'));
    if (!sourcesOpen) return;
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
    const source = store.state.pendingUntrustedSource;
    if (source) {
        store.update({ modal: null, pendingUntrustedSource: null });
        loadDataAction(source);
    }
}

export async function cancelUntrustedLoadAction() {
    const store = shell();
    if (!store) return;
    store.update({ modal: null, pendingUntrustedSource: null });
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
            const g = us.gamification;
            const bg = p.gamification;
            if ((bg.xp || 0) > (g.xp || 0)) g.xp = bg.xp;
            g.dailyXP = Math.max(g.dailyXP || 0, bg.dailyXP || 0);
            g.streak = Math.max(g.streak || 0, bg.streak || 0);
            if (bg.username && (!g.username || g.username === '')) g.username = bg.username;
            if (bg.avatar && (!g.avatar || g.avatar === '👤' || g.avatar === '🌱')) g.avatar = bg.avatar;
            if (Array.isArray(bg.seeds) && bg.seeds.length > ((g.seeds && g.seeds.length) || 0)) {
                g.seeds = bg.seeds;
            }
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

/** Store.prototype — source loading and bundle merge. */
export const mountBundleMethods = {
    loadData: loadDataAction,
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
