import { store } from '../../../core/store.js';
import { fileSystem } from '../../backup-export/filesystem.js';
import {
    parseArboritoFile,
    visualHTMLToMarkdown
} from '../editor-engine.js';
import {
    extractTocSectionMarkdown,
    replaceTocSectionMarkdown,
    sanitiseConstructSectionMarkdown
} from '../../learning/lesson-section-slices.js';

/** Local state predicates and mutators for the lesson construct flow. */
export const stateMixin = {
    _isLessonConstructEdit() {
        const n = this.currentNode;
        return (
            !!store.value.constructionMode &&
            fileSystem.features.canWrite &&
            n &&
            (n.type === 'leaf' || n.type === 'exam')
        );
    },

    _refreshLessonSaveButton() {
        if (!this._isLessonConstructEdit()) return;
        const saveBtn = this.querySelector('#btn-lesson-save');
        if (!saveBtn) return;

        if (this._lessonSaveState === 'saving') {
            saveBtn.disabled = true;
            return;
        }

        const isDirty = this._isLessonDirty();
        if (isDirty) {
            this._lessonSaveState = 'idle';
            this._setLessonSaveButtonSavedVisual(saveBtn, false);
        } else {
            this._lessonSaveState = 'saved';
            this._setLessonSaveButtonSavedVisual(saveBtn, true);
        }
    },

    _isLessonDirty() {
        if (!this.currentNode) return false;
        const n = store.findNode(this.currentNode.id) || this.currentNode;
        
        // Check meta
        const titleInp = this.querySelector('#inp-lesson-header-title');
        const descInp = this.querySelector('#inp-lesson-header-desc');
        if (titleInp && titleInp.value.trim() !== (n.name || '').trim()) return true;
        if (descInp && descInp.value.trim() !== (n.description || '').trim()) return true;

        // Check body (merge active section into full lesson before compare)
        const editorEl = this.querySelector('#lesson-visual-editor');
        if (editorEl) {
            const sectionMd = visualHTMLToMarkdown(editorEl);
            const full = this._getLessonBodyForToc();
            const merged = replaceTocSectionMarkdown(full, this.activeSectionIndex, sectionMd);
            const originalMd = n.content ? parseArboritoFile(n.content).body : '';
            if (merged.trim() !== originalMd.trim()) return true;
        }

        return false;
    },

    _flushConstructSectionToBody() {
        const ed = this.querySelector('#lesson-visual-editor');
        if (!ed || !this._isLessonConstructEdit() || !this.currentNode) return;
        const flushIdx = Number.isInteger(this._constructEditorBoundSection)
            ? this._constructEditorBoundSection
            : this.activeSectionIndex;
        let sectionMd = sanitiseConstructSectionMarkdown(visualHTMLToMarkdown(ed));
        const full = this._getLessonBodyForToc();
        this._lessonBodyMarkdown = replaceTocSectionMarkdown(full, flushIdx, sectionMd);
        this._lessonDraftLessonId = this.currentNode.id;
    },

    _captureLessonDraftFromDom() {
        if (!this._isLessonConstructEdit()) return;
        this._flushConstructSectionToBody();
    },

    _getConstructEditorSectionMarkdown() {
        const full = this._getLessonBodyForToc();
        return extractTocSectionMarkdown(full, this.activeSectionIndex);
    },

    _pushLessonHistory(editorEl) {
        if (!editorEl) return;
        if (this._lessonHistoryStack.length > 20) this._lessonHistoryStack.shift();
        this._lessonHistoryStack.push(editorEl.innerHTML);
        const btn = this.querySelector('#btn-lesson-undo');
        if (btn) {
            btn.disabled = this._lessonHistoryStack.length === 0;
            btn.style.opacity = btn.disabled ? '0.5' : '1';
        }
    },

    _lessonUndo(editorEl) {
        if (this._lessonHistoryStack.length === 0 || !editorEl) return;
        const prev = this._lessonHistoryStack.pop();
        editorEl.innerHTML = prev;
        this._assignHeadingIdsFromBlocks(editorEl, visualHTMLToMarkdown(editorEl));
        const btn = this.querySelector('#btn-lesson-undo');
        if (btn) {
            btn.disabled = this._lessonHistoryStack.length === 0;
            btn.style.opacity = btn.disabled ? '0.5' : '1';
        }
    }
};
