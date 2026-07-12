/* Extracted module-level helpers for the Sources modal. */

import { parseNostrTreeUrl, formatNostrTreeUrl } from '../../../../nostr/api/nostr-refs.js';
export { escHtml as escapeHtmlAttr, escHtml as escapeHtmlText } from '../../../../../shared/lib/html-escape.js';

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

function branchIdFromUrl(url) {
    const u = String(url || '');
    return u.startsWith('branch://') ? u.slice('branch://'.length).split('/')[0] : '';
}

/** Stable local branch id even when viewing a saved snapshot (`type: archive`). */
export function resolveActiveBranchId(active) {
    if (!active) return '';
    const fromUrl = branchIdFromUrl(active.url);
    if (fromUrl) return fromUrl;
    if (active.type === 'branch') return String(active.id || '').split('-')[0];
    return '';
}
