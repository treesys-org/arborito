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
