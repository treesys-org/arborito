import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';

/** @param {{ publishedNetworkUrl?: string } | null | undefined} entry */
export function isPublishedResourceOwner(entry, getNostrPublisherPair) {
    const url = String(entry?.publishedNetworkUrl || '').trim();
    if (!url || typeof getNostrPublisherPair !== 'function') return false;
    try {
        const ref = parseNostrTreeUrl(url);
        if (!ref?.pub) return false;
        return !!getNostrPublisherPair(ref.pub)?.priv;
    } catch {
        return false;
    }
}
