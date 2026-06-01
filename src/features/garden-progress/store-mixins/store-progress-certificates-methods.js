import { TreeUtils } from '../../tree-graph/tree-utils.js';

/** UserStore proxies for bookmarks/progress + certificates / module status. */
export const storeProgressCertificatesMethods = {
    // --- USER STORE PROXIES ---

    computeHash(str) { return this.userStore.settings.computeHash(str); },

    loadBookmarks() { this.userStore.settings.loadBookmarks(); },
    saveBookmark(nodeId, contentRaw, index, visitedSet) { this.userStore.settings.saveBookmark(nodeId, contentRaw, index, visitedSet); },
    removeBookmark(nodeId) { this.userStore.settings.removeBookmark(nodeId); this.update({}); },
    getBookmark(nodeId, contentRaw) { return this.userStore.settings.getBookmark(nodeId, contentRaw); },
    loadProgress() { this.userStore.loadProgress(); },

    isCompleted(id) { return this.userStore.isCompleted(id); },

    getAvailableCertificates() {
        if (this.state.data && this.state.data.certificates) {
            return this.state.data.certificates.map(c => {
                const isComplete = this.userStore.state.completedNodes.has(c.id);
                return { ...c, isComplete };
            });
        }
        return this.getModulesStatus().filter(m => m.isCertifiable);
    },

    getModulesStatus() {
        return TreeUtils.getModulesStatus(this.state.data, this.userStore.state.completedNodes);
    }
};
