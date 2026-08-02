import { getArboritoStore as store } from '../../../../../../core/store-singleton.js';
import { isPublishedResourceOwner } from '../../../../../publishing/api/published-owner.js';
import { isBundledDemoBranchId } from '../../../../../publishing/api/demo-tree-guard.js';
import { hasOtherTeamEditors } from '../../../../../publishing/api/published-team-editors.js';
import {
    entryHasPublishHints,
    revokeOwnedPublicOnDelete,
} from '../../../../../publishing/api/published-teardown.js';
import {
    withSourcesLoadingChrome,
    withSourcesNetworkLoad,
    promptForTreeNameAndPlant,
} from '../sources-actions-support.js';
import {
    finishSourcesLoadSession,
    captureHadCurriculumBeforeLoad,
} from '../../../sources-session.js';
import {
    exportBranch,
    exportComposedTree,
    exportNetworkSource,
    shareTreeLink,
    plantNewTree,
} from '../sources-logic.js';

function isNetworkSourceActive(sourceId) {
    const sid = String(sourceId || '').trim();
    if (!sid) return false;
    const active = store.state.activeSource;
    if (!active) return false;
    if (String(active.id) === sid) return true;
    const src = (store.state.communitySources || []).find((s) => String(s.id) === sid);
    if (!src?.url) return false;
    return String(active.url || '') === String(src.url || '');
}

