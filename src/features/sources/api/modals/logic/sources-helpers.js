/* Extracted module-level helpers for the Sources modal. */

import { parseNostrTreeUrl, formatNostrTreeUrl } from '../../../../nostr/api/nostr-refs.js';

export function canonicalNetworkTreeUrlString(urlStr) {
    const g = parseNostrTreeUrl(String(urlStr || '').trim());
    return g ? formatNostrTreeUrl(g.pub, g.universeId) : '';
}

/** Match installed community rows even when stored URL encoding differs. */
export function findCommunitySourceByUrl(communitySources, urlOrFormatted) {
    const canon = canonicalNetworkTreeUrlString(urlOrFormatted);
    if (!canon) return null;
    const list = Array.isArray(communitySources) ? communitySources : [];
    return (
        list.find((s) => {
            const c = canonicalNetworkTreeUrlString(String(s?.url || '').trim());
            return !!c && c === canon;
        }) || null
    );
}

/**
 * True when `urlOrSource` is the network tree already mounted as activeSource.
 * Used to skip remount after Install when the course is already open.
 */
export function isSameActiveNetworkSource(activeSource, urlOrSource) {
    if (!activeSource) return false;
    const other =
        typeof urlOrSource === 'string'
            ? { url: urlOrSource }
            : urlOrSource && typeof urlOrSource === 'object'
              ? urlOrSource
              : null;
    if (!other) return false;
    if (
        activeSource.id != null &&
        other.id != null &&
        String(activeSource.id) === String(other.id)
    ) {
        return true;
    }
    const a = canonicalNetworkTreeUrlString(String(activeSource.url || '').trim());
    const b = canonicalNetworkTreeUrlString(String(other.url || '').trim());
    return !!(a && b && a === b);
}

function branchIdFromUrl(url) {
    const u = String(url || '');
    return u.startsWith('branch://') ? u.slice('branch://'.length).split('/')[0] : '';
}

/** Stable local branch id even when viewing a saved snapshot (`type: archive`). */
export function resolveActiveBranchId(active) {
    if (!active) return '';
    const fromUrl = branchIdFromUrl(active.url);
    if (fromUrl) return fromUrl;
    if (active.type === 'branch') return String(active.id || '').trim();
    return '';
}
