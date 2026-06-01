import { store } from '../../../core/store.js';
import { parseContent } from '../parser.js';
import { parseArboritoFile } from '../../editor/editor-engine.js';
import { isExamLesson } from '../exam-context.js';
import {
    annotateTocWithQuizSections,
    findFirstQuizSectionIndex,
    getToc
} from '../content-toc.js';

/** Exam-specific lifecycle (start exam flow, completion persistence, certificate). */
export const examMixin = {
    _persistExamPass() {
        if (!this.currentNode || !isExamLesson(this.currentNode)) return;
        store.markComplete(this.currentNode.id, true);
        store.markExamExemptSiblingLeaves(this.currentNode.id);
        store.checkForModuleCompletion(this.currentNode.id);
    },

    startTheExam() {
        if (!this.currentNode) return;
        const contentForParse = this._getContentForTocParse();
        const parsed = parseArboritoFile(contentForParse);
        const blocks = parseContent(parsed.body || contentForParse);
        const toc = annotateTocWithQuizSections(blocks, getToc({ content: contentForParse }));
        const quizIdx = findFirstQuizSectionIndex(blocks, toc);
        if (quizIdx >= 0) {
            this.quizSession = null;
            this.scrollToSection(quizIdx);
        }
    },

    handleExamPass() {
        const n = this.currentNode;
        if (!n) return;
        if (isExamLesson(n) && n.content) {
            const parsed = parseArboritoFile(n.content);
            const blocks = parseContent(parsed.body || n.content);
            const v2 = blocks.filter((b) => b.type === 'quizv2');
            if (v2.length) {
                const correct = v2.filter((b) => !!this.getQuizState(b.id || 'quiz-v2').v2Correct).length;
                if (correct / v2.length >= 0.8) this._persistExamPass();
            }
        }
        const parent = n.parentId ? store.findNode(n.parentId) : null;
        const moduleId =
            parent && (parent.type === 'branch' || parent.type === 'root') ? parent.id : n.id;
        store.setModal({ type: 'certificate', moduleId });
    }
};
