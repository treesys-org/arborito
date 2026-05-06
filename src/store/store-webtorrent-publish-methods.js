import { flattenTreeSearchEntriesWithLessonBody } from '../utils/search-index-core.js';

/** Mixin applied to `Store.prototype` — WebTorrent buckets for publishing. */
export const webtorrentPublishMethods = {
    _bucketForPath(path, bucketCount) {
        const n = Math.max(1, Math.min(256, Number(bucketCount) || 64));
        const hex = typeof this.computeHash === 'function' ? String(this.computeHash(String(path)) || '') : '';
        const b = hex && hex.length >= 2 ? parseInt(hex.slice(0, 2), 16) : 0;
        return b % n;
    },

    async _fetchJsonText(url) {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        let text = await res.text();
        if (text && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        return String(text || '');
    },

    async _collectAllApiAndContentPathsForPublish() {
        const raw = this.state.rawGraphData;
        const srcUrl = String((this.state.activeSource && this.state.activeSource.url) || '');
        const baseDir = srcUrl.substring(0, srcUrl.lastIndexOf('/') + 1);
        const apiPaths = new Set();
        const contentPaths = new Set();

        const walkNode = (node) => {
            if (!node || typeof node !== 'object') return;
            if (node.apiPath) apiPaths.add(String(node.apiPath));
            if (node.contentPath) contentPaths.add(String(node.contentPath));
            if (Array.isArray(node.children)) node.children.forEach(walkNode);
        };
        if ((raw && raw.languages)) {
            for (const lang of Object.keys(raw.languages)) walkNode(raw.languages[lang]);
        }

        // Expand lazy nodes by fetching nodes/*.json recursively (best-effort).
        const queue = [...apiPaths];
        const seen = new Set(queue);
        while (queue.length) {
            const ap = queue.shift();
            const url = `${baseDir}nodes/${ap}.json`;
            let arr;
            try {
                const text = await this._fetchJsonText(url);
                arr = JSON.parse(text.trim());
            } catch {
                continue;
            }
            if (!Array.isArray(arr)) continue;
            for (const ch of arr) {
                if ((ch && ch.apiPath)) {
                    const cap = String(ch.apiPath);
                    apiPaths.add(cap);
                    if (!seen.has(cap)) {
                        seen.add(cap);
                        queue.push(cap);
                    }
                }
                if ((ch && ch.contentPath)) contentPaths.add(String(ch.contentPath));
            }
        }

        return { baseDir, apiPaths: [...apiPaths], contentPaths: [...contentPaths] };
    },

    async prepareWebTorrentBucketsForActiveTree() {
        if (!(this.webtorrent && this.webtorrent.available ? this.webtorrent.available() : false)) return null;
        // Publishing from local:// should not try to fetch nodes/content over HTTP.
        // This method is only meaningful when the active source is served over http(s).
        const srcUrl = String((this.state.activeSource && this.state.activeSource.url) || '');
        if (!/^https?:\/\//i.test(srcUrl)) return null;
        const bucketCount = 64;
        const { baseDir, apiPaths, contentPaths } = await this._collectAllApiAndContentPathsForPublish();

        /** @type {Record<string, File[]>} */
        const nodeBuckets = {};
        /** @type {Record<string, File[]>} */
        const contentBuckets = {};

        for (let i = 0; i < bucketCount; i++) {
            nodeBuckets[String(i)] = [];
            contentBuckets[String(i)] = [];
        }

        // nodes/*.json
        for (const ap of apiPaths) {
            const rel = `nodes/${ap}.json`;
            const url = `${baseDir}${rel}`;
            const text = await this._fetchJsonText(url);
            const blob = new Blob([text], { type: 'application/json' });
            const file = new File([blob], rel, { type: 'application/json' });
            const b = this._bucketForPath(rel, bucketCount);
            nodeBuckets[String(b)].push(file);
        }

        // content/*
        for (const cp of contentPaths) {
            const rel = `content/${cp}`;
            const url = `${baseDir}${rel}`;
            const text = await this._fetchJsonText(url);
            const blob = new Blob([text], { type: 'application/json' });
            const file = new File([blob], rel, { type: 'application/json' });
            const b = this._bucketForPath(rel, bucketCount);
            contentBuckets[String(b)].push(file);
        }

        /** @type {Record<string, string>} */
        const nodesBuckets = {};
        /** @type {Record<string, string>} */
        const contentBucketsMagnets = {};

        for (let b = 0; b < bucketCount; b++) {
            const key = String(b);
            const files = nodeBuckets[key];
            if (files.length) {
                nodesBuckets[key] = await this.webtorrent.seedFiles({ key: `nodes-${key}`, files });
            }
            const cfiles = contentBuckets[key];
            if (cfiles.length) {
                contentBucketsMagnets[key] = await this.webtorrent.seedFiles({ key: `content-${key}`, files: cfiles });
            }
        }

        // Optional: build a search pack from currently loaded tree (best-effort; includes lesson body only if present).
        let searchPack = null;
        try {
            const raw = this.state.rawGraphData;
            if ((raw && raw.languages)) {
                const entries = [];
                for (const langCode of Object.keys(raw.languages)) {
                    const root = raw.languages[langCode];
                    const langUpper = String(langCode).toUpperCase().slice(0, 8);
                    entries.push(...flattenTreeSearchEntriesWithLessonBody(root, langUpper));
                }
                searchPack = { version: 1, entries };
            }
        } catch {
            searchPack = null;
        }

        /** @type {any} */
        const meta = {
            mode: 'buckets-v1',
            bucketCount,
            nodesBuckets,
            contentBuckets: contentBucketsMagnets
        };
        if (((searchPack && searchPack.entries) ? searchPack.entries.length : undefined)) {
            const blob = new Blob([JSON.stringify(searchPack)], { type: 'application/json' });
            const file = new File([blob], 'search-pack.json', { type: 'application/json' });
            const magnet = await this.webtorrent.seedFiles({ key: 'search-pack', files: [file] });
            meta.searchMagnet = magnet;
            meta.searchPackPath = 'search-pack.json';
        }
        return meta;
    }

};
