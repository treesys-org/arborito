import { getArboritoStore as store } from '../../../../../core/store-singleton.js';
import { isOnboardingWizardIncomplete } from '../../../../../shared/lib/onboarding-boot-gate.js';
import { getPanelRef } from '../../../../../app/panel-refs.js';
import { runBibliotecaNetworkLoad } from '../../../../../shared/lib/connected-services/index.js';
import { yieldToPaint } from '../../../../../shared/lib/yield-to-paint.js';
import { finishSourcesLoadSession, captureHadCurriculumBeforeLoad } from '../../sources-session.js';
import { saveFrozenTreeBundle, removeFrozenTreeBundle } from '../../tree-freeze-cache.js';
import { plantNewTree } from './sources-logic.js';
import { sourcesLsGet, sourcesLsSet } from './sources-local-storage.js';

export const PICK_PAGE = 24;

export function ensureNostrUserFirstSeen() {
    const k = 'arborito-nostr-user-first-seen';
    const raw = sourcesLsGet(k);
    if (raw && Number(raw) > 0) return Number(raw);
    const now = Date.now();
    sourcesLsSet(k, String(now));
    return now;
}

export function usageKey(ownerPub, universeId, userPub) {
    return `arborito-tree-usage-v1:${ownerPub}/${universeId}:${userPub}`;
}

export async function withSourcesLoadingChrome(ctx, work) {
    ctx.setSourcesTreeLoading(true);
    ctx.bump();
    await yieldToPaint();
    try {
        return await work();
    } finally {
        ctx.setSourcesTreeLoading(false);
        ctx.bump();
    }
}

export async function withSourcesNetworkLoad(ctx, work) {
    return withSourcesLoadingChrome(ctx, () => runBibliotecaNetworkLoad(work));
}

export function openTreeEditor(ctx, { mode = 'create', treeId = '' } = {}) {
    const isEdit = mode === 'edit' && treeId;
    let name = '';
    let branchIds = [];
    if (isEdit) {
        const entry = store.userStore?.getTree?.(treeId);
        if (!entry) return;
        name = String(entry.name || '');
        branchIds = (entry.branchRefs || [])
            .map((r) => String(r.branchId || r.refId || ''))
            .filter(Boolean);
    }
    ctx.setOverlay('tree-editor');
    ctx.setTreeEditor({
        mode: isEdit ? 'edit' : 'create',
        treeId: isEdit ? String(treeId) : '',
        name,
        branchIds: [...branchIds],
        q: '',
        availShown: PICK_PAGE,
    });
    ctx.bump();
}

export async function saveTreeEditor(ctx) {
    const ed = ctx.treeEditor;
    if (!ed) return;
    const ui = store.ui;
    const name = String(ed.name || '').trim();
    const branchIds = [...(ed.branchIds || [])].map(String).filter(Boolean);
    if (!name) {
        store.notify(ui.sourcesCreateTreePrompt || 'Enter a tree name.', true);
        return;
    }
    if (!branchIds.length) {
        store.notify(ui.sourcesCreateTreeNoBranches || 'Pick at least one branch.', true);
        return;
    }
    const entry = await store.saveComposedTreeFromDraft({
        treeId: ed.mode === 'edit' ? ed.treeId : '',
        name,
        branchIds,
    });
    if (!entry) return;
    ctx.setOverlay(null);
    ctx.setTreeEditor(null);
    ctx.bump();
    if (ed.mode === 'create') {
        const hadCurriculumBeforeLoad = captureHadCurriculumBeforeLoad();
        const ok = await withSourcesLoadingChrome(ctx, () =>
            store.loadComposedTree(entry.id, true, { skipConstructionLoadConfirm: true })
        );
        if (ok) finishSourcesLoadSession(ctx.modalApi, { hadCurriculumBeforeLoad });
        else ctx.bump();
    } else {
        ctx.bump();
    }
}

