import { getArboritoStore as store } from '../../../../../../core/store-singleton.js';
import { isPublishedResourceOwner } from '../../../../../publishing/api/published-owner.js';
import { isBundledDemoBranchId } from '../../../../../publishing/api/demo-tree-guard.js';
import { hasOtherTeamEditors } from '../../../../../publishing/api/published-team-editors.js';
import { parseNostrTreeUrl } from '../../../../../nostr/api/nostr-refs.js';
import { finishSourcesLoadSession } from '../../../sources-session.js';
import {
    handleSwitch,
    loadBranch,
    exportBranch,
    exportComposedTree,
    shareActiveTree,
    shareTreeLink,
} from '../sources-logic.js';
import {
    withSourcesLoadingChrome,
    withSourcesNetworkLoad,
    promptForTreeNameAndPlant,
} from '../sources-actions-support.js';

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

    if (action === 'set-scope') {
        const next = String(fields.scope || 'all');
        if (next === 'all' || next === 'branch' || next === 'internet' || next === 'saved') {
            ctx.setSourcesScope(next);
            ctx.bump();
        }
        return true;
    }

    if (action === 'cancel-overlay') {
        ctx.setOverlay(null);
        ctx.setTargetId(null);
        ctx.setDeleteOverlayTitle?.(null);
        ctx.setDeleteOverlayBody?.(null);
        ctx.setExportTarget?.(null);
        ctx.setExportBusy?.(false);
        ctx.bump();
        return true;
    }

    if (action === 'show-plant') {
        await promptForTreeNameAndPlant(ctx);
        return true;
    }

    if (action === 'show-delete') {
        const tid = String(id || '').trim();
        if (isBundledDemoBranchId(tid)) {
            const ui = store.ui;
            store.notify(
                ui.sourcesDemoBranchDeleteBlocked ||
                    'The Arborito demo is bundled tutorial content. Duplicate it as your own branch if you want a removable copy.',
                true
            );
            return true;
        }
        const branch = store.userStore.state.branches.find((t) => t.id === tid);
        const published = !!String(branch?.publishedNetworkUrl || '').trim();
        const isOwner = published && isPublishedResourceOwner(branch, store.getNostrPublisherPair.bind(store));
        const ui = store.ui;
        const otherEditors = hasOtherTeamEditors(store);
        ctx.setDeleteOverlayTitle(published ? ui.deletePublishedLocalTitle || ui.deleteTreeConfirm : null);
        ctx.setDeleteOverlayBody(
            published
                ? isOwner
                    ? otherEditors
                        ? ui.deletePublishedOwnerHasEditorsBody ||
                          ui.deletePublishedLocalOwnerBody ||
                          ''
                        : ui.deletePublishedOwnerNoEditorsBody ||
                          ui.deletePublishedComposedOwnerBody ||
                          ''
                    : ui.deletePublishedLocalBody || ''
                : null
        );
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
        const publishedUrl = String(branch?.publishedNetworkUrl || '').trim();
        const isOwner =
            !!publishedUrl &&
            isPublishedResourceOwner(branch, store.getNostrPublisherPair.bind(store));
        if (isOwner && !hasOtherTeamEditors(store)) {
            try {
                const treeRef = parseNostrTreeUrl(publishedUrl);
                if (treeRef) {
                    await store._revokePublicTreeCore(treeRef, {
                        branchIdToUnlink: tid,
                        skipConfirm: true,
                        silent: true,
                    });
                }
            } catch (e) {
                console.warn('[Arborito] revoke branch on delete failed', e);
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

    if (action === 'switch-version') {
        handleSwitch(ctx.modalApi);
        return true;
    }

    if (action === 'share-tree') {
        shareActiveTree();
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
        if (targetId) {
            const active = store.value.activeSource;
            const alreadyActive = !!(
                active &&
                (String(active.id) === targetId || String(active.url || '') === `branch://${targetId}`)
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
        await withSourcesLoadingChrome(ctx, () => loadBranch(ctx.modalApi, id, name));
        return true;
    }

    if (action === 'publish-private') {
        const ui = store.ui;
        if (!store.isSignedIn?.()) {
            store.notify(ui.syncLoginNoAccount || 'Sign in with your account first.', true);
            return true;
        }
        const activeUrl = String(store.state.activeSource?.url || '');
        const targetUrl = `branch://${id}`;
        if (activeUrl !== targetUrl) {
            await withSourcesLoadingChrome(ctx, () => loadBranch(ctx.modalApi, id, ''));
        }
        try {
            await store.publishActiveBranchAsPrivate();
            ctx.bump();
        } catch (e) {
            store.alert(String((e && e.message) || e));
        }
        return true;
    }

    if (action === 'unpublish-private') {
        const ui = store.ui;
        const ok = await store.confirm(
            ui.privateTreesStopSyncBody ||
                'Stop syncing this tree to your account? The local copy on this device stays.',
            ui.privateTreesStopSyncTitle || 'Stop syncing?',
            true
        );
        if (!ok) return true;
        try {
            await store.unpublishPrivateBranch(id);
            ctx.bump();
        } catch (e) {
            store.alert(String((e && e.message) || e));
        }
        return true;
    }

    if (action === 'export-branch') {
        ctx.setExportTarget({ kind: 'branch', id, name });
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

    if (action === 'toggle-sources-advanced') {
        ctx.setSourcesAdvancedOpen(!ctx.sourcesAdvancedOpen);
        ctx.bump();
        return true;
    }

    if (action === 'toggle-row-actions') {
        const k = String(fields.key || '').trim();
        if (!k) return true;
        ctx.toggleRowActions(k);
        return true;
    }

    return false;
}
