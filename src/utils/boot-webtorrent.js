/**
 * Load WebTorrent from same origin (vendor/webtorrent). No third-party script CDN.
 */

let webtorrentLoaded = false;
let webtorrentLoading = null;

// Patch OPFS before loading WebTorrent to prevent SecurityError
function patchOPFSForWebTorrent() {
    if (typeof navigator === 'undefined' || !navigator.storage) return;
    const orig = navigator.storage.getDirectory.bind(navigator.storage);
    navigator.storage.getDirectory = async function() {
        try {
            return await orig();
        } catch (e) {
            // Return a mock directory that always throws NotFoundError
            return {
                kind: 'directory',
                name: '',
                async getDirectoryHandle() { throw new DOMException('Not found', 'NotFoundError'); },
                async getFileHandle() { throw new DOMException('Not found', 'NotFoundError'); },
                async removeEntry() {},
                async *entries() {}
            };
        }
    };
}

export async function ensureWebTorrentLoaded() {
    if (globalThis.WebTorrent) return true;
    if (webtorrentLoaded) return true;
    if (webtorrentLoading) return webtorrentLoading;
    
    webtorrentLoading = (async () => {
        try {
            // Patch OPFS before loading to prevent SecurityError
            patchOPFSForWebTorrent();
            // Dynamic ES module import
            const module = await import('../../vendor/webtorrent/webtorrent.min.js');
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