export async function toggleTreeFreeze(ctx, sourceId) {
    if (!sourceId || ctx.treeFreezeBusy?.[sourceId]) return;
    const ui = store.ui;
    const frozen = store.userStore.isTreeFrozen(sourceId);

    if (frozen) {
        store.userStore.setTreeFrozen(sourceId, false);
        try {
            await removeFrozenTreeBundle(sourceId);
        } catch (e) {
            console.warn('Failed to remove frozen tree bundle', e);
        }
        ctx.bump();
        if (String(store.value.activeSource?.id) === String(sourceId)) {
            store.dispatchEvent(new CustomEvent('graph-update'));
        }
        return;
    }

    if (localStorage.getItem('arborito-freeze-notice-seen') !== '1') {
        const ok = await store.showDialog({
            type: 'confirm',
            title: ui.freezeFirstNoticeTitle || 'Freeze this tree?',
            body:
                ui.freezeFirstNotice ||
                'Saves a copy on your device and stops updates from the network until you unfreeze. This is not the same as published version snapshots.',
            confirmText: ui.freezeFirstNoticeConfirm || 'Freeze',
            cancelText: ui.freezeFirstNoticeCancel || ui.cancel || 'Cancel',
        });
        if (!ok) return;
        localStorage.setItem('arborito-freeze-notice-seen', '1');
    }

    const source = (store.value.communitySources || []).find((s) => String(s.id) === String(sourceId));
    if (!source) {
        store.notify(ui.freezeNoSource || 'Tree not found.', true);
        return;
    }

    ctx.setTreeFreezeBusy((prev) => ({ ...prev, [sourceId]: true }));
    ctx.bump();

    try {
        let treeJson = null;
        if (store.state.activeSource?.id === sourceId && store.state.rawGraphData) {
            treeJson = store.state.rawGraphData;
        } else {
            const out = await store.sourceManager.loadData(source, store.state.lang, true);
            treeJson = out?.json || null;
        }
        if (!treeJson) throw new Error('empty tree');
        const saved = await saveFrozenTreeBundle(sourceId, {
            treeJson,
            frozenAt: Date.now(),
            url: source.url,
        });
        if (!saved) throw new Error('save failed');
        store.userStore.setTreeFrozen(sourceId, true);
        store.notify(ui.freezeSavedOk || 'Tree frozen on this device.');
        if (String(store.value.activeSource?.id) === String(sourceId)) {
            store.dispatchEvent(new CustomEvent('graph-update'));
        }
    } catch (e) {
        console.warn('Tree freeze failed', e);
        store.notify(
            ui.freezeDownloadFailed || 'Could not freeze tree. Check connection and try again.',
            true
        );
    } finally {
        ctx.setTreeFreezeBusy((prev) => {
            const next = { ...prev };
            delete next[sourceId];
            return next;
        });
        ctx.bump();
    }
}

export async function promptForTreeNameAndPlant(ctx) {
    const ui = store.ui;
    let answer = null;
    try {
        answer = await store.prompt(
            ui.plantBranchDesc || 'Name your new branch.',
            ui.treeNamePlaceholder || 'Name your tree...',
            ui.plantBranch || 'Plant branch',
            ui.plantBranchShort || ui.plantBranch || 'New branch'
        );
    } catch (err) {
        console.error('plant prompt failed', err);
        return;
    }
    if (answer == null) return;
    const trimmed = String(answer).trim();
    if (!trimmed) {
        store.notify(ui.treeNameRequired || 'Please enter a tree name.', true);
        return;
    }
    await plantNewTree(ctx.modalApi, trimmed, null);
}

export function closeSourcesModal(opts = {}, embed = false) {
    if (embed) {
        if (opts.returnToMore === false) {
            getPanelRef('sidebar')?.closeMobileMenuIfOpen?.();
        }
        return;
    }
    const cur = store.value && store.value.modal;
    const fromOnb = cur && typeof cur === 'object' && cur.fromOnboarding;
    const userBack = opts.returnToMore !== false;
    if (fromOnb && userBack && isOnboardingWizardIncomplete()) {
        const hint = typeof fromOnb === 'object' ? fromOnb : {};
        const payload = { type: 'onboarding' };
        const returnStep = Number(hint.step);
        if (returnStep === 1 || returnStep === 2) payload.step = returnStep;
        if (hint.view) payload.view = hint.view;
        store.setModal(payload);
        return;
    }
    if (store.isSourcesDismissBlocked()) {
        const ui = store.ui;
        store.notify(ui.sourcesDismissNeedTree || 'Add or load a tree before closing.', true);
        return;
    }
    store.dismissModal({ returnToMore: opts.returnToMore !== false });
}
