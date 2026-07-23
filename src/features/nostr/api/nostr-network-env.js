/** Lightweight Nostr environment probe — no client / crypto deps. */

export function isNostrNetworkAvailable() {
    try {
        return typeof WebSocket !== 'undefined';
    } catch {
        return false;
    }
}
