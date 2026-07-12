/**
 * Import preview copy and confirmation for .arborito files (branch vs composed tree).
 */

import { computeBranchSetHashSync } from './branch-set-hash.js';
import { findLocalTreeWithSameHash } from './tree-dedup.js';
import { computeBranchContentHash, findLocalBranchDuplicate } from './branch-dedup.js';

function escapeDialogHtml(text) {
    return String(text != null ? text : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * @param {import('../../../core/store.js' ).Store} store
 * @param {object} analysis
 * @returns {{ kind: 'branch'|'tree', entry: object } | null}
 */
export function resolveImportDuplicate(store, analysis) {
    const branches = store.userStore?.state?.branches || [];
    const trees = store.userStore?.state?.trees || [];
    const hashJson = (obj) => store.userStore.hashJson(obj);

    if (analysis?.kind === 'composed-tree') {
        const refs = (Array.isArray(analysis.branchRefs) ? analysis.branchRefs : []).map((r) => ({
            branchId: String(r.branchId || '').trim(),
            refId: String(r.branchId || '').trim(),
            networkUrl: String(r.networkUrl || '').trim(),
            sourceUrl: String(r.networkUrl || '').trim(),
            displayName: String(r.displayName || r.branchId || '').trim(),
        }));
        const hash = computeBranchSetHashSync(refs);
        const dup = hash ? findLocalTreeWithSameHash(trees, hash) : null;
        return dup ? { kind: 'tree', entry: dup } : null;
    }

    const archive = analysis?.archive;
    const treeData = archive?.tree;
    if (!treeData) return null;

    const contentHash = computeBranchContentHash(treeData, hashJson);
    const publishedNetworkUrl = String(
        archive.meta?.publishedNetworkUrl || treeData.meta?.publishedNetworkUrl || ''
    ).trim();
    const sourceUniverseId = String(treeData.universeId || archive.meta?.id || '').trim();
    const dup = findLocalBranchDuplicate(branches, {
        contentHash,
        publishedNetworkUrl,
        sourceUniverseId,
        hashJson,
    });
    return dup ? { kind: 'branch', entry: dup } : null;
}

/**
 * @param {object} ui
 * @param {object} analysis from analyzeArboritoImport
 */
export function formatArboritoImportSummary(ui, analysis) {
    const a = analysis || {};
    if (a.kind === 'composed-tree') {
        const lines = [];
        lines.push(ui.importPreviewKindTree || '🌳 Tree (playlist of branches)');
        lines.push(
            String(ui.importPreviewTreeName || 'Name: {name}').replace(/\{name\}/g, a.title || '')
        );
        lines.push(
            String(ui.importPreviewTreeBranchCount || 'Branches: {n}').replace(
                /\{n\}/g,
                String(a.branchCount ?? 0)
            )
        );
        if (a.embeddedBranchCount > 0) {
            lines.push(
                String(ui.importPreviewTreeEmbedded || 'Included on device: {n}').replace(
                    /\{n\}/g,
                    String(a.embeddedBranchCount)
                )
            );
        }
        if (a.externalBranchCount > 0) {
            lines.push(
                String(ui.importPreviewTreeExternal || 'From network (not in file): {n}').replace(
                    /\{n\}/g,
                    String(a.externalBranchCount)
                )
            );
        }
        const refs = Array.isArray(a.branchRefs) ? a.branchRefs : [];
        const cap = 8;
        const shown = refs.slice(0, cap);
        if (shown.length) {
            lines.push(ui.importPreviewBranchList || 'Branches in this tree:');
            for (const r of shown) {
                const tag = r.embedded
                    ? ui.importPreviewBranchEmbedded || '(included)'
                    : ui.importPreviewBranchExternal || '(network)';
                lines.push(`  • ${r.displayName || r.branchId} ${tag}`);
            }
            const extra = refs.length - shown.length;
            if (extra > 0) {
                lines.push(
                    String(ui.importPreviewBranchesMore || '  …and {n} more').replace(
                        /\{n\}/g,
                        String(extra)
                    )
                );
            }
        }
        return lines.join('\n');
    }

    const lines = [];
    lines.push(ui.importPreviewKindBranch || 'Full branch');
    lines.push(String(ui.importPreviewBranchName || 'Name: {name}').replace(/\{name\}/g, a.title || ''));
    if (a.language) {
        lines.push(
            String(ui.importPreviewBranchLanguage || 'Language: {lang}').replace(/\{lang\}/g, a.language)
        );
    }
    if (a.lessonCount != null) {
        lines.push(
            String(ui.importPreviewBranchLessons || 'Lessons in file: {n}').replace(
                /\{n\}/g,
                String(a.lessonCount)
            )
        );
    }
    if (a.languageCount > 1) {
        lines.push(
            String(ui.importPreviewBranchLangCount || 'Languages: {n}').replace(
                /\{n\}/g,
                String(a.languageCount)
            )
        );
    }
    const warns = Array.isArray(a.authorWarnings) ? a.authorWarnings : [];
    if (warns.length) {
        lines.push(ui.importAuthorWarningsHead || 'Authoring notes:');
        for (const w of warns.slice(0, 4)) lines.push(`  • ${w}`);
        if (warns.length > 4) {
            lines.push(
                String(ui.importPreviewWarningsMore || '  …and {n} more notes').replace(
                    /\{n\}/g,
                    String(warns.length - 4)
                )
            );
        }
    }
    return lines.join('\n');
}

function formatArboritoImportConfirmBodyHtml(ui, analysis, duplicate) {
    const isTree = analysis?.kind === 'composed-tree';
    const intro = isTree
        ? ui.importConfirmIntroTree ||
          'This file is a tree (playlist). It will be added to Forest → Trees.'
        : ui.importConfirmIntroBranch ||
          'This file is a branch (full course). It will be added to Forest → Branches.';
    const parts = [`<p class="arborito-dialog-intro">${escapeDialogHtml(intro)}</p>`];

    if (duplicate?.entry) {
        const tpl =
            duplicate.kind === 'tree'
                ? ui.importConfirmDuplicateTree ||
                  'You already have this tree on your device (“{name}”). Confirming will open the existing copy.'
                : ui.importConfirmDuplicateBranch ||
                  'You already have this branch on your device (“{name}”). Confirming will open the existing copy.';
        const note = String(tpl).replace(/\{name\}/g, String(duplicate.entry.name || '').trim());
        parts.push(`<div class="arborito-dialog-duplicate-note">${escapeDialogHtml(note)}</div>`);
    }

    const summary = formatArboritoImportSummary(ui, analysis);
    parts.push(`<div class="arborito-dialog-summary-card">${escapeDialogHtml(summary)}</div>`);
    return parts.join('');
}

/**
 * @param {import('../../../core/store.js' ).Store} store
 * @param {object} analysis
 */
export async function confirmArboritoImport(store, analysis) {
    await store.userStore?.ensureBranchesHydrated?.();
    const ui = store.ui;
    const duplicate = resolveImportDuplicate(store, analysis);
    const isTree = analysis?.kind === 'composed-tree';
    const title = isTree
        ? ui.importConfirmTitleTree || 'Import tree?'
        : ui.importConfirmTitleBranch || 'Import branch?';
    const body = formatArboritoImportConfirmBodyHtml(ui, analysis, duplicate);
    const confirmText = duplicate
        ? ui.importConfirmOpenExisting || 'Open existing'
        : ui.dialogConfirmTitle || 'OK';
    const ok = await store.showDialog({
        type: 'confirm',
        title,
        body,
        bodyHtml: true,
        confirmText,
        dialogIcon: isTree ? '🌳' : '🌿',
    });
    return !!ok;
}
