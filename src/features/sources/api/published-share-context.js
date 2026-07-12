import { getArboritoStore } from '../../../core/store-singleton.js';
import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';

/** @param {{ publishedShareCode?: string, data?: { meta?: { shareCode?: string } }, publishedSnapshot?: { meta?: { shareCode?: string } } } | null | undefined} branch */
export function branchShareCode(branch) {
    if (!String(branch?.publishedNetworkUrl || '').trim()) return '';
    return String(
        branch?.publishedShareCode ||
            branch?.data?.meta?.shareCode ||
            branch?.publishedSnapshot?.meta?.shareCode ||
            ''
    ).trim();
}

/** @param {{ publishedShareCode?: string, data?: { meta?: { shareCode?: string } } } | null | undefined} tree */
export function composedTreeShareCode(tree) {
    if (!String(tree?.publishedNetworkUrl || '').trim()) return '';
    return String(tree?.publishedShareCode || tree?.data?.meta?.shareCode || '').trim();
}

function shareCodeFromActiveSource(activeSource, rawGraphData) {
    return String(rawGraphData?.meta?.shareCode || activeSource?.shareCode || '').trim();
}

export { shareCodeFromActiveSource };

function activeContextForEntry(entry) {
    const store = getArboritoStore();
    const activeSource = store?.value?.activeSource || null;
    const rawGraphData = store?.value?.rawGraphData || null;
    if (!entry?.id || !activeSource) return { activeSource: null, rawGraphData: null };
    const url = String(activeSource.url || '');
    if (url.startsWith('branch://')) {
        const id = url.slice('branch://'.length).split('/')[0];
        if (String(id) === String(entry.id)) return { activeSource, rawGraphData };
    }
    if (activeSource.type === 'composed-tree' && String(activeSource.treeId || '') === String(entry.id)) {
        return { activeSource, rawGraphData };
    }
    return { activeSource: null, rawGraphData: null };
}

/** @param {{ publishedNetworkUrl?: string, name?: string, id?: string } | null | undefined} entry */
export function shareOptsForPublishedBranch(entry, { rawGraphData, activeSource } = {}) {
    const ctx = !rawGraphData && !activeSource ? activeContextForEntry(entry) : { rawGraphData, activeSource };
    const url = String(entry?.publishedNetworkUrl || '').trim();
    const code =
        branchShareCode(entry) ||
        shareCodeFromActiveSource(ctx.activeSource, ctx.rawGraphData) ||
        (entry?.id ? String(getArboritoStore()?.userStore?.getBranchPublishedShareCode?.(entry.id) || '').trim() : '');
    if (!url && !code) return null;
    const ref = url ? parseNostrTreeUrl(url) : null;
    return {
        name: entry?.name || ctx.activeSource?.name || '',
        url,
        shareCode: code,
        ownerPub: ref?.pub || '',
        universeId: ref?.universeId || '',
    };
}

/** @param {{ publishedNetworkUrl?: string, publishedShareCode?: string, name?: string, id?: string } | null | undefined} entry */
export function shareOptsForPublishedComposedTree(entry, { rawGraphData, activeSource } = {}) {
    const ctx = !rawGraphData && !activeSource ? activeContextForEntry(entry) : { rawGraphData, activeSource };
    const url = String(entry?.publishedNetworkUrl || '').trim();
    const code =
        composedTreeShareCode(entry) ||
        shareCodeFromActiveSource(ctx.activeSource, ctx.rawGraphData) ||
        (entry?.id ? String(getArboritoStore()?.userStore?.getTreePublishedShareCode?.(entry.id) || '').trim() : '');
    if (!url && !code) return null;
    const ref = url ? parseNostrTreeUrl(url) : null;
    return {
        name: entry?.name || ctx.activeSource?.name || '',
        url,
        shareCode: code,
        ownerPub: ref?.pub || '',
        universeId: ref?.universeId || '',
    };
}

