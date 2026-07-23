import { getArboritoStore as store } from '../../core/store-singleton.js';
import { parseNostrTreeUrl } from '../../features/nostr/api/nostr-refs.js';

function branchPublishedNetworkUrl(source) {
    const url = String(source?.url || '');
    if (!url.startsWith('branch://')) return '';
    const localId = url.slice('branch://'.length);
    const entry = (store.userStore?.state?.branches || []).find((t) => String(t?.id) === localId);
    const pub =
        String(entry?.publishedNetworkUrl || '').trim() ||
        String(store.userStore?.getBranchPublishedNetworkUrl?.(localId) || '').trim();
    return pub;
}

function composedTreePublishedNetworkUrl(source) {
    const url = String(source?.url || '');
    if (!url.startsWith('tree://')) return '';
    const treeId = url.slice('tree://'.length);
    const entry = store.userStore?.getTree?.(treeId);
    return String(entry?.publishedNetworkUrl || '').trim();
}

function isNetworkTreeSource(source) {
    if (!source) return false;
    const url = String(source.url || '');
    if (source.origin === 'nostr' || url.startsWith('nostr://')) return true;
    return !!parseNostrTreeUrl(url);
}

/**
 * Whether the active tree has a **published network presence** (forum is a network feature).
 * Local-only drafts (`branch://` never published) are never eligible.
 */
export function isTreeForumNetworkEligible(source = null) {
    if (!source) return false;
    if (isNetworkTreeSource(source)) return true;
    if (branchPublishedNetworkUrl(source)) return true;
    if (composedTreePublishedNetworkUrl(source)) return true;
    return false;
}

/**
 * Whether forum UI and network posts are allowed for the active tree.
 *
 * Requires **both**:
 * 1. Publisher opted in (`meta.forumEnabled === true`) when publishing to the network.
 * 2. Tree is on the network or is a local copy of something already published there.
 *
 * Local offline branches with no `publishedNetworkUrl` never show forum, enable/disable
 * only in the publish/republish confirmation dialog (switch).
 *
 * @param {object|null|undefined} meta, `rawGraphData.meta` or `bundle.meta`
 * @param {object|null|undefined} [source], `activeSource`
 */
export function isTreeForumEnabled(meta, source = null) {
    if (meta?.forumEnabled !== true) return false;
    return isTreeForumNetworkEligible(source);
}
