/* Extracted module-level helpers for the Sources modal. */

import { parseNostrTreeUrl, formatNostrTreeUrl } from '../../nostr/nostr-refs.js';
export { escHtml as escapeHtmlAttr, escHtml as escapeHtmlText } from '../../../shared/lib/html-escape.js';

export function canonicalNetworkTreeUrlString(urlStr) {
    const g = parseNostrTreeUrl(String(urlStr || '').trim());
    return g ? formatNostrTreeUrl(g.pub, g.universeId) : '';
}
