import { getArboritoStore as store } from '../../../../../../core/store-singleton.js';
import { finishSourcesLoadSession } from '../../../sources-session.js';
import { exportComposedTree, importTreeFromFile } from '../sources-logic.js';
import {
    PICK_PAGE,
    withSourcesLoadingChrome,
    withSourcesNetworkLoad,
    openTreeEditor,
    saveTreeEditor,
    toggleTreeFreeze,
} from '../sources-actions-support.js';

/** @returns {Promise<boolean>} whether the action was handled */
export async function runTreesAction(ctx, action, fields = {}) {
    const id = fields.id != null ? String(fields.id) : '';
    const name = fields.name != null ? String(fields.name) : '';

    if (action === 'toggle-tree-freeze') {
        void toggleTreeFreeze(ctx, id);
        return true;
    }

    if (action === 'open-composed-tree') {
        const treeId = String(id || '').trim();
        if (!treeId) return true;
        const ok = await withSourcesLoadingChrome(ctx, () => store.loadComposedTree(treeId));
        if (ok) finishSourcesLoadSession(ctx.modalApi);
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
            const ok = await withSourcesLoadingChrome(ctx, () => store.loadComposedTree(remix.id));
            if (ok) finishSourcesLoadSession(ctx.modalApi);
            else ctx.bump();
        }
        return true;
    }

    if (action === 'share-composed-tree') {
        const treeId = String(id || '').trim();
        if (!treeId) return true;
        const { shareComposedTree } = await import('../../../share-tree-link.js');
        await shareComposedTree(treeId);
        return true;
    }

    if (action === 'publish-composed-tree') {
        const treeId = String(id || '').trim();
        if (!treeId) return true;
        const ui = store.ui;
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
                const { shareComposedTree } = await import('../../../share-tree-link.js');
                await shareComposedTree(treeId);
            }
        }
        return true;
    }

    if (action === 'delete-composed-tree') {
        const treeId = String(id || '').trim();
        if (!treeId) return true;
        const ui = store.ui;
        const ok = await store.confirm(
            ui.sourcesDeleteComposedTreeConfirm || 'Remove this tree from your library?',
            ui.sourceRemove || 'Remove'
        );
        if (!ok) return true;
        const wasActive =
            store.state.activeSource?.type === 'composed-tree' &&
            store.state.activeSource.treeId === treeId;
        store.userStore.deleteTree(treeId);
        if (wasActive) {
            await store.clearCanvasAndShowLoadTreeWelcome();
        } else {
            ctx.bump();
        }
        return true;
    }

    if (action === 'toggle-trees-advanced') {
        ctx.setTreesAdvancedOpen(!ctx.treesAdvancedOpen);
        ctx.bump();
        return true;
    }

    if (action === 'set-trees-scope') {
        const next = String(fields.treesScope || 'all');
        if (next === 'all' || next === 'device' || next === 'internet' || next === 'saved') {
            ctx.setTreesScope(next);
            ctx.bump();
        }
        return true;
    }

    if (action === 'composed-tree-info') {
        const treeId = String(id || '').trim();
        const entry = store.userStore.getTree?.(treeId);
        if (!entry) return true;
        const ui = store.ui;
        const { resolveBranchRefDisplayNames } = await import('../../../../../trees/api/tree-branch-labels.js');
        const { formatAttributionSummary, attributionFromPresentation } = await import(
            '../../../../../../shared/lib/arborito-attribution.js' );
        const names = resolveBranchRefDisplayNames(entry.branchRefs);
        const lines = [
            String(ui.importPreviewTreeName || 'Name: {name}').replace(/\{name\}/g, entry.name || ''),
            String(ui.importPreviewTreeBranchCount || 'Branches: {n}').replace(/\{n\}/g, String(names.length)),
        ];
        if (names.length) {
            lines.push(ui.importPreviewBranchList || 'Branches in this tree:');
            for (const n of names.slice(0, 12)) lines.push(`  • 🌿 ${n}`);
            const extra = names.length - 12;
            if (extra > 0) {
                lines.push(
                    String(ui.importPreviewBranchesMore || '  …and {n} more').replace(
                        /\{\{n\}\}/g,
                        String(extra)
                    )
                );
            }
        }
        const attr = attributionFromPresentation(entry.presentation || {}, {
            forkOf: entry.forkOf,
            contentKind: 'composed-tree',
        });
        const attrBlock = formatAttributionSummary(ui, attr);
        if (attrBlock) lines.push('', attrBlock);
        if (entry.publishedNetworkUrl) {
            lines.push(`${ui.sourcesPillPublished || 'Published'}: ${entry.publishedNetworkUrl}`);
        } else {
            lines.push(ui.sourcesPillLocal || 'On device');
        }
        await store.acknowledge({
            title: ui.sourcesComposedTreeInfoTitle || ui.sourcesComposedTreeInfoButton || 'Tree information',
            body: lines.join('\n'),
            dialogIcon: '🌳',
            confirmText: ui.importTreeDoneOk || ui.dialogConfirmTitle || 'OK',
        });
        return true;
    }

    if (action === 'import-tree') {
        importTreeFromFile(ctx.modalApi);
        return true;
    }

    if (action === 'export-composed-tree') {
        const ui = store.ui;
        const treeId = String(id || '').trim();
        if (!treeId) return true;
        try {
            await exportComposedTree(treeId, name);
        } catch (err) {
            console.error(err);
            store.notify(ui.sourcesExportFailed || 'Export failed.', true);
        }
        return true;
    }

    return false;
}
