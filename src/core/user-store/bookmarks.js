const MAX_BOOKMARKS = 50;

export const bookmarksMixin = {
    loadBookmarks() {
        try {
            const saved = localStorage.getItem('arborito-bookmarks');
            if (saved) this.state.bookmarks = JSON.parse(saved);
        } catch (e) {}
    },

    saveBookmark(nodeId, contentRaw, index, visitedSet) {
        if (!nodeId || !contentRaw) return;
        const currentHash = this.computeHash(contentRaw);
        const keys = Object.keys(this.state.bookmarks);
        if (keys.length >= MAX_BOOKMARKS && !this.state.bookmarks[nodeId]) {
            let oldestKey = null; let oldestTime = Infinity;
            keys.forEach(k => {
                const ts = this.state.bookmarks[k].timestamp || 0;
                if (ts < oldestTime) { oldestTime = ts; oldestKey = k; }
            });
            if (oldestKey) delete this.state.bookmarks[oldestKey];
        }
        this.state.bookmarks[nodeId] = { hash: currentHash, index: index || 0, visited: Array.from(visitedSet || []), timestamp: Date.now() };
        localStorage.setItem('arborito-bookmarks', JSON.stringify(this.state.bookmarks));
        this.persist();
    },

    removeBookmark(nodeId) {
        if (!nodeId) return;
        if (this.state.bookmarks[nodeId]) {
            delete this.state.bookmarks[nodeId];
            localStorage.setItem('arborito-bookmarks', JSON.stringify(this.state.bookmarks));
            this.persist();
        }
    },

    getBookmark(nodeId, contentRaw) {
        if (!nodeId) return null;
        const bookmark = this.state.bookmarks[nodeId];
        if (!bookmark) return null;
        if (contentRaw) {
            const currentHash = this.computeHash(contentRaw);
            if (bookmark.hash !== currentHash) {
                delete this.state.bookmarks[nodeId];
                localStorage.setItem('arborito-bookmarks', JSON.stringify(this.state.bookmarks));
                return null;
            }
        }
        return bookmark;
    },

    getRecentBookmarks() {
        const entries = Object.entries(this.state.bookmarks);
        entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
        return entries.map(([id, data]) => ({ id, ...data }));
    }
};
