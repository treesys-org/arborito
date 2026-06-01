import { store } from '../../../core/store.js';
import { isExamLesson } from '../exam-context.js';

/** Store-mediated dialogs/modals plus the store→component sync hook. */
export const modalDispatchMixin = {
    async confirmLeaveIfNeeded() {
        if (!this.hasActiveQuizInProgress()) return true;
        const isExam = this.currentNode && isExamLesson(this.currentNode);
        const msg = isExam
            ? store.ui.confirmLeaveActiveExam ||
              'Leave the exam? You will lose this attempt\u2019s progress.'
            : store.ui.confirmLeaveActiveQuiz ||
              'Leave the quiz? You will lose this attempt\u2019s progress.';
        return store.confirm(msg);
    },

    async launchInlineGame(url, title, topics) {
        const u = String(url || '').trim();
        if (!u) return;

        // One-time warning for loading external games from lessons
        try {
            const hideKey = 'arborito-inline-game-warning-hide';
            const alreadyHidden = localStorage.getItem(hideKey) === 'true';
            if (!alreadyHidden) {
                const ui = store.ui;
                const msg =
                    ui.inlineGameWarning ||
                    'You are about to load an external game that may include third-party content. Continue? (This notice will not be shown again.)';
                const ok = await store.confirm(msg);
                if (!ok) return;
                localStorage.setItem(hideKey, 'true');
            }
        } catch {
            // Ignore storage/confirm errors, fall through to launch
        }

        const activeSource = store.value.activeSource;
        if (!activeSource) {
            // Fallback: user can still open Arcade from the tree chrome
            store.notify(store.ui.errorNoContent || 'No active source selected.', true);
            return;
        }
        const lang = store.value.lang || 'EN';
        const node = this.currentNode;
        const parent = node?.parentId ? store.findNode(node.parentId) : null;
        const moduleId =
            parent && (parent.type === 'branch' || parent.type === 'root') ? parent.id : (node?.id || null);
        if (!moduleId) return;
        const targetNode = store.findNode(moduleId);
        const modulePath = targetNode?.apiPath || targetNode?.contentPath || '';
        const treeUrl = encodeURIComponent(activeSource.url);
        const encodedPath = encodeURIComponent(modulePath);

        let finalUrl = u;
        const separator = finalUrl.includes('?') ? '&' : '?';
        finalUrl += `${separator}source=${treeUrl}&lang=${lang}`;
        if (encodedPath) finalUrl += `&module=${encodedPath}`;
        finalUrl += `&moduleId=${encodeURIComponent(String(moduleId))}`;
        const topicIds = Array.isArray(topics)
            ? topics.map((t) => String(t).trim()).filter(Boolean)
            : String(topics || '')
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
        if (topicIds.length > 0) {
            finalUrl += `&topics=${encodeURIComponent(topicIds.join(','))}`;
        }

        store.setModal({
            type: 'game-player',
            url: finalUrl,
            title: title || store.ui.gameDefaultTitle,
            moduleId
        });
    },

    async skipSection() {
        if (!this.currentNode) return;
        if (!(await this.confirmLeaveIfNeeded())) return;
        store.saveBookmark(
            this.currentNode.id,
            this.currentNode.content,
            this.activeSectionIndex,
            this.visitedSections
        );
        store.closeContent();
    },

    /** Sync local node from store; bookmarks on navigation. */
    onState(detail) {
        const newNode = detail.selectedNode;
        const newId = newNode ? newNode.id : null;
        const currentId = this.currentNode ? this.currentNode.id : null;

            if (newId !== currentId) {
            this.currentNode = newNode;
            this.lastRenderKey = null;
            this._lessonStoreFp = null;
            this._invalidateLessonParseCache();
            this.mediaDeclinedLessonId = null;
            this._lessonDraftLessonId = null;
            this._lessonBodyMarkdown = null;
            this._lessonHistoryStack = [];
            this._lessonSaveState = 'saved';
            this._careFeedbackMsg = null;
            if (newNode) {
                this.resetState();
                const bookmark = store.getBookmark(newNode.id, newNode.content);
                if (bookmark) {
                    this.activeSectionIndex = bookmark.index || 0;
                    this.visitedSections = new Set(bookmark.visited || []);
                }
                this.isTocVisible = false;
                this.scheduleUpdate(true);
            }
            return;
        }
        if (newId != null && newNode && currentId === newId && newNode !== this.currentNode) {
            this.currentNode = newNode;
            this._headerMetaDraft = null;
            this.lastRenderKey = null;
            this._invalidateLessonParseCache();
        }
        if (!this.currentNode && this.innerHTML === '') {
            return false;
        }
        const fp = this._lessonStoreFingerprint(detail);
        if (fp && fp === this._lessonStoreFp) return false;
        this._lessonStoreFp = fp;
    }
};
