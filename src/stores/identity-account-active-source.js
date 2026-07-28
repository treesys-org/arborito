import { DEMO_BRANCH_ID } from '../core/demo/arborito-demo-ids.js';
import { parseNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';

/**
 * Map the device's current active source to an account-preferred URL that another
 * device can reopen after refresh/sign-in. Only synced content qualifies:
 * private-account drafts, published network URLs, and installed network sources.
 * Unsynced local drafts return '' so the previous preferred URL is kept.
 */
export function resolveAccountActiveSourceUrl(store) {
    let activeUrl = String(store.state.activeSource?.url || '').trim();
    if (!activeUrl) return '';

    if (activeUrl.startsWith('branch://')) {
        const localId = activeUrl.slice('branch://'.length).split('/')[0];
        if (localId === DEMO_BRANCH_ID) return `branch://${DEMO_BRANCH_ID}`;
        const entry = (store.userStore?.state?.branches || []).find((t) => t && t.id === localId);
        if (entry?.privateSyncedFromAccount) return `privtree://${localId}`;
        /* Claimed-but-not-live publish must not become last-active across devices. */
        if (entry?.publishPending) return '';
        const net = String(entry?.publishedNetworkUrl || '').trim();
        if (net) return net;
        return '';
    }

    if (activeUrl.startsWith('tree://')) {
        const treeId = activeUrl.slice('tree://'.length).split('/')[0];
        if (!treeId) return '';
        const entry = store.userStore?.getTree?.(treeId);
        if (entry?.privateSyncedFromAccount) return `tree://${treeId}`;
        if (entry?.publishPending) return '';
        const net = String(entry?.publishedNetworkUrl || '').trim();
        if (net) return net;
        return '';
    }

    if (activeUrl.startsWith('privtree://')) return activeUrl;
    return activeUrl;
}

/** Infer Saved-tab kind when the pack row omitted contentKind. */
function inferNetworkContentKind(url, metaKind) {
    const fromMeta = String(metaKind || '').trim();
    if (fromMeta) return fromMeta;
    const ref = parseNostrTreeUrl(url);
    const uid = String(ref?.universeId || '');
    if (uid.startsWith('tre-')) return 'composed-tree';
    if (uid.startsWith('brn-')) return 'branch';
    return undefined;
}

/** Ensure a network preferred URL is also listed in the installed-sources pack. */
export function ensurePreferredNetworkSourceInList(sources, url, store) {
    const u = String(url || '').trim();
    if (!u || u.startsWith('branch://') || u.startsWith('privtree://') || u.startsWith('tree://')) {
        return;
    }
    if ((sources || []).some((s) => String(s?.url || '') === u)) return;
    const live = (store.state.communitySources || []).find((s) => String(s?.url || '') === u);
    const active = store.state.activeSource;
    const fromActive = active && String(active.url || '') === u ? active : null;
    const meta = live || fromActive || {};
    sources.push({
        id: meta.id || u,
        name: meta.name || meta.title || '',
        url: u,
        authorName: meta.authorName || meta.listAuthorName || '',
        description: meta.listDescription || meta.description || '',
        titles: meta.titles,
        descriptions: meta.descriptions,
        languages: Array.isArray(meta.languages) ? meta.languages : undefined,
        icon: meta.icon || undefined,
        shareCode: meta.shareCode || undefined,
        contentKind: inferNetworkContentKind(u, meta.contentKind),
        recommendedRelays: Array.isArray(meta.recommendedRelays) ? meta.recommendedRelays : [],
    });
}
