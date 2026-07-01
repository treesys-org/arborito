/**
 * Import preview copy and confirmation for .arborito files (branch vs composed tree).
 */

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
                lines.push(`  • 🌿 ${r.displayName || r.branchId} ${tag}`);
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
    lines.push(ui.importPreviewKindBranch || '🌿 Branch (full course)');
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

/**
 * @param {import('../../../core/store.js' ).Store} store
 * @param {object} analysis
 */
export async function confirmArboritoImport(store, analysis) {
    const ui = store.ui;
    const summary = formatArboritoImportSummary(ui, analysis);
    const isTree = analysis?.kind === 'composed-tree';
    const title = isTree
        ? ui.importConfirmTitleTree || 'Import tree?'
        : ui.importConfirmTitleBranch || 'Import branch?';
    const intro = isTree
        ? ui.importConfirmIntroTree ||
          'This file is a tree (playlist). It will be added to Biblioteca → Trees.'
        : ui.importConfirmIntroBranch ||
          'This file is a branch (full course). It will be added to Biblioteca → Branches.';
    const body = `${intro}\n\n${summary}`;
    const ok = await store.confirm(body, title, false);
    return !!ok;
}
