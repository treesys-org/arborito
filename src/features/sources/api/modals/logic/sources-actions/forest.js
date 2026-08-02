import { getArboritoStore as store } from '../../../../../../core/store-singleton.js';
import { isPublishedResourceOwner } from '../../../../../publishing/api/published-owner.js';
import { hasOtherTeamEditors } from '../../../../../publishing/api/published-team-editors.js';
import {
    entryHasPublishHints,
    revokeOwnedPublicOnDelete,
} from '../../../../../publishing/api/published-teardown.js';
import { isBundledDemoBranchId } from '../../../../../publishing/api/demo-tree-guard.js';
import { finishSourcesLoadSession, captureHadCurriculumBeforeLoad } from '../../../sources-session.js';
import { importTreeFromFile, shareComposedTree } from '../sources-logic.js';
import {
    findCommunitySourceByUrl,
    canonicalNetworkTreeUrlString,
} from '../sources-helpers.js';
import {
    isUserInstalledNetworkCourse,
    listRemovablePlaylistOrphanCourses,
    playlistDeleteAlsoMembersDefault,
} from '../sources-playlist-member-coverage.js';
import {
    PICK_PAGE,
    withSourcesLoadingChrome,
    withSourcesNetworkLoad,
    openTreeEditor,
    saveTreeEditor,
    toggleTreeFreeze,
} from '../sources-actions-support.js';

async function purgePlaylistOrphanCourses(treeEntry) {
    /* Playlist already removed from trees — orphans = former members not in others. */
    const trees = store.userStore?.state?.trees || [];
    const branches = store.userStore?.state?.branches || [];
    const orphans = listRemovablePlaylistOrphanCourses(treeEntry, trees, {
        branches,
        skipBranchId: (id) => isBundledDemoBranchId(id),
        skipBranch: (branch) =>
            isPublishedResourceOwner(branch, store.getNostrPublisherPair.bind(store)),
    });
    for (const orphan of orphans) {
        /* Keep courses the user installed on their own (Discover / share). */
        if (isUserInstalledNetworkCourse(store.state.communitySources, orphan.networkUrl)) {
            continue;
        }
        const bid = String(orphan.branchId || '').trim();
        if (bid && !isBundledDemoBranchId(bid)) {
            const local = (store.userStore?.state?.branches || []).find(
                (b) => String(b?.id || '') === bid
            );
            if (local) {
                await revokeOwnedPublicOnDelete(local, store, {
                    branchIdToUnlink: bid,
                    contentKind: 'branch',
                });
                if (store.isSignedIn?.()) {
                    try {
                        await store.unpublishPrivateBranch?.(bid);
                    } catch {
                        /* ignore */
                    }
                }
                try {
                    await store.userStore.deleteBranch(bid);
                } catch (e) {
                    console.warn('[Arborito] purge playlist member branch failed', bid, e);
                }
            }
        }
        const url = String(orphan.networkUrl || '').trim();
        if (!url) continue;
        const canon = canonicalNetworkTreeUrlString(url);
        const saved =
            findCommunitySourceByUrl(store.state.communitySources, url) ||
            (store.state.communitySources || []).find((s) => {
                if (String(s?.contentKind || '').trim() === 'composed-tree') return false;
                const su = String(s?.url || '').trim();
                return su === url || (!!canon && canonicalNetworkTreeUrlString(su) === canon);
            });
        if (saved?.id && String(saved.contentKind || '').trim() !== 'composed-tree') {
            try {
                store.removeCommunitySource?.(saved.id);
            } catch (e) {
                console.warn('[Arborito] purge playlist member source failed', saved.id, e);
            }
        }
    }
}

