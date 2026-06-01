import { store } from '../../../core/store.js';
import { getToc } from '../content-toc.js';
import {
    addTocSectionAfter,
    addTocSubsectionAfter,
    removeTocSection,
    renameTocSection,
    getTocLineRanges
} from '../lesson-toc-mutations.js';

/** UI-triggered handlers: close/toc/bookmark toggles and TOC construct mutations. */
export const bindingsMixin = {
    async handleClose() {
        if (!(await this.confirmLeaveIfNeeded())) return;
        if (this.currentNode) {
            store.saveBookmark(
                this.currentNode.id,
                this.currentNode.content,
                this.activeSectionIndex,
                this.visitedSections
            );
        }
        store.closeContent();
    },

    toggleToc() {
        this.isTocVisible = !this.isTocVisible;
        this.lastRenderKey = null;
        this.render();
    },

    toggleBookmark() {
        if (!this.currentNode) return;
        const has = store.getBookmark(this.currentNode.id, this.currentNode.content);
        if (has) store.removeBookmark(this.currentNode.id);
        else {
            store.saveBookmark(
                this.currentNode.id,
                this.currentNode.content,
                this.activeSectionIndex,
                this.visitedSections
            );
        }
        this.lastRenderKey = null;
        this.render();
    },

    _applyTocRename(idx, title, emoji) {
        if (!this._isLessonConstructEdit()) return;
        this._captureLessonDraftFromDom();
        const body = this._getLessonBodyForToc();
        const next = renameTocSection(body, idx, title, emoji);
        this._lessonBodyMarkdown = next;
        this._lessonDraftLessonId = this.currentNode.id;
        this._lessonDraftNonce += 1;
        this._tocInlineEditIdx = null;
        this._skipLessonDraftDomCapture = true;
        this.lastRenderKey = null;
        this._lessonSaveState = 'idle';
        this.render();
    },

    _lessonTocAdd() {
        if (!this._isLessonConstructEdit()) return;
        this._captureLessonDraftFromDom();
        const body = this._getLessonBodyForToc();
        const ui = store.ui;
        const baseTitle = ui.lessonTocNewSectionTitle || 'New section';
        const tocNow = getToc({ content: body });
        const uniqueTitle = (base, toc) => {
            const b = String(base || '').trim();
            if (!b) return 'New section';
            const re = new RegExp(`^${b.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?:\\s+(\\d+))?$`, 'i');
            let max = 0;
            for (const it of toc || []) {
                if (!it || it.id === 'intro') continue;
                const t = String(it.text || '').trim();
                const m = t.match(re);
                if (!m) continue;
                const n = m[1] ? parseInt(m[1], 10) : 1;
                if (Number.isFinite(n)) max = Math.max(max, n);
            }
            return max <= 0 ? b : `${b} ${max + 1}`;
        };
        const title = uniqueTitle(baseTitle, tocNow);
        // Business rule: “+ New section” always creates a top-level section,
        // regardless of selection. Insert at end of document.
        const ranges = getTocLineRanges(body);
        const rangeAfterIdx = ranges.length ? ranges.length - 1 : 0;
        const next = addTocSectionAfter(body, rangeAfterIdx, title);
        this._lessonBodyMarkdown = next;
        this._lessonDraftLessonId = this.currentNode.id;
        this._lessonDraftNonce += 1;
        const tocAfter = getToc({ content: next });
        this.activeSectionIndex = Math.max(0, tocAfter.length - 1);
        this._skipLessonDraftDomCapture = true;
        this.lastRenderKey = null;
        this._lessonSaveState = 'idle';
        this.render();
    },

    _lessonTocAddSub() {
        this._lessonTocAddSubAt(this.activeSectionIndex);
    },

    _lessonTocAddSubAt(afterIdx) {
        if (!this._isLessonConstructEdit()) return;
        this._captureLessonDraftFromDom();
        const body = this._getLessonBodyForToc();
        const ui = store.ui;
        const baseTitle = ui.lessonTocNewSubsectionTitle || 'New sub-topic';
        const safeAfter = Number.isInteger(afterIdx) ? afterIdx : this.activeSectionIndex;
        const tocNow = getToc({ content: body });
        const uniqueTitle = (base, toc) => {
            const b = String(base || '').trim();
            if (!b) return 'New sub-topic';
            const re = new RegExp(`^${b.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?:\\s+(\\d+))?$`, 'i');
            let max = 0;
            for (const it of toc || []) {
                if (!it || it.id === 'intro') continue;
                const t = String(it.text || '').trim();
                const m = t.match(re);
                if (!m) continue;
                const n = m[1] ? parseInt(m[1], 10) : 1;
                if (Number.isFinite(n)) max = Math.max(max, n);
            }
            return max <= 0 ? b : `${b} ${max + 1}`;
        };
        const title = uniqueTitle(baseTitle, tocNow);
        const next = addTocSubsectionAfter(body, safeAfter, title);
        this._lessonBodyMarkdown = next;
        this._lessonDraftLessonId = this.currentNode.id;
        this._lessonDraftNonce += 1;
        const tocAfter = getToc({ content: next });
        const titleNorm = String(title || '').trim();
        let newIdx = -1;
        for (let i = tocAfter.length - 1; i >= 0; i--) {
            if (String(tocAfter[i].text || '').trim() === titleNorm) {
                newIdx = i;
                break;
            }
        }
        this.activeSectionIndex = newIdx >= 0 ? newIdx : Math.max(0, tocAfter.length - 1);
        this._skipLessonDraftDomCapture = true;
        this.lastRenderKey = null;
        this._lessonSaveState = 'idle';
        this.render();
    },

    _lessonTocRemove() {
        this._lessonTocRemoveAt(this.activeSectionIndex);
    },

    /**
     * Removes section at `idx` (same pattern as deleting a graph node by row).
     * Keeps at least one section and the virtual “Intro” entry.
     */
    _lessonTocRemoveAt(idx) {
        if (!this._isLessonConstructEdit()) return;
        this._captureLessonDraftFromDom();
        const body = this._getLessonBodyForToc();
        const toc = getToc({ content: body });
        const ui = store.ui;
        if (toc.length <= 1) {
            store.notify(ui.lessonTocRemoveBlocked || 'At least one section is required.', true);
            return;
        }
        const safeIdx = Number.isInteger(idx) ? idx : this.activeSectionIndex;
        const target = toc[safeIdx];
        if (!target || target.id === 'intro' || target.isQuiz) return;
        const next = removeTocSection(body, safeIdx);
        this._lessonBodyMarkdown = next;
        this._lessonDraftLessonId = this.currentNode.id;
        this._lessonDraftNonce += 1;
        const tocAfter = getToc({ content: next });
        if (this.activeSectionIndex >= safeIdx) {
            this.activeSectionIndex = Math.max(0, Math.min(this.activeSectionIndex - 1, tocAfter.length - 1));
        }
        this._skipLessonDraftDomCapture = true;
        this.lastRenderKey = null;
        this._lessonSaveState = 'idle';
        this.render();
    }
};
