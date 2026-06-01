/**
 * Load WebTorrent from same origin (vendor/webtorrent). No third-party script CDN.
 *
 * GDPR: even fetching the vendor bundle is gated on user consent. The bundle
 * itself is first-party (no network leak), but importing it would otherwise
 * tempt a caller into instantiating `new WebTorrent()` before the user has
 * accepted the privacy policy — which would open tracker / DHT / peer
 * connections that disclose the IP address. Hard-block here so we can't
 * accidentally regress.
 */

import { hasGdprNetworkConsent } from '../privacy-gdpr/gdpr-network-consent.js';

let webtorrentLoaded = false;
let webtorrentLoading = null;

/* OPFS guard: when WebTorrent is loaded inside a context without OPFS access
 * (cross-origin iframes, private browsing, etc.) `navigator.storage.getDirectory()`
 * rejects with SecurityError. We hand WebTorrent an empty in-memory directory
 * handle that swallows every operation so its `storageDirPromise` resolves
 * cleanly instead of leaking an unhandled rejection into the console. */
function patchOPFSForWebTorrent() {
    if (typeof navigator === 'undefined' || !navigator.storage) return;
    const orig = navigator.storage.getDirectory.bind(navigator.storage);
    const noopDir = () => ({
        kind: 'directory',
        name: '',
        async getDirectoryHandle() { return noopDir(); },
        async getFileHandle() {
            return {
                kind: 'file',
                name: '',
                async getFile() { return new Blob([]); },
                async createWritable() {
                    return { async write() {}, async close() {}, async abort() {} };
                }
            };
        },
        async removeEntry() {},
        async *entries() {},
        async *values() {},
        async *keys() {}
    });
    navigator.storage.getDirectory = async function () {
        try {
            return await orig();
        } catch {
            return noopDir();
        }
    };
}

export async function ensureWebTorrentLoaded() {
    if (!hasGdprNetworkConsent()) return false;
    if (globalThis.WebTorrent) return true;
    if (webtorrentLoaded) return true;
    if (webtorrentLoading) return webtorrentLoading;
    
    webtorrentLoading = (async () => {
        try {
            // Patch OPFS before loading to prevent SecurityError
            patchOPFSForWebTorrent();
            // Dynamic ES module import
            const module = await import('../../../vendor/webtorrent/webtorrent.min.js');
            // WebTorrent exports as default
            if (module.default) {
                globalThis.WebTorrent = module.default;
            }
            webtorrentLoaded = true;
            return !!globalThis.WebTorrent;
        } catch (e) {
            console.warn('[Arborito] WebTorrent could not load; torrent:// sources are disabled.', e.message || e);
            return false;
        } finally {
            webtorrentLoading = null;
        }
    })();
    
    return webtorrentLoading;
}

