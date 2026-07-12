import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { computeBranchSetHashSync } from '../../forest/api/branch-set-hash.js';

/** Publish baseline / dirty state for branch, composed tree, or network source. */
export function getActivePublishContext(activeSource) {
    const isLocalBranch = fileSystem.isLocalBranch();
    const isLocalComposed = fileSystem.isLocalComposedTree();
    const nostrTreeRef = activeSource?.url ? parseNostrTreeUrl(activeSource.url) : null;
    const isPublicTree = !!nostrTreeRef;

    if (isLocalComposed) {
        const treeId = fileSystem.composedTreeId();
        const entry = treeId ? store.userStore?.getTree?.(treeId) : null;
        const currentHash = entry ? computeBranchSetHashSync(entry.branchRefs || []) : '';
        const publishedHash = String(entry?.publishedBranchSetHash || '').trim();
        const hasPublishedBaseline = !!entry?.publishedNetworkUrl;
        const isDraftDirty =
            hasPublishedBaseline && (!publishedHash || (currentHash && currentHash !== publishedHash));
        const publishedUrl = entry?.publishedNetworkUrl
            ? parseNostrTreeUrl(String(entry.publishedNetworkUrl))
            : null;
        const isPublishedOwner = !!(
            publishedUrl &&
            store.getNostrPublisherPair?.(publishedUrl.pub)?.priv
        );
        return {
            kind: 'composed-tree',
            treeId,
            entry,
            hasPublishedBaseline,
            isDraftDirty,
            publishedNetworkUrl: entry?.publishedNetworkUrl || null,
            isPublishedOwner,
            isComposed: true,
        };
    }

    if (isLocalBranch && activeSource?.url?.startsWith('branch://')) {
        const localId = String(activeSource.url).slice('branch://'.length);
        const entry =
            (store.userStore?.state?.branches || []).find((t) => String(t?.id) === localId) || null;
        const hasPublishedBaseline = !!(entry?.publishedNetworkUrl && entry?.publishedSnapshotHash);
        const isDraftDirty =
            hasPublishedBaseline &&
            entry?.draftHash &&
            entry?.publishedSnapshotHash &&
            String(entry.draftHash) !== String(entry.publishedSnapshotHash);
        const publishedUrl = entry?.publishedNetworkUrl
            ? parseNostrTreeUrl(String(entry.publishedNetworkUrl))
            : null;
        return {
            kind: 'branch',
            localId,
            entry,
            hasPublishedBaseline,
            isDraftDirty,
            publishedNetworkUrl: entry?.publishedNetworkUrl || null,
            isPublishedOwner: !!(
                publishedUrl &&
                store.getNostrPublisherPair?.(publishedUrl.pub)?.priv
            ),
            isComposed: false,
        };
    }

    return {
        kind: isPublicTree ? 'network' : 'other',
        localId: null,
        entry: null,
        hasPublishedBaseline: false,
        isDraftDirty: false,
        publishedNetworkUrl: null,
        isPublishedOwner: false,
        isComposed: false,
    };
}

/**
 * @param {Record<string, string>} ui
 * @param {object} opts
 * @param {'tree_playlist' | 'branch_course' | 'map_folder' | string} opts.scopeKind
 * @param {boolean} [opts.publishingPublic]
 * @param {boolean} [opts.revokingPublic]
 */
