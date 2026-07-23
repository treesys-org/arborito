import { mergeSearchEntriesById, entryMatchesSearchQuery } from '../../search/api/search-index-core.js';
import { setHasCompletableId } from '../../garden-progress/api/certificate-entries.js';

export const TreeUtils = {
    cleanString(str) {
        if (!str) return "";
        return str.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    },

    findNode(id, node) {
        if (!node || id === undefined || id === null) return null;
        const sid = String(id);
        if (String(node.id) === sid) return node;
        if (node.children) {
            for (const child of node.children) {
                const found = TreeUtils.findNode(id, child);
                if (found) return found;
            }
        }
        return null;
    },

    /**
     * Next node when following a persisted path while `parent.children` may be empty or stale
     * (lazy load, Nostr, etc.) but the child already exists in the tree index.
     */
    resolvePathChild(parent, targetId, findNodeInTree) {
        if (!parent || targetId === undefined || targetId === null || typeof findNodeInTree !== 'function') {
            return null;
        }
        const tid = String(targetId);
        const kids = parent.children || [];
        const direct = kids.find((c) => String(c.id) === tid);
        if (direct) return direct;
        const flat = findNodeInTree(tid);
        if (!flat || flat.parentId === undefined || flat.parentId === null || flat.parentId === '') {
            return null;
        }
        if (String(flat.parentId) !== String(parent.id)) return null;
        return flat;
    },

    collectDescendantCompletableIds(node, ids = []) {
        if (!node) return ids;
        const t = node.type;
        if (t === 'leaf' || t === 'exam') {
            ids.push(String(node.id));
            return ids;
        }
        if (node.children && node.children.length) {
            for (const ch of node.children) TreeUtils.collectDescendantCompletableIds(ch, ids);
        } else if (Array.isArray(node.leafIds) && node.leafIds.length) {
            for (const id of node.leafIds) ids.push(String(id));
        }
        return ids;
    },

    getModulesStatus(data, completedNodesSet) {
        if (!data) return [];
        const completed =
            completedNodesSet instanceof Set ? completedNodesSet : new Set(completedNodesSet || []);
        const modules = [];
        const traverse = (node) => {
            if (node.type === 'branch' || node.type === 'root') {
                 let leafIdsList = Array.isArray(node.leafIds) ? node.leafIds.map(String) : null;
                 let total = Number(node.totalLeaves) || 0;
                 if ((!total || total === 0) && node.children && node.children.length) {
                     leafIdsList = TreeUtils.collectDescendantCompletableIds(node, []);
                     total = leafIdsList.length;
                 } else if ((!total || total === 0) && leafIdsList && leafIdsList.length) {
                     total = leafIdsList.length;
                 }
                 if (total > 0 || node.type === 'branch') {
                     let completedCount = 0;
                     if (setHasCompletableId(completed, node.id)) {
                         completedCount = total;
                     } else if (leafIdsList && leafIdsList.length) {
                         completedCount = leafIdsList.filter((id) => setHasCompletableId(completed, id)).length;
                     }
                     const isComplete =
                         setHasCompletableId(completed, node.id) ||
                         (total > 0 && completedCount >= total);
                     if (node.type !== 'root') {
                        modules.push({
                            id: node.id, name: node.name, icon: node.icon, description: node.description,
                            totalLeaves: total, completedLeaves: completedCount, isComplete: isComplete,
                            path: node.path, isCertifiable: node.isCertifiable
                        });
                     }
                 }
            }
            if (Array.isArray(node.children)) node.children.forEach(traverse);
        };
        traverse(data);
        return modules.sort((a,b) => b.isComplete === a.isComplete ? 0 : (b.isComplete ? 1 : -1));
    },

    /**
     * @param {string} query
     * @param {object} activeSource
     * @param {string} lang
     * @param {Record<string, unknown>} cache
     * @param {(langU: string, prefix: string) => Promise<object[]>} [getLocalOverlay], IndexedDB / embedded index
     */
    async search(query, activeSource, lang, cache, getLocalOverlay) {
        if (!query || query.length < 2) return [];
        if (!(activeSource && (activeSource.url || activeSource.id))) return [];
        const cacheMap = cache && typeof cache === 'object' ? cache : {};
        const q = TreeUtils.cleanString(query);
        const prefix = q.substring(0, 2);
        const cacheKey = `${lang}_${prefix}`;

        if (!cacheMap[cacheKey]) {
            try {
                const sourceUrl = activeSource.url;
                const slash = sourceUrl.lastIndexOf('/');
                const skipHttp =
                    typeof sourceUrl === 'string' &&
                    (sourceUrl.startsWith('nostr:') ||
                        sourceUrl.startsWith('branch:') ||
                        sourceUrl.startsWith('indexeddb:'));

                /** @type {object[]} */
                let normalized = [];
                if (!skipHttp && slash >= 0) {
                    const baseDir = sourceUrl.substring(0, slash + 1);
                    const firstChar = prefix.charAt(0);
                    const url = `${baseDir}search/${lang}/${firstChar}/${prefix}.json`;

                    const res = await fetch(url);
                    if (res.ok) {
                        const shard = await res.json();
                        if (Array.isArray(shard)) {
                            normalized = shard.map((item) => ({
                                id: item.id,
                                name: item.n || item.name,
                                type: item.t || item.type,
                                icon: item.i || item.icon,
                                description: item.d || item.description,
                                path: item.p || item.path,
                                lang: item.l || item.lang,
                                searchBody: item.sb != null ? item.sb : item.searchBody
                            }));
                        }
                    }
                }
                if (typeof getLocalOverlay === 'function') {
                    const langU = String(lang || 'EN').toUpperCase().slice(0, 8);
                    const overlay = await getLocalOverlay(langU, prefix);
                    if (overlay && overlay.length) {
                        normalized = mergeSearchEntriesById(normalized, overlay);
                    }
                }
                cacheMap[cacheKey] = normalized;
            } catch (e) {
                cacheMap[cacheKey] = [];
            }
        }

        const shard = cacheMap[cacheKey] || [];
        return shard.filter((n) => entryMatchesSearchQuery(n, q));
    },

    /**
     * @param {(langU: string, prefix: string) => Promise<object[]>} [getLocalOverlay]
     */
    async searchBroad(char, activeSource, lang, cache, getLocalOverlay) {
        if (!char || char.length !== 1) return [];
        if (!(activeSource && (activeSource.url || activeSource.id))) return [];
        const cacheMap = cache && typeof cache === 'object' ? cache : {};
        const c = TreeUtils.cleanString(char);
        const suffixes = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
        const prefixes = suffixes.map((s) => c + s);
        const sourceUrl = activeSource.url ? String(activeSource.url) : '';
        const slash = sourceUrl.lastIndexOf('/');
        const skipHttp =
            typeof sourceUrl === 'string' &&
            (sourceUrl.startsWith('nostr:') || sourceUrl.startsWith('branch:') || sourceUrl.startsWith('indexeddb:'));
        const baseDir = !skipHttp && slash >= 0 ? sourceUrl.substring(0, slash + 1) : '';

        const promises = prefixes.map(async (prefix) => {
            const cacheKey = `${lang}_${prefix}`;
            if (cacheMap[cacheKey]) return cacheMap[cacheKey];
            try {
                /** @type {object[]} */
                let normalized = [];
                if (baseDir) {
                    const url = `${baseDir}search/${lang}/${c}/${prefix}.json`;
                    const res = await fetch(url);
                    if (res.ok) {
                        const shard = await res.json();
                        if (Array.isArray(shard)) {
                            normalized = shard.map((item) => ({
                                id: item.id,
                                name: item.n || item.name,
                                type: item.t || item.type,
                                icon: item.i || item.icon,
                                description: item.d || item.description,
                                path: item.p || item.path,
                                lang: item.l || item.lang,
                                searchBody: item.sb != null ? item.sb : item.searchBody
                            }));
                        }
                    }
                }
                if (typeof getLocalOverlay === 'function') {
                    const langU = String(lang || 'EN').toUpperCase().slice(0, 8);
                    const overlay = await getLocalOverlay(langU, prefix);
                    if (overlay && overlay.length) {
                        normalized = mergeSearchEntriesById(normalized, overlay);
                    }
                }
                cacheMap[cacheKey] = normalized;
                return normalized;
            } catch (e) {
                cacheMap[cacheKey] = [];
                return [];
            }
        });

        const results = await Promise.all(promises);
        const flat = results.flat();
        const seen = new Set();
        return flat.filter((item) => {
            if (seen.has(item.id)) return false;
            const hay = TreeUtils.cleanString(
                `${item.name || ''} ${item.description || ''} ${item.searchBody || ''}`
            );
            const words = hay.split(/\s+/).filter(Boolean);
            const matchesInitial = words.some((w) => w.startsWith(c));
            if (!matchesInitial) return false;
            seen.add(item.id);
            return true;
        });
    },

    /**
     * Folder/root under which a new child should be created.
     * Leaves/exams are not containers — resolve to their parent module.
     * @param {object} node
     * @param {(id: string) => object | null} findNode
     * @returns {object | null}
     */
    folderNodeForNewChild(node, findNode) {
        if (!node) return null;
        if (node.type === 'leaf' || node.type === 'exam') {
            if (!node.parentId || typeof findNode !== 'function') return null;
            const parent = findNode(node.parentId);
            if (parent && (parent.type === 'branch' || parent.type === 'root')) return parent;
            return null;
        }
        if (node.type === 'branch' || node.type === 'root') return node;
        return null;
    },

    /**
     * Folder path for createNode (strip `README.md` / parent of a `.md` leaf).
     * @param {object} node
     * @param {(id: string) => object | null} findNode
     */
    directoryPathForNewChild(node, findNode) {
        const folder = TreeUtils.folderNodeForNewChild(node, findNode);
        if (!folder) return null;
        const pathStr = (n) => String(n.sourcePath || n.path || '').trim();
        let p = pathStr(folder);
        if (!p) return null;
        if (p.endsWith('/README.md')) return p.slice(0, -'/README.md'.length);
        if (p.endsWith('.md')) {
            const i = p.lastIndexOf('/');
            return i >= 0 ? p.slice(0, i) : null;
        }
        return p.replace(/\/+$/, '');
    },

    /**
     * Counts nodes (root/branch/leaf) across all language roots in raw curriculum JSON.
     * @param {{ languages?: Record<string, unknown> } | null | undefined} raw
     * @returns {number}
     */
    countNodesInRawGraph(raw) {
        if (!raw || typeof raw !== 'object' || !raw.languages) return 0;
        let n = 0;
        const walk = (node) => {
            if (!node || typeof node !== 'object') return;
            n += 1;
            if (Array.isArray(node.children)) {
                for (const c of node.children) walk(c);
            }
        };
        for (const k of Object.keys(raw.languages)) {
            walk(raw.languages[k]);
        }
        return n;
    },

    /** UTF-8 byte length of JSON.stringify(obj), rough footprint for UI / export hints. */
    utf8JsonByteLength(obj) {
        try {
            return new TextEncoder().encode(JSON.stringify(obj)).length;
        } catch {
            return 0;
        }
    },

    /** Lightweight structure fingerprint, invalidates UI snapshot when tree changes. */
    treeStructureSig(root) {
        if (!root || typeof root !== 'object') return '';
        let count = 0;
        const walk = (n) => {
            if (!n) return;
            count += 1;
            if (n.children) n.children.forEach(walk);
        };
        walk(root);
        return `${String(root.id || '')}:${count}`;
    },
};