/** @returns {Promise<boolean>} whether the action was handled */
export async function runForestAction(ctx, action, fields = {}) {
    const id = fields.id != null ? String(fields.id) : '';
    const name = fields.name != null ? String(fields.name) : '';

    if (action === 'toggle-tree-freeze') {
        void toggleTreeFreeze(ctx, id);
        return true;
    }

    if (action === 'open-composed-tree') {
        const treeId = String(id || '').trim();
        if (!treeId) return true;
        const hadCurriculumBeforeLoad = captureHadCurriculumBeforeLoad();
        const ok = await withSourcesLoadingChrome(ctx, () => store.loadComposedTree(treeId));
        if (ok) finishSourcesLoadSession(ctx.modalApi, { hadCurriculumBeforeLoad });
        else ctx.bump();
        return true;
    }

    if (action === 'create-composed-tree') {
        openTreeEditor(ctx, {
            mode: 'create',
            name: String(fields.name || '').trim(),
        });
        return true;
    }

    if (action === 'edit-composed-tree') {
        const treeId = String(id || '').trim();
        if (!treeId) return true;
        openTreeEditor(ctx, { mode: 'edit', treeId });
        return true;
    }

    if (action === 'tree-editor-add-branch') {
        const bid = String(fields.branchId || '').trim();
        const ed = ctx.treeEditor;
        if (ed && bid && !ed.branchIds.map(String).includes(bid)) {
            ctx.setTreeEditor({ ...ed, branchIds: [...ed.branchIds, bid] });
            ctx.bump();
        }
        return true;
    }

    if (action === 'tree-editor-remove-branch') {
        const bid = String(fields.branchId || '').trim();
        const ed = ctx.treeEditor;
        if (ed && bid) {
            ctx.setTreeEditor({
                ...ed,
                branchIds: ed.branchIds.filter((x) => String(x) !== bid),
            });
            ctx.bump();
        }
        return true;
    }

    if (action === 'tree-editor-load-more') {
        const ed = ctx.treeEditor;
        if (ed) {
            ctx.setTreeEditor({
                ...ed,
                availShown: (Number(ed.availShown) || PICK_PAGE) + PICK_PAGE,
            });
            ctx.bump();
        }
        return true;
    }

    if (action === 'tree-editor-save') {
        void saveTreeEditor(ctx);
        return true;
    }

    if (action === 'rename-composed-tree') {
        const treeId = String(id || '').trim();
        if (!treeId) return true;
        await store.renameComposedTreeInteractive(treeId);
        ctx.bump();
        return true;
    }

    if (action === 'remix-composed-tree') {
        const treeId = String(id || '').trim();
        if (!treeId) return true;
        const remix = store.remixComposedTree(treeId);
        if (remix) {
            const hadCurriculumBeforeLoad = captureHadCurriculumBeforeLoad();
            const ok = await withSourcesLoadingChrome(ctx, () => store.loadComposedTree(remix.id));
            if (ok) finishSourcesLoadSession(ctx.modalApi, { hadCurriculumBeforeLoad });
            else ctx.bump();
        }
        return true;
    }

    if (action === 'publish-composed-tree') {
        const treeId = String(id || '').trim();
        if (!treeId) return true;
        const ui = store.ui;
        try {
            await store.repairPublishedComposedTree?.(treeId);
        } catch (e) {
            console.warn('[Arborito] pre-publish composed tree repair', e);
        }
        const result = await withSourcesNetworkLoad(ctx, () =>
            store.publishComposedTreeToNostr({ treeId })
        );
        ctx.bump();
        if (result?.publicTreeUrl) {
            const entry = store.userStore.getTree(treeId);
            const offerShare = await store.confirm(
                ui.sourcesTreePublishedSharePrompt ||
                    'Tree published on the network. Copy the share link now?',
                ui.sourcesShareButton || 'Share'
            );
            if (offerShare && entry) {
                await shareComposedTree(treeId);
            }
        }
        return true;
    }

    if (action === 'show-delete-composed-tree') {
        const treeId = String(id || '').trim();
        if (!treeId) return true;
        const entry = store.userStore.getTree?.(treeId);
        const published = entryHasPublishHints(entry);
        const isOwner =
            published &&
            (isPublishedResourceOwner(entry, store.getNostrPublisherPair.bind(store)) ||
                entryHasPublishHints(entry));
        const ui = store.ui;
        const otherEditors = hasOtherTeamEditors(store);
        const orphans = listRemovablePlaylistOrphanCourses(entry, store.userStore?.state?.trees, {
            branches: store.userStore?.state?.branches || [],
            skipBranchId: (bid) => isBundledDemoBranchId(bid),
            skipBranch: (branch) =>
                isPublishedResourceOwner(branch, store.getNostrPublisherPair.bind(store)),
        });
        const purgeable = orphans.filter(
            (o) => !isUserInstalledNetworkCourse(store.state.communitySources, o.networkUrl)
        );
        ctx.setDeleteOverlayTitle?.(
            published
                ? ui.deletePublishedComposedTitle || ui.sourcesDeleteComposedTreeConfirm
                : ui.sourcesDeleteComposedTreeConfirm
        );
        ctx.setDeleteOverlayBody?.(
            published
                ? isOwner
                    ? otherEditors
                        ? ui.deletePublishedOwnerHasEditorsBody ||
                          ui.deletePublishedComposedOwnerBody ||
                          ''
                        : ui.deletePublishedOwnerNoEditorsBody ||
                          ui.deletePublishedComposedOwnerBody ||
                          ''
                    : ui.deletePublishedComposedBody || ''
                : null
        );
        ctx.setDeleteAlsoMembersOption?.(purgeable.length > 0);
        ctx.setDeleteAlsoMembersDefault?.(
            playlistDeleteAlsoMembersDefault(orphans, store.state.communitySources)
        );
        ctx.setOverlay('delete-composed-tree');
        ctx.setTargetId(treeId);
        ctx.bump();
        return true;
    }

    if (action === 'confirm-delete-composed-tree') {
        const treeId = ctx.targetId;
        if (!treeId) return true;
        const entry = store.userStore.getTree?.(treeId);
        /* Explicit checkbox value; default is computed at show time. */
        const purgeMembers = !!ctx.deleteAlsoMembersOption && !!fields.alsoMembers;
        if (entry) {
            await revokeOwnedPublicOnDelete(entry, store, {
                treeIdToUnlink: treeId,
                contentKind: 'composed-tree',
            });
        }
        /* Account draft must not survive deleting the local composed tree. */
        if (store.isSignedIn?.()) {
            try {
                await store.unpublishPrivateComposedTree?.(treeId);
            } catch (e) {
                console.warn('[Arborito] clear private account tree on delete failed', e);
            }
        }
        const wasActive =
            store.state.activeSource?.type === 'composed-tree' &&
            store.state.activeSource.treeId === treeId;
        /* Snapshot refs before deleteTree drops the playlist entry. */
        const entrySnapshot = entry ? { ...entry, branchRefs: [...(entry.branchRefs || [])] } : null;
        await store.userStore.deleteTree(treeId);
        if (purgeMembers && entrySnapshot) {
            try {
                await purgePlaylistOrphanCourses(entrySnapshot);
            } catch (e) {
                console.warn('[Arborito] purge playlist member courses failed', e);
            }
        }
        ctx.setOverlay(null);
        ctx.setTargetId(null);
        ctx.setDeleteOverlayTitle?.(null);
        ctx.setDeleteOverlayBody?.(null);
        ctx.setDeleteAlsoMembersOption?.(false);
        ctx.setDeleteAlsoMembersDefault?.(true);
        if (wasActive) {
            void store.clearCanvasAndShowLoadTreeWelcome();
        } else {
            ctx.bump();
            queueMicrotask(() => store.maybePromptNoTree());
        }
        return true;
    }

    if (action === 'composed-tree-info') {
        const treeId = String(id || '').trim();
        if (!treeId) return true;
        const active = store.state.activeSource;
        const alreadyActive =
            active?.type === 'composed-tree' && String(active.treeId || '') === treeId;
        if (!alreadyActive) {
            await withSourcesLoadingChrome(ctx, () => store.loadComposedTree(treeId));
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

    if (action === 'import-tree') {
        importTreeFromFile(ctx.modalApi);
        return true;
    }

    if (action === 'export-composed-tree') {
        const treeId = String(id || '').trim();
        if (!treeId) return true;
        ctx.setExportTarget({ kind: 'tree', id: treeId, name });
        ctx.setOverlay('export-curriculum');
        ctx.bump();
        return true;
    }

    if (action === 'publish-private-composed-tree') {
        const treeId = String(id || '').trim();
        if (!treeId) return true;
        try {
            await store.publishComposedTreeAsPrivate?.(treeId);
            ctx.bump();
        } catch (e) {
            store.alert?.(String(e?.message || e));
        }
        return true;
    }

    if (action === 'unpublish-private-composed-tree') {
        const treeId = String(id || '').trim();
        if (!treeId) return true;
        const ui = store.ui;
        ctx.setTargetId(treeId);
        ctx.setDeleteOverlayTitle?.(ui.privateTreesStopSyncTitle || 'Stop syncing?');
        ctx.setDeleteOverlayBody?.(
            ui.privateComposedTreeStopSyncBody ||
                ui.privateTreesStopSyncBody ||
                'Other devices you sign in on will no longer see this tree playlist. The local copy on this device stays.'
        );
        ctx.setOverlay('stop-private-composed-sync');
        ctx.bump();
        return true;
    }

    if (action === 'confirm-stop-private-composed-sync') {
        const treeId = String(ctx.targetId || '').trim();
        if (!treeId) return true;
        try {
            await store.unpublishPrivateComposedTree?.(treeId);
            ctx.setOverlay(null);
            ctx.setTargetId(null);
            ctx.setDeleteOverlayTitle?.(null);
            ctx.setDeleteOverlayBody?.(null);
            ctx.bump();
        } catch (e) {
            store.alert?.(String(e?.message || e));
        }
        return true;
    }

    return false;
}