export function resolveScopePublishButton(ui, opts = {}) {
    const { activeSource } = store.state;
    const scopeKind = opts.scopeKind || 'branch_course';
    const isLocalComposed = fileSystem.isLocalComposedTree();
    const isLocalBranch = fileSystem.isLocalBranch();
    const publishCtx = getActivePublishContext(activeSource);
    const nostrTreeRef = activeSource?.url ? parseNostrTreeUrl(activeSource.url) : null;
    const isPublicTree = !!nostrTreeRef;
    const publishedNetworkUrlForLocal = publishCtx.publishedNetworkUrl;
    const publishedNetworkParsed = publishedNetworkUrlForLocal
        ? parseNostrTreeUrl(publishedNetworkUrlForLocal)
        : null;
    const isNetworkTreeOwner = !!(
        nostrTreeRef &&
        store.getNostrPublisherPair?.(nostrTreeRef.pub)?.priv
    );
    const isPublishedLocalTreeOwner = !!(
        publishedNetworkParsed &&
        store.getNostrPublisherPair?.(publishedNetworkParsed.pub)?.priv
    );
    const canRetractPublicTree =
        (typeof store.canRetractActivePublicUniverse === 'function' &&
            store.canRetractActivePublicUniverse()) ||
        isPublishedLocalTreeOwner;

    const pubActsAsUnpublish =
        (canRetractPublicTree && isNetworkTreeOwner && isPublicTree) ||
        (!!publishedNetworkParsed && isPublishedLocalTreeOwner) ||
        (isLocalComposed && publishCtx.isPublishedOwner && publishCtx.hasPublishedBaseline);

    const hasBaseline = publishCtx.hasPublishedBaseline;
    const isDraftDirty = publishCtx.isDraftDirty;
    const isUpdate = hasBaseline && isDraftDirty && !pubActsAsUnpublish;
    const isUpToDate = hasBaseline && !isDraftDirty && !pubActsAsUnpublish;

    const pubComposed = scopeKind === 'tree_playlist' || (isLocalComposed && scopeKind !== 'branch_course');
    const pubBranch = scopeKind === 'branch_course';

    const republishPub = canRetractPublicTree && isPublicTree;
    const pubL = pubActsAsUnpublish
        ? ui.revokePublicTreeDockTooltip || 'Retract public tree'
        : isUpdate
          ? pubComposed
              ? ui.publicTreeUpdateComposedTooltip ||
                ui.publicTreeUpdateTooltip ||
                'Update the public tree playlist'
              : ui.publicTreeUpdateBranchTooltip ||
                ui.publicTreeUpdateTooltip ||
                'Update the public branch'
          : isUpToDate
            ? ui.publicTreeUpToDateTooltip || 'Already up to date'
            : pubComposed
              ? ui.publicTreePublishComposedTooltip || ui.publicTreeDockTooltip || 'Publish tree playlist'
              : pubBranch
                ? ui.publicTreePublishBranchTooltip || 'Publish this branch online'
                : ui.publicTreeDockTooltip || 'Make tree public';

    const pubShort = pubActsAsUnpublish
        ? ui.revokePublicTreeDockLabel || 'Retract'
        : isUpdate
          ? pubComposed
              ? ui.publicTreeUpdateComposedLabel || ui.publicTreeUpdateLabel || 'Update tree'
              : ui.publicTreeUpdateBranchLabel || ui.publicTreeUpdateLabel || 'Update branch'
          : isUpToDate
            ? ui.publicTreeUpToDateLabel || 'Up to date'
            : pubComposed
              ? ui.publicTreePublishComposedLabel || ui.publicTreeDockLabel || 'Publish tree'
              : pubBranch
                ? ui.publicTreePublishBranchDockLabel ||
                  ui.publicTreePublishBranchLabel ||
                  'Publish branch'
                : ui.publicTreeDockLabel || 'Publish';

    const pubNote =
        scopeKind === 'branch_course' && isLocalComposed && !pubActsAsUnpublish && !isUpToDate
            ? ui.constructionScopePublishComposedNote ||
              'Publishing updates the whole tree (all branches)'
            : null;

    const pubBusy = !!(opts.publishingPublic || opts.revokingPublic);
    const pubIcon = pubActsAsUnpublish ? '🛑' : isUpdate ? '🔄' : '🌐';
    const busyLabel = pubBusy ? ui.conDockBusy || '…' : pubShort;

    return {
        show: scopeKind !== 'map_folder',
        label: busyLabel,
        title: pubL,
        note: pubNote,
        icon: pubIcon,
        busy: pubBusy,
        disabled: pubBusy || isUpToDate,
        variant: pubActsAsUnpublish ? 'danger' : isUpdate ? 'update' : 'publish',
        actsAsUnpublish: pubActsAsUnpublish,
        isUpdate,
        isUpToDate,
        localId: publishCtx.localId,
        publishCtx,
    };
}

/** Fire scope publish from panel head; construction-panel handles the action. */
export function dispatchConstructionScopePublish() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('arborito-construction-scope-publish'));
}
