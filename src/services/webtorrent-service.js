export class WebTorrentService {
    constructor() {
        /** @type {any|null} */
        this._client = null;
        /** @type {Map<string, any>} */
        this._torrents = new Map();
        /** @type {Map<string, any>} */
        this._seeds = new Map();
    }

    available() {
        return !!globalThis.WebTorrent;
    }

    _getClient() {
        if (this._client) return this._client;
        if (!globalThis.WebTorrent) throw new Error('WebTorrent not loaded.');
        // Browser client
        this._client = new globalThis.WebTorrent();
        return this._client;
    }

    /**
     * @param {string} magnetOrTorrentUrl
     * @returns {Promise<any>}
     */
    async _getTorrent(magnetOrTorrentUrl) {
        const key = String(magnetOrTorrentUrl || '').trim();
        if (!key) throw new Error('Missing torrent reference.');
        if (this._torrents.has(key)) return this._torrents.get(key);
        const client = this._getClient();
        const torrent = await new Promise((resolve, reject) => {
            try {
                client.add(key, (t) => resolve(t));
            } catch (e) {
                reject(e);
            }
        });
        this._torrents.set(key, torrent);
        return torrent;
    }

    _blobToText(blob) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onerror = () => reject(r.error || new Error('FileReader failed'));
            r.onload = () => resolve(String(r.result || ''));
            r.readAsText(blob);
        });
    }

    /**
     * Seed a set of files and return the magnet URI.
     * Keeps seeding in memory while the app stays open.
     * @param {{ key: string, files: File[] }} opts
     * @returns {Promise<string>}
     */
    async seedFiles({ key, files }) {
        const k = String(key || '').trim();
        const list = Array.isArray(files) ? files : [];
        if (!k) throw new Error('Missing seed key.');
        if (!list.length) throw new Error('No files to seed.');
        if (this._seeds.has(k)) {
            const t = this._seeds.get(k);
            return String((t && t.magnetURI) || '');
        }
        const client = this._getClient();
        const torrent = await new Promise((resolve, reject) => {
            try {
                client.seed(list, (t) => resolve(t));
            } catch (e) {
                reject(e);
            }
        });
        this._seeds.set(k, torrent);
        return String((torrent && torrent.magnetURI) || '');
    }

    /**
     * Ensure torrent is added (starts downloading & sharing).
     * @param {{ magnet: string }} opts
     */
    async ensureAdded({ magnet }) {
        const m = String(magnet || '').trim();
        if (!m) return null;
        return await this._getTorrent(m);
    }

    /**
     * Stops using a torrent by magnet URI (e.g. pointer moved to a new info hash).
     * @param {{ magnet: string }} opts
     */
    async removeTorrent({ magnet }) {
        const m = String(magnet || '').trim();
        if (!m || !this._torrents.has(m)) return;
        const t = this._torrents.get(m);
        this._torrents.delete(m);
        try {
            if (t && this._client) this._client.remove(t);
        } catch {
            /* ignore */
        }
    }

    /**
     * Lightweight stats snapshot.
     * @param {{ magnet: string }} opts
     */
    async getStats({ magnet }) {
        const t = await this.ensureAdded({ magnet });
        if (!t) return { ok: false, numPeers: 0, progress: 0 };
        const numPeers = typeof t.numPeers === 'number' ? t.numPeers : 0;
        const progress = typeof t.progress === 'number' ? t.progress : 0;
        const done = !!t.done;
        const downloaded = typeof t.downloaded === 'number' ? t.downloaded : 0;
        const downloadSpeed = typeof t.downloadSpeed === 'number' ? t.downloadSpeed : 0;
        const uploadSpeed = typeof t.uploadSpeed === 'number' ? t.uploadSpeed : 0;
        return { ok: true, numPeers, progress, done, downloaded, downloadSpeed, uploadSpeed };
    }

    stopAll() {
        try {
            const c = this._client;
            if (c) {
                for (const t of c.torrents || []) {
                    try {
                        c.remove(t.infoHash);
                    } catch {
                        /* ignore */
                    }
                }
                try {
                    c.destroy();
                } catch {
                    /* ignore */
                }
            }
        } finally {
            this._client = null;
            this._torrents.clear();
            this._seeds.clear();
        }
    }

    /**
     * Read a text file by path inside a torrent.
     * @param {{ magnet: string, path: string }} opts
     */
    async readTextFile({ magnet, path }) {
        const t = await this._getTorrent(magnet);
        const want = String(path || '').replace(/^\/+/, '');
        const f = (t.files || []).find((x) => String(x.path).replace(/^\/+/, '') === want);
        if (!f) throw new Error(`Torrent file not found: ${want}`);
        const blob = await new Promise((resolve, reject) => {
            try {
                f.getBlob((err, b) => (err ? reject(err) : resolve(b)));
            } catch (e) {
                reject(e);
            }
        });
        return await this._blobToText(blob);
    }
}

