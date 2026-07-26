import { resolveUnpublishDialogCopy } from '../../publishing/api/resolve-publish-content-copy.js';
import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { computeBranchSetHashSync } from '../../forest/api/branch-set-hash.js';
import { branchIdFromBranchUrl } from '../../../shared/lib/branch-id.js';
import { diffTreeData } from '../../tree-graph/api/tree-diff.js';

/**
 * Local branch: published if we have a public URL (snapshot hash may lag briefly).
 * Dirty when draft/live hash ≠ published hash, or snapshot/live diff finds changes.
 * URL without snapshot/hash → dirty (repair/update), never fake “up to date”.
 */
function resolveLocalBranchPublishFlags(entry) {
    const hasPublishedBaseline = !!String(entry?.publishedNetworkUrl || '').trim();
    if (!hasPublishedBaseline || !entry) {
        return { hasPublishedBaseline: false, isDraftDirty: false };
    }
    if (entry.publishPending) {
        return { hasPublishedBaseline: true, isDraftDirty: true };
    }

    const pubHash = String(entry.publishedSnapshotHash || '').trim();
    const live = store.state?.rawGraphData;
    let liveHash = '';
    if (live && typeof store.userStore?.hashJson === 'function') {
        try {
            liveHash = String(store.userStore.hashJson(live) || '').trim();
        } catch {
            /* ignore */
        }
    }
    /* Prefer live graph hash so dock flips to Update before autosave writes draftHash. */
    const draftHash = liveHash || String(entry.draftHash || '').trim();
    if (pubHash && draftHash) {
        return { hasPublishedBaseline: true, isDraftDirty: draftHash !== pubHash };
    }

    const draft = live || entry.data || null;
    const published = entry.publishedSnapshot || null;
    if (published && draft) {
        try {
            const d = diffTreeData(published, draft);
            const dirty =
                (d?.counts?.added || 0) + (d?.counts?.removed || 0) + (d?.counts?.changed || 0) > 0;
            return { hasPublishedBaseline: true, isDraftDirty: dirty };
        } catch {
            /* ignore */
        }
    }

    /* Missing baseline payload after a public URL → needs update/repair, not “Al día”. */
    return { hasPublishedBaseline: true, isDraftDirty: true };
}

/**
 * Composed playlist: dirty on ref-set change, missing published hash, or member
 * branch content newer than last composed publish (bundle embeds live branch data).
 */
function resolveComposedPublishFlags(entry) {
    const hasPublishedBaseline = !!String(entry?.publishedNetworkUrl || '').trim();
    if (!hasPublishedBaseline || !entry) {
        return { hasPublishedBaseline: false, isDraftDirty: false };
    }
    /* Claim succeeded but bundle not live yet — keep Update / retry same identity. */
    if (entry.publishPending) {
        return { hasPublishedBaseline: true, isDraftDirty: true };
    }

    const currentHash = computeBranchSetHashSync(entry.branchRefs || []);
    const publishedHash = String(entry.publishedBranchSetHash || '').trim();
    if (!publishedHash) {
        return { hasPublishedBaseline: true, isDraftDirty: true };
    }
    if (currentHash !== publishedHash) {
        return { hasPublishedBaseline: true, isDraftDirty: true };
    }

    const publishedAt = Number(entry.publishedAt) || 0;
    if (publishedAt && Number(entry.updated) > publishedAt) {
        return { hasPublishedBaseline: true, isDraftDirty: true };
    }

    const branches = store.userStore?.state?.branches || [];
    for (const ref of entry.branchRefs || []) {
        const bid = String(ref?.branchId || ref?.refId || ref?.id || '').trim();
        if (!bid) continue;
        const branch = branches.find((b) => String(b?.id) === bid);
        if (!branch) continue;
        const pubH = String(branch.publishedSnapshotHash || '').trim();
        const draftH = String(branch.draftHash || '').trim();
        if (pubH && draftH && draftH !== pubH) {
            return { hasPublishedBaseline: true, isDraftDirty: true };
        }
        if (publishedAt && Number(branch.updated) > publishedAt) {
            return { hasPublishedBaseline: true, isDraftDirty: true };
        }
    }

    return { hasPublishedBaseline: true, isDraftDirty: false };
}

/** Publish baseline / dirty state for branch, composed tree, or network source. */
export function getActivePublishContext(activeSource) {
    const isLocalBranch = fileSystem.isLocalBranch();
    const isLocalComposed = fileSystem.isLocalComposedTree();
    const nostrTreeRef = activeSource?.url ? parseNostrTreeUrl(activeSource.url) : null;
    const isPublicTree = !!nostrTreeRef;

    if (isLocalComposed) {
        const treeId = fileSystem.composedTreeId();
        const entry = treeId ? store.userStore?.getTree?.(treeId) : null;
        const { hasPublishedBaseline, isDraftDirty } = resolveComposedPublishFlags(entry);
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
        const localId = branchIdFromBranchUrl(activeSource.url);
        const entry =
            (store.userStore?.state?.branches || []).find((t) => String(t?.id) === localId) || null;
        const { hasPublishedBaseline, isDraftDirty } = resolveLocalBranchPublishFlags(entry);
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

    /*
     * Retract only while viewing the live public tree as owner.
     * Local branch/composed with a published baseline must show Update / Up to date / Publish
     * (retract stays available from the public-tree / hub flows, not this dock CTA).
     */
    const pubActsAsUnpublish =
        !!(canRetractPublicTree && isNetworkTreeOwner && isPublicTree);

    const hasBaseline = publishCtx.hasPublishedBaseline;
    const isDraftDirty = publishCtx.isDraftDirty;
    const isUpdate = hasBaseline && isDraftDirty && !pubActsAsUnpublish;
    const isUpToDate = hasBaseline && !isDraftDirty && !pubActsAsUnpublish;

    const pubComposed = scopeKind === 'tree_playlist' || (isLocalComposed && scopeKind !== 'branch_course');
    const pubBranch = scopeKind === 'branch_course';

    const republishPub = canRetractPublicTree && isPublicTree;
    const unpublishCopy = resolveUnpublishDialogCopy(
        ui,
        pubActsAsUnpublish ? 'network' : publishCtx.kind
    );
    const pubL = pubActsAsUnpublish
        ? unpublishCopy.dockTooltip
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
        ? ui.revokePublicTreeDockLabel || 'Unpublish'
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
    const pubIcon = pubActsAsUnpublish ? '🛑' : isUpdate ? '🔄' : isUpToDate ? '✓' : '🌐';
    const busyLabel = pubBusy ? ui.conDockBusy || '…' : pubShort;

    return {
        /*
         * Keep real Publish / Update / Up to date while browsing folders.
         * Hiding here left the dock on a fake disabled “Publicar” fallback.
         */
        show: true,
        label: busyLabel,
        title: pubL,
        note: pubNote,
        icon: pubIcon,
        busy: pubBusy,
        /* Keep clickable when up to date so the hub still opens (share / unpublish). */
        disabled: pubBusy,
        variant: pubActsAsUnpublish ? 'danger' : isUpdate ? 'update' : isUpToDate ? 'published' : 'publish',
        actsAsUnpublish: pubActsAsUnpublish,
        isUpdate,
        isUpToDate,
        localId: publishCtx.localId,
        publishCtx,
    };
}