/** @returns {Promise<boolean>} whether the action was handled */
export async function runBranchesAction(ctx, action, fields = {}) {
    const id = fields.id != null ? String(fields.id) : '';
    const name = fields.name != null ? String(fields.name) : '';

    if (action === 'add-branch-to-tree') {
        const bid = String(fields.id || id || '').trim();
        if (!bid) return true;
        const ok = await store.addBranchToTreeInteractive(bid);
        if (ok) ctx.bump();
        return true;
    }

    if (action === 'cancel-overlay') {
        ctx.setOverlay(null);
        ctx.setTargetId(null);
        ctx.setDeleteOverlayTitle?.(null);
        ctx.setDeleteOverlayBody?.(null);
        ctx.setDeleteAlsoMembersOption?.(false);
        ctx.setDeleteAlsoMembersDefault?.(true);
        ctx.setExportTarget?.(null);
        ctx.setExportBusy?.(false);
        ctx.bump();
        return true;
    }

    if (action === 'show-plant') {
        await promptForTreeNameAndPlant(ctx);
        return true;
    }

    if (action === 'show-create-kind') {
        ctx.setOverlay('create-kind');
        ctx.bump();
        return true;
    }

    if (action === 'create-course-named') {
        const trimmed = String(fields.name || '').trim();
        if (!trimmed) {
            store.notify(store.ui?.treeNameRequired || 'Please enter a name.', true);
            return true;
        }
        ctx.setOverlay(null);
        ctx.bump();
        await plantNewTree(ctx.modalApi, trimmed, null);
        return true;
    }

    if (action === 'show-delete') {
        const tid = String(id || '').trim();
        if (isBundledDemoBranchId(tid)) {
            const ui = store.ui;
            store.notify(
                ui.sourcesDemoBranchDeleteBlocked ||
                    'The Arborito demo comes with the app. Duplicate it as your own branch if you want a copy you can delete.',
                true
            );
            return true;
        }
        const branch = store.userStore.state.branches.find((t) => t.id === tid);
        const published = entryHasPublishHints(branch);
        const isOwner =
            published &&
            (isPublishedResourceOwner(branch, store.getNostrPublisherPair.bind(store)) ||
                /* Share-code / meta bind without publishedNetworkUrl (private restore). */
                entryHasPublishHints(branch));
        const ui = store.ui;
        const otherEditors = hasOtherTeamEditors(store);
        const treesUsing = store.userStore.treesReferencingBranch?.(tid) || [];
        const treeNames = treesUsing
            .map((t) => String(t?.name || '').trim())
            .filter(Boolean)
            .join(', ');
        const treesBody = treeNames
            ? String(
                  ui.deleteBranchUsedByTreesBody ||
                      'Used by: {names}. Removing it will unlink it from those trees.'
              ).replace(/\{names\}/g, treeNames)
            : '';
        const publishedBody = published
            ? isOwner
                ? otherEditors
                    ? ui.deletePublishedOwnerHasEditorsBody ||
                      ui.deletePublishedLocalOwnerBody ||
                      ''
                    : ui.deletePublishedOwnerNoEditorsBody ||
                      ui.deletePublishedComposedOwnerBody ||
                      ''
                : ui.deletePublishedLocalBody || ''
            : '';
        const bodyParts = [publishedBody, treesBody].map((s) => String(s || '').trim()).filter(Boolean);
        ctx.setDeleteOverlayTitle(
            published
                ? ui.deletePublishedLocalTitle || ui.deleteBranchConfirm || ui.deleteTreeConfirm
                : ui.deleteBranchConfirm || ui.deleteTreeConfirm
        );
        ctx.setDeleteOverlayBody(bodyParts.length ? bodyParts.join('\n\n') : null);
        ctx.setOverlay('delete');
        ctx.setTargetId(tid);
        ctx.bump();
        return true;
    }

    if (action === 'confirm-delete') {
        const tid = ctx.targetId;
        if (!tid) return true;
        if (isBundledDemoBranchId(tid)) return true;
        const branch = store.userStore.state.branches.find((t) => t.id === tid);
        /* Always try public teardown when any publish bind remains — private
         * delete used to skip this when publishedNetworkUrl was missing after
         * account restore, leaving share codes (#TD9J-…) alive in Discover. */
        if (branch) {
            await revokeOwnedPublicOnDelete(branch, store, {
                branchIdToUnlink: tid,
                contentKind: 'branch',
            });
        }
        /* Account draft must not survive deleting the local branch. Always try
         * while signed in — sync flag may be cleared after sign-out/sign-in. */
        if (store.isSignedIn?.()) {
            try {
                await store.unpublishPrivateBranch?.(tid);
            } catch (e) {
                console.warn('[Arborito] clear private account draft on delete failed', e);
            }
        }
        const active = store.state.activeSource;
        const wasActive =
            active && (active.id === tid || String(active.url || '') === `branch://${tid}`);
        await store.userStore.deleteBranch(tid);
        ctx.setOverlay(null);
        ctx.setTargetId(null);
        ctx.setDeleteOverlayTitle?.(null);
        ctx.setDeleteOverlayBody?.(null);
        if (wasActive) {
            void store.clearCanvasAndShowLoadTreeWelcome();
        } else {
            ctx.bump();
            queueMicrotask(() => store.maybePromptNoTree());
        }
        return true;
    }

    if (action === 'share-tree-row') {
        void shareTreeLink({
            name: fields.shareName || '',
            url: fields.shareUrl || '',
            shareCode: fields.shareCode || '',
            ownerPub: fields.ownerPub || '',
            universeId: fields.universeId || '',
        });
        return true;
    }

    if (action === 'tree-info') {
        const targetId = String(id || '').trim();
        const targetName = String(name || '').trim();
        const kind = String(fields.kind || 'branch').trim();
        if (targetId) {
            if (kind === 'network') {
                if (!isNetworkSourceActive(targetId)) {
                    const ok = await withSourcesNetworkLoad(ctx, () =>
                        store.loadAndSmartMerge(targetId)
                    );
                    if (!ok) return true;
                }
            } else {
                const active = store.value.activeSource;
                const alreadyActive = !!(
                    active &&
                    (String(active.id) === targetId ||
                        String(active.url || '') === `branch://${targetId}`)
                );
                if (!alreadyActive) {
                    await store.loadData({
                        id: targetId,
                        name: targetName || targetId,
                        url: `branch://${targetId}`,
                        type: 'branch',
                        isTrusted: true,
                    });
                }
            }
        }
        const cur = store.value.modal;
        const payload = {
            type: 'tree-info',
            fromSources: true,
            sourcesFocusTab: ctx.activeTab,
        };
        if (cur && typeof cur === 'object' && cur.fromConstructionMore) payload.fromConstructionMore = true;
        if (cur && typeof cur === 'object' && cur.fromMobileMore) payload.fromMobileMore = true;
        store.setModal(payload);
        return true;
    }

    if (action === 'load-branch') {
        const hadCurriculumBeforeLoad = captureHadCurriculumBeforeLoad();
        const ok = await withSourcesNetworkLoad(ctx, () =>
            store.loadData({
                id,
                name,
                url: `branch://${id}`,
                type: 'branch',
                isTrusted: true,
            })
        );
        if (ok) finishSourcesLoadSession(ctx.modalApi, { hadCurriculumBeforeLoad });
        else ctx.bump();
        return true;
    }

    if (action === 'publish-private') {
        const ui = store.ui;
        if (!store.isSignedIn?.()) {
            store.notify(ui.syncLoginNoAccount || 'Sign in with your account first.', true);
            return true;
        }
        try {
            await store.publishBranchAsPrivate(id);
            ctx.bump();
        } catch (e) {
            store.alert(String((e && e.message) || e));
        }
        return true;
    }

    if (action === 'unpublish-private') {
        const ui = store.ui;
        if (!store.isSignedIn?.()) {
            store.notify(ui.syncLoginNoAccount || 'Sign in with your account first.', true);
            return true;
        }
        const tid = String(id || '').trim();
        if (!tid) return true;
        ctx.setDeleteOverlayTitle(ui.privateTreesStopSyncTitle || 'Stop syncing?');
        ctx.setDeleteOverlayBody(
            ui.privateTreesStopSyncBody ||
                'Other devices you sign in on will no longer see this tree. The local copy on this device stays.'
        );
        ctx.setTargetId(tid);
        ctx.setOverlay('stop-private-sync');
        ctx.bump();
        return true;
    }

    if (action === 'reset-branch-progress') {
        const tid = String(id || '').trim();
        if (!tid || isBundledDemoBranchId(tid)) return true;
        const ui = store.ui;
        ctx.setTargetId(tid);
        ctx.setDeleteOverlayTitle?.(ui.sourcesResetBranchProgressTitle || 'Reset progress?');
        ctx.setDeleteOverlayBody?.(
            (ui.sourcesResetBranchProgressBody ||
                'Clears completed lessons and reading position for “{name}” on this device. Certificates already earned stay.').replace(
                /\{name\}/g,
                name || tid
            )
        );
        ctx.setOverlay('reset-branch-progress');
        ctx.bump();
        return true;
    }

    if (action === 'confirm-reset-branch-progress') {
        const tid = String(ctx.targetId || '').trim();
        if (!tid) return true;
        try {
            store.resetBranchProgress?.(tid);
        } catch (e) {
            store.alert?.(String(e?.message || e));
        }
        ctx.setOverlay(null);
        ctx.setTargetId(null);
        ctx.setDeleteOverlayTitle?.(null);
        ctx.setDeleteOverlayBody?.(null);
        ctx.bump();
        return true;
    }

    if (action === 'confirm-stop-private-sync') {
        const tid = String(ctx.targetId || '').trim();
        if (!tid) return true;
        try {
            await store.unpublishPrivateBranch(tid);
            ctx.setOverlay(null);
            ctx.setTargetId(null);
            ctx.setDeleteOverlayTitle(null);
            ctx.setDeleteOverlayBody(null);
            ctx.bump();
        } catch (e) {
            store.alert(String((e && e.message) || e));
        }
        return true;
    }

    if (action === 'export-branch') {
        const kind = String(fields.kind || 'branch').trim() === 'network' ? 'network' : 'branch';
        if (kind === 'network') {
            const targetId = String(id || '').trim();
            if (!targetId) return true;
            if (!isNetworkSourceActive(targetId)) {
                const ok = await withSourcesNetworkLoad(ctx, () =>
                    store.loadAndSmartMerge(targetId)
                );
                if (!ok) return true;
            }
            if (!store.state.rawGraphData?.languages) {
                const ui = store.ui;
                store.notify(
                    ui.sourcesExportFailed || 'Export failed.',
                    true
                );
                return true;
            }
        }
        ctx.setExportTarget({ kind, id, name });
        ctx.setOverlay('export-curriculum');
        ctx.bump();
        return true;
    }

    if (action === 'confirm-export-curriculum') {
        const ui = store.ui;
        const target = ctx.exportTarget;
        if (!target?.id) return true;
        const lang = String(fields.lang || '*');
        const scope = fields.scope === 'all' ? 'all' : 'current';
        ctx.setExportBusy?.(true);
        ctx.bump();
        try {
            if (target.kind === 'tree') {
                await exportComposedTree(target.id, target.name, { lang, scope });
            } else if (target.kind === 'network') {
                await exportNetworkSource(target.id, target.name, { lang, scope });
            } else {
                await exportBranch(target.id, target.name, { lang, scope });
            }
            ctx.setOverlay(null);
            ctx.setExportTarget?.(null);
        } catch (err) {
            console.error(err);
            store.notify(ui.sourcesExportFailed || 'Export failed.', true);
        } finally {
            ctx.setExportBusy?.(false);
            ctx.bump();
        }
        return true;
    }

    return false;
}
