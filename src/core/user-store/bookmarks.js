const MAX_BOOKMARKS = 50;
const MAX_RECENT_LESSONS = 10;

export const bookmarksMixin = {
    loadBookmarks() {
        try {
            const saved = localStorage.getItem('arborito-bookmarks');
            if (saved) this.state.bookmarks = JSON.parse(saved);
            const recent = localStorage.getItem('arborito-recent-lessons');
            if (recent) this.state.recentLessons = JSON.parse(recent);
        } catch (e) {}
        if (!this.state.recentLessons || typeof this.state.recentLessons !== 'object') {
            this.state.recentLessons = {};
        }
    },

    /** Only persists when `opts.manual === true` (user tapped the bookmark star). */
    saveBookmark(nodeId, contentRaw, index, visitedSet, opts = {}) {
        if (!opts.manual) return;
        if (!nodeId || !contentRaw) return;
        const currentHash = this.computeHash(contentRaw);
        const keys = Object.keys(this.state.bookmarks).filter((k) => this.state.bookmarks[k]?.manual === true);
        if (keys.length >= MAX_BOOKMARKS && !this.state.bookmarks[nodeId]?.manual) {
            let oldestKey = null;
            let oldestTime = Infinity;
            keys.forEach((k) => {
                const ts = this.state.bookmarks[k].timestamp || 0;
                if (ts < oldestTime) {
                    oldestTime = ts;
                    oldestKey = k;
                }
            });
            if (oldestKey) delete this.state.bookmarks[oldestKey];
        }
        this.state.bookmarks[nodeId] = {
            hash: currentHash,
            index: index || 0,
            sectionTitle: String(opts.sectionTitle || '').trim(),
            visited: Array.from(visitedSet || []),
            timestamp: Date.now(),
            manual: true
        };
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
        if (!bookmark || bookmark.manual !== true) return null;
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

    /** Last reading position for a lesson (not manual bookmarks). */
    getRecentLessonPosition(nodeId, contentRaw) {
        if (!nodeId) return null;
        const recent = this.state.recentLessons?.[nodeId];
        if (!recent || typeof recent.index !== 'number') return null;
        if (contentRaw) {
            const currentHash = this.computeHash(contentRaw);
            if (!recent.contentHash || recent.contentHash !== currentHash) return null;
        }
        return {
            index: recent.index,
            visited: Array.isArray(recent.visited) ? recent.visited : [],
            quizPassed: Array.isArray(recent.quizPassed) ? recent.quizPassed : [],
        };
    },

    getLessonResumePosition(nodeId, contentRaw) {
        return this.getRecentLessonPosition(nodeId, contentRaw);
    },

    getManualBookmarks() {
        const entries = Object.entries(this.state.bookmarks).filter(([, data]) => data && data.manual === true);
        entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
        return entries.map(([id, data]) => ({ id, ...data }));
    },

    recordRecentLesson(nodeId, index = 0, visitedSet, contentRaw, quizPassed) {
        if (!nodeId) return;
        if (!this.state.recentLessons || typeof this.state.recentLessons !== 'object') {
            this.state.recentLessons = {};
        }
        const prev = this.state.recentLessons[nodeId];
        const contentHash = contentRaw
            ? this.computeHash(contentRaw)
            : prev?.contentHash || null;
        const passedIds = Array.isArray(quizPassed)
            ? quizPassed.filter(Boolean)
            : Array.isArray(prev?.quizPassed)
              ? prev.quizPassed
              : [];
        this.state.recentLessons[nodeId] = {
            index: index || 0,
            visited: Array.from(visitedSet || []),
            quizPassed: passedIds,
            timestamp: Date.now(),
            ...(contentHash ? { contentHash } : {}),
        };
        const entries = Object.entries(this.state.recentLessons);
        if (entries.length > MAX_RECENT_LESSONS) {
            entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
            this.state.recentLessons = Object.fromEntries(entries.slice(0, MAX_RECENT_LESSONS));
        }
        try {
            localStorage.setItem('arborito-recent-lessons', JSON.stringify(this.state.recentLessons));
        } catch (_) {
            /* ignore quota */
        }
    },

    getRecentLessons() {
        if (!this.state.recentLessons || typeof this.state.recentLessons !== 'object') return [];
        const entries = Object.entries(this.state.recentLessons);
        entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
        return entries.map(([id, data]) => ({ id, ...data }));
    }
};
