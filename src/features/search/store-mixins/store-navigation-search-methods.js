import { TreeUtils } from '../../tree-graph/tree-utils.js';

/** GraphLogic / AILogic delegates plus content-shell navigation (preview, lesson, search). */
export const storeNavigationSearchMethods = {
    findNode(id) { return this.graphLogic.findNode(id); },
    async navigateTo(nodeId, nodeData = null) { return this.graphLogic.navigateTo(nodeId, nodeData); },
    async toggleNode(nodeId) { return this.graphLogic.toggleNode(nodeId); },
    async loadNodeChildren(node, opts) { return this.graphLogic.loadNodeChildren(node, opts); },
    async loadNodeContent(node) { return this.graphLogic.loadNodeContent(node); },
    async moveNode(node, newParentId) { return this.graphLogic.moveNode(node, newParentId); },

    enterLesson() {
        const node = this.state.previewNode;
        if (!node) return;
        if (
            !node.content &&
            (node.contentPath ||
                (node.treeLazyContent && node.treeContentKey))
        ) {
            this.loadNodeContent(node).then(() => {
                this.update({ selectedNode: node, previewNode: null });
            });
        } else {
            this.update({ selectedNode: node, previewNode: null });
        }
    },

    goHome() {
        this.update({
            viewMode: 'explore',
            selectedNode: null,
            previewNode: null,
            modal: null,
            certificatesFromMobileMore: false
        });
    },

    async confirmLeaveActiveQuizIfNeeded() {
        const contentEl = document.querySelector('arborito-content');
        if (contentEl && typeof contentEl.confirmLeaveIfNeeded === 'function') {
            return contentEl.confirmLeaveIfNeeded();
        }
        return true;
    },

    async requestGoHome() {
        // 1. Check for active game modal
        const m = this.state.modal;
        const mt = m && (typeof m === 'string' ? m : m.type);
        if (mt === 'game-player') {
            const ok = await this.confirm(this.ui.confirmCloseGame || 'Are you sure you want to exit the game? Any unsaved progress will be lost.');
            if (!ok) return;
        }

        // 2. Check for unsaved lesson changes
        const contentEl = document.querySelector('arborito-content');
        if (contentEl && typeof contentEl._isLessonDirty === 'function') {
            if (contentEl._isLessonDirty()) {
                const ok = await this.confirm(this.ui.confirmDiscardUnsavedChanges || 'You have unsaved changes in your lesson. Exit anyway?');
                if (!ok) return;
            }
        }

        // 3. Active quiz or exam in progress
        if (!(await this.confirmLeaveActiveQuizIfNeeded())) return;

        // 3. Ensure all mobile menus and overlays are closed
        const sb = document.querySelector('arborito-sidebar');
        if (sb && typeof sb.closeMobileMenuIfOpen === 'function') {
            sb.closeMobileMenuIfOpen();
        }

        // 4. Force clear all modal states
        this.update({ 
            viewMode: 'explore',
            modal: null,
            modalOverlay: null,
            previewNode: null,
            selectedNode: null
        });

        this.goHome();
    },
    closePreview() { this.update({ previewNode: null }); },
    closeContent() { this.update({ selectedNode: null }); },
    /**
     * Opens lesson/exam editing in the content shell (never the Arborito Studio modal).
     * @param {object} node
     * @param {{ forceOverlay?: boolean }} [opts] - If true, after ensuring the lesson is open fires `arborito-lesson-magic-open` (magic draft in shell).
     */
    openEditor(node, opts = {}) {
        if (!node) return;
        const isLesson = node.type === 'leaf' || node.type === 'exam';
        if (isLesson) {
            const sel = this.state.selectedNode;
            const already = sel && String(sel.id) === String(node.id);
            if (!already) {
                void this.navigateTo(node.id, node);
            }
            if (opts.forceOverlay) {
                queueMicrotask(() => this.dispatchEvent(new CustomEvent('arborito-lesson-magic-open')));
            }
            return;
        }
        if (node.type === 'branch' || node.type === 'root') {
            this.update({ modal: { type: 'node-properties', node } });
        }
    },

    async search(query) {
        if (!this.state.activeSource?.url) return [];
        const getLocalOverlay = (langU, prefix) =>
            import('../search-index-service.js').then((m) =>
                m.getLocalShardOverlay(this.state.activeSource, this.state.rawGraphData, langU, prefix)
            );
        return TreeUtils.search(
            query,
            this.state.activeSource,
            this.state.lang,
            this.state.searchCache,
            getLocalOverlay
        );
    },

    async searchBroad(char) {
        if (!this.state.activeSource?.url) return [];
        const getLocalOverlay = (langU, prefix) =>
            import('../search-index-service.js').then((m) =>
                m.getLocalShardOverlay(this.state.activeSource, this.state.rawGraphData, langU, prefix)
            );
        return TreeUtils.searchBroad(
            char,
            this.state.activeSource,
            this.state.lang,
            this.state.searchCache,
            getLocalOverlay
        );
    },

    // --- INTEGRATIONS (AI, Cloud, User) ---

    async initSage() { return this.aiLogic.initSage(); },
    abortSage() { return this.aiLogic.abortSage(); },
    clearSageChat() { return this.aiLogic.clearSageChat(); },
    async chatWithSage(userText) { return this.aiLogic.chatWithSage(userText); }
};
