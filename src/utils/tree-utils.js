
export const TreeUtils = {
    cleanString(str) {
        if (!str) return "";
        return str.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
            .replace(/[^a-z0-9\s]/g, ""); 
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

    getModulesStatus(data, completedNodesSet) {
        if (!data) return [];
        const modules = [];
        const traverse = (node) => {
            if (node.type === 'branch' || node.type === 'root') {
                 const total = node.totalLeaves || 0;
                 if (total > 0 || node.type === 'branch') {
                     let completedCount = 0;
                     if (completedNodesSet.has(node.id)) {
                         completedCount = total;
                     } else if (node.leafIds) {
                         completedCount = node.leafIds.filter(id => completedNodesSet.has(id)).length;
                     }
                     const isComplete = completedNodesSet.has(node.id) || (total > 0 && completedCount >= total);
                     if (node.type !== 'root') {
                        modules.push({
                            id: node.id, name: node.name, icon: node.icon, description: node.description,
                            totalLeaves: total, completedLeaves: completedCount, isComplete: isComplete,
                            path: node.path, isCertifiable: node.isCertifiable
                        });
                     }
                 }
            }
            if (node.children) node.children.forEach(traverse);
        };
        traverse(data);
        return modules.sort((a,b) => b.isComplete === a.isComplete ? 0 : (b.isComplete ? 1 : -1));
    },

    async search(query, activeSource, lang, cache) {
        if (!query || query.length < 2) return [];
        if (!activeSource?.url) return [];
        const q = TreeUtils.cleanString(query);
        const prefix = q.substring(0, 2); 
        const cacheKey = `${lang}_${prefix}`;

        if (!cache[cacheKey]) {
            try {
                const sourceUrl = activeSource.url;
                const slash = sourceUrl.lastIndexOf('/');
                if (slash < 0) {
                    cache[cacheKey] = [];
                } else {
                    const baseDir = sourceUrl.substring(0, slash + 1);
                    const firstChar = prefix.charAt(0);
                    const url = `${baseDir}search/${lang}/${firstChar}/${prefix}.json`;

                    const res = await fetch(url);
                    if (res.ok) {
                        const shard = await res.json();
                        if (!Array.isArray(shard)) {
                            cache[cacheKey] = [];
                        } else {
                            const normalized = shard.map((item) => ({
                                id: item.id,
                                name: item.n || item.name,
                                type: item.t || item.type,
                                icon: item.i || item.icon,
                                description: item.d || item.description,
                                path: item.p || item.path,
                                lang: item.l || item.lang
                            }));
                            cache[cacheKey] = normalized;
                        }
                    } else {
                        cache[cacheKey] = [];
                    }
                }
            } catch (e) {
                cache[cacheKey] = [];
            }
        }

        const shard = cache[cacheKey] || [];
        return shard.filter(n => TreeUtils.cleanString(n.name).includes(q));
    },

    async searchBroad(char, activeSource, lang, cache) {
        if (!char || char.length !== 1) return [];
        if (!activeSource?.url) return [];
        const c = TreeUtils.cleanString(char);
        const suffixes = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
        const prefixes = suffixes.map(s => c + s);
        const sourceUrl = activeSource.url;
        const slash = sourceUrl.lastIndexOf('/');
        if (slash < 0) return [];
        const baseDir = sourceUrl.substring(0, slash + 1);
        
        const promises = prefixes.map(async (prefix) => {
            const cacheKey = `${lang}_${prefix}`;
            if (cache[cacheKey]) return cache[cacheKey];
            try {
                const url = `${baseDir}search/${lang}/${c}/${prefix}.json`;
                const res = await fetch(url);
                if (res.ok) {
                    const shard = await res.json();
                    if (!Array.isArray(shard)) {
                        cache[cacheKey] = [];
                        return [];
                    }
                    const normalized = shard.map(item => ({
                        id: item.id, name: item.n || item.name, type: item.t || item.type,
                        icon: item.i || item.icon, description: item.d || item.description,
                        path: item.p || item.path, lang: item.l || item.lang
                    }));
                    cache[cacheKey] = normalized;
                    return normalized;
                }
            } catch(e) { }
            cache[cacheKey] = [];
            return [];
        });

        const results = await Promise.all(promises);
        const flat = results.flat();
        const seen = new Set();
        return flat.filter(item => {
            if(seen.has(item.id)) return false;
            const words = TreeUtils.cleanString(item.name).split(/\s+/);
            const matchesInitial = words.some(w => w.startsWith(c));
            if (!matchesInitial) return false; 
            seen.add(item.id);
            return true;
        });
    }
};
