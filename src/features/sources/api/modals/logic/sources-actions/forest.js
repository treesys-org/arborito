import { getArboritoStore as store } from '../../../../../../core/store-singleton.js';
import { parseNostrTreeUrl } from '../../../../../nostr/api/nostr-refs.js';
import { isPublishedResourceOwner } from '../../../../../publishing/api/published-owner.js';
import { hasOtherTeamEditors } from '../../../../../publishing/api/published-team-editors.js';
import { finishSourcesLoadSession, captureHadCurriculumBeforeLoad } from '../../../sources-session.js';
import { importTreeFromFile, shareComposedTree } from '../sources-logic.js';
import {
    PICK_PAGE,
    withSourcesLoadingChrome,
    withSourcesNetworkLoad,
    openTreeEditor,
    saveTreeEditor,
    toggleTreeFreeze,
} from '../sources-actions-support.js';

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
        openTreeEditor(ctx, { mode: 'create' });
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
        const published = !!String(entry?.publishedNetworkUrl || '').trim();
        const isOwner = published && isPublishedResourceOwner(entry, store.getNostrPublisherPair.bind(store));
        const ui = store.ui;
        const otherEditors = hasOtherTeamEditors(store);
        ctx.setDeleteOverlayTitle?.(
            published ? ui.deletePublishedComposedTitle || ui.sourcesDeleteComposedTreeConfirm : ui.sourcesDeleteComposedTreeConfirm
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
        ctx.setOverlay('delete-composed-tree');
        ctx.setTargetId(treeId);
        ctx.bump();
        return true;
    }

    if (action === 'confirm-delete-composed-tree') {
        const treeId = ctx.targetId;
        if (!treeId) return true;
        const entry = store.userStore.getTree?.(treeId);
        const publishedUrl = String(entry?.publishedNetworkUrl || '').trim();
        const isOwner =
            !!publishedUrl &&
            isPublishedResourceOwner(entry, store.getNostrPublisherPair.bind(store));
        if (isOwner && !hasOtherTeamEditors(store)) {
            try {
                const treeRef = parseNostrTreeUrl(publishedUrl);
                if (treeRef) {
                    await store._revokePublicTreeCore(treeRef, {
                        treeIdToUnlink: treeId,
                        contentKind: 'composed-tree',
                        skipConfirm: true,
                        silent: true,
                    });
                }
            } catch (e) {
                console.warn('[Arborito] revoke composed tree on delete failed', e);
            }
        }
        const wasActive =
            store.state.activeSource?.type === 'composed-tree' &&
            store.state.activeSource.treeId === treeId;
        await store.userStore.deleteTree(treeId);
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

    return false;
}