/** Share code + link context for the active curriculum source. */
export function resolveActiveShareContext(activeSource, userStore, rawGraphData) {
    const metaCode = shareCodeFromActiveSource(activeSource, rawGraphData);
    const src = activeSource || null;
    if (!src) return { shareCode: metaCode, shareOpts: null };

    const url = String(src.url || '').trim();
    if (url.startsWith('branch://')) {
        const id = url.slice('branch://'.length).split('/')[0];
        const entry = userStore?.state?.branches?.find((t) => t.id === id) || null;
        const shareOpts = shareOptsForPublishedBranch(entry, { rawGraphData, activeSource: src });
        return {
            shareCode: branchShareCode(entry) || metaCode,
            shareOpts,
            localEntry: entry,
            publishedNetworkUrl: entry?.publishedNetworkUrl || null,
        };
    }
    if (src.type === 'composed-tree' && src.treeId) {
        const entry = userStore?.getTree?.(String(src.treeId)) || null;
        const shareOpts = shareOptsForPublishedComposedTree(entry, { rawGraphData, activeSource: src });
        return {
            shareCode: composedTreeShareCode(entry) || metaCode,
            shareOpts,
            localEntry: entry,
            publishedNetworkUrl: entry?.publishedNetworkUrl || null,
        };
    }
    if (parseNostrTreeUrl(url)) {
        return {
            shareCode: metaCode,
            shareOpts: {
                name: src.name || '',
                url,
                shareCode: metaCode,
                ownerPub: parseNostrTreeUrl(url)?.pub || '',
                universeId: parseNostrTreeUrl(url)?.universeId || '',
            },
            publishedNetworkUrl: url,
        };
    }
    return { shareCode: metaCode, shareOpts: metaCode ? { shareCode: metaCode, name: src.name || '', url: '', ownerPub: '', universeId: '' } : null };
}

function persistHydratedShareCode(entry, url, code, kind) {
    const store = getArboritoStore();
    if (!store?.userStore || !entry?.id || !code) return;
    if (kind === 'composed-tree') {
        store.userStore.setTreePublishedNetworkUrl?.(entry.id, url, code);
        return;
    }
    store.userStore.setBranchPublishedNetworkUrl?.(entry.id, url, code);
    const branch = store.userStore.state?.branches?.find((t) => t.id === entry.id);
    if (branch?.data?.meta && typeof branch.data.meta === 'object') {
        branch.data.meta.shareCode = code;
        store.userStore.markBranchDirty?.(entry.id);
        store.userStore.persist?.();
    }
}

async function fetchShareCodeFromNetwork(ref, store) {
    const nostr = store?.nostr;
    if (!nostr || !ref?.pub || !ref?.universeId) return null;

    try {
        const dir = await nostr.loadGlobalTreeDirectoryEntryOnce?.(ref);
        const dirCode = String(dir?.shareCode || '').trim();
        if (dirCode) return dirCode;
    } catch {
        /* ignore */
    }

    try {
        const claimCode = await nostr.loadTreeShareCodeForUniverse?.(ref);
        if (claimCode) return String(claimCode).trim();
    } catch {
        /* ignore */
    }

    try {
        const { bundle } = await nostr.loadNostrUniverseBundle(ref);
        const bundleCode = String(bundle?.meta?.shareCode || '').trim();
        if (bundleCode) return bundleCode;
    } catch {
        /* ignore */
    }

    return null;
}

/** Best-effort: load share code from Nostr when local metadata is missing. */
export async function hydratePublishedShareCode(entry, { kind = 'branch' } = {}) {
    const url = String(entry?.publishedNetworkUrl || '').trim();
    if (!url) return null;
    const existing = kind === 'composed-tree' ? composedTreeShareCode(entry) : branchShareCode(entry);
    if (existing) return existing;
    const ref = parseNostrTreeUrl(url);
    if (!ref) return null;
    const store = getArboritoStore();
    const code = await fetchShareCodeFromNetwork(ref, store);
    if (!code) return null;
    persistHydratedShareCode(entry, url, code, kind);
    return code;
}
