/**
 * Branch = one course; tree/composed-tree = playlist of branches.
 * Prefer this over aboutKind for publish/unpublish copy.
 *
 * @param {string|null|undefined} kind
 * @returns {'branch' | 'composed-tree' | 'network' | 'other'}
 */
export function normalizePublishContentKind(kind) {
    const k = String(kind || '').trim();
    if (k === 'branch' || k === 'composed-tree' || k === 'network') return k;
    if (k === 'composed' || k === 'tree' || k === 'tree_playlist') return 'composed-tree';
    return 'other';
}

/**
 * Infer content kind from revoke/publish opts and optional publish context.
 * @param {{ contentKind?: string, branchIdToUnlink?: string|null, treeIdToUnlink?: string|null, publishCtx?: { kind?: string } }} [opts]
 */
export function resolvePublishContentKind(opts = {}) {
    if (opts.contentKind) return normalizePublishContentKind(opts.contentKind);
    if (opts.branchIdToUnlink) return 'branch';
    if (opts.treeIdToUnlink) return 'composed-tree';
    if (opts.publishCtx?.kind) return normalizePublishContentKind(opts.publishCtx.kind);
    return 'other';
}

/**
 * Unpublish confirm + success copy keyed by content kind.
 * @param {Record<string, string>} ui
 * @param {string} [kind]
 */
export function resolveUnpublishDialogCopy(ui = {}, kind) {
    const k = normalizePublishContentKind(kind);

    if (k === 'branch') {
        return {
            confirmTitle:
                ui.revokePublicBranchConfirmTitle ||
                ui.revokePublicTreeConfirmTitle ||
                'Unpublish this public branch?',
            confirmBody:
                ui.revokePublicBranchConfirmBody ||
                ui.revokePublicTreeConfirmBody ||
                'Your branch will stop appearing on the public network. Old links may stop working. Unpublish?',
            successTitle:
                ui.revokePublicBranchSuccessTitle ||
                ui.revokePublicTreeSuccessTitle ||
                'Branch unpublished',
            successBody:
                ui.revokePublicBranchSuccessBody ||
                ui.revokePublicTreeSuccessBody ||
                'The public network was asked to stop serving this branch. You can publish again with a new link anytime.',
            noKeyBody:
                ui.revokePublicBranchNoKeyBody ||
                ui.revokePublicTreeNoKeyBody ||
                'Unpublishing requires the same browser profile that published this branch. If you cleared storage or use another device, you cannot sign the unpublish from here.',
            dockTooltip:
                ui.revokePublicBranchDockTooltip ||
                ui.revokePublicTreeDockTooltip ||
                'Unpublish this branch from the public network (requires publisher key on this device)',
        };
    }

    if (k === 'composed-tree') {
        return {
            confirmTitle:
                ui.revokePublicComposedConfirmTitle ||
                ui.revokePublicTreeConfirmTitle ||
                'Unpublish this public tree?',
            confirmBody:
                ui.revokePublicComposedConfirmBody ||
                ui.revokePublicTreeConfirmBody ||
                'Your tree (playlist) will stop appearing on the public network. Old links may stop working. Unpublish?',
            successTitle:
                ui.revokePublicComposedSuccessTitle ||
                ui.revokePublicTreeSuccessTitle ||
                'Tree unpublished',
            successBody:
                ui.revokePublicComposedSuccessBody ||
                ui.revokePublicTreeSuccessBody ||
                'The public network was asked to stop serving this tree. You can publish again with a new link anytime.',
            noKeyBody:
                ui.revokePublicComposedNoKeyBody ||
                ui.revokePublicTreeNoKeyBody ||
                'Unpublishing requires the same browser profile that published this tree. If you cleared storage or use another device, you cannot sign the unpublish from here.',
            dockTooltip:
                ui.revokePublicComposedDockTooltip ||
                ui.revokePublicTreeDockTooltip ||
                'Unpublish this tree from the public network (requires publisher key on this device)',
        };
    }

    /* network / unknown: kind-neutral “public copy” */
    return {
        confirmTitle: ui.revokePublicTreeConfirmTitle || 'Unpublish this public copy?',
        confirmBody:
            ui.revokePublicTreeConfirmBody ||
            'Your public copy will stop appearing on the public network. Old links may stop working. Unpublish?',
        successTitle: ui.revokePublicTreeSuccessTitle || 'Unpublished',
        successBody:
            ui.revokePublicTreeSuccessBody ||
            'The public network was asked to stop serving this public copy. You can publish again with a new link anytime.',
        noKeyBody:
            ui.revokePublicTreeNoKeyBody ||
            'Unpublishing requires the same browser profile that published this public copy. If you cleared storage or use another device, you cannot sign the unpublish from here.',
        dockTooltip:
            ui.revokePublicTreeDockTooltip ||
            'Unpublish this public copy from the network (requires publisher key on this device)',
    };
}

/**
 * First-publish success title (republish keeps Changes published).
 * @param {Record<string, string>} ui
 * @param {string} [kind]
 */
export function resolvePublishSuccessTitle(ui = {}, kind) {
    const k = normalizePublishContentKind(kind);
    if (k === 'composed-tree') {
        return ui.publicTreeSuccessTitleComposed || ui.publicTreeSuccessTitle || 'Your tree is online';
    }
    return ui.publicTreeSuccessTitleBranch || ui.publicTreeSuccessTitle || 'Your branch is online';
}
