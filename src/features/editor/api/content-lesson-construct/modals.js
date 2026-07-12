import { getArboritoStore as store } from '../../../../core/store-singleton.js';
import { aiService } from '../../../learning/api/ai.js';
import { replaceEditorHtml } from '../editor-engine.js';
import {
    applyEditorSectionMarkdown,
    captureEditorSectionMarkdown
} from '../../index.js';

/** Modal-related helpers (magic overlay used to draft lesson content via AI). */
export const modalsMixin = {
    _openLessonMagicOverlay() {
        if (!this._isLessonConstructEdit()) return;
        const overlay = this.querySelector('#lesson-magic-overlay');
        const inp = this.querySelector('#inp-lesson-magic-prompt');
        if (!overlay || !inp || this._lessonMagicGenerating) return;
        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
        inp.focus();
    },

    _closeLessonMagicOverlay() {
        const overlay = this.querySelector('#lesson-magic-overlay');
        const inp = this.querySelector('#inp-lesson-magic-prompt');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.setAttribute('aria-hidden', 'true');
        }
        if (inp) inp.value = '';
    },

    async _runLessonMagicDraft(topic) {
        const ui = store.ui;
        const editorEl = this._getEditorEl?.();
        if (!editorEl || this._lessonMagicGenerating) return;
        this._closeLessonMagicOverlay();
        this._pushLessonHistory(editorEl);
        const currentMd = captureEditorSectionMarkdown(editorEl).trim();
        const originalMd = captureEditorSectionMarkdown(editorEl);
        replaceEditorHtml(
            editorEl,
            `<div class="p-4 text-center animate-pulse text-purple-500">✨ ${ui.sageThinking}</div>`
        );
        this._lessonMagicGenerating = true;
        try {
            const promptText =
                currentMd.length > 0
                    ? `You revise an existing lesson written in Markdown. Keep the same general structure and tone unless the user asks otherwise.\n\nCurrent lesson (Markdown):\n---\n${currentMd}\n---\n\nUser request (apply thoroughly): "${topic}"\n\nReturn the full updated lesson body in Markdown only (no preamble). Use headings (# ## ###), lists, and short paragraphs as appropriate.`
                    : `Create a comprehensive educational lesson in Markdown about: "${topic}". Include Title, Intro, Subheadings, List, and Summary.`;
            const response = await aiService.chat([{ role: 'user', content: promptText }]);
            const rawMarkdown = response.text
                .replace(/^```markdown\n/, '')
                .replace(/^```\n/, '')
                .replace(/\n```$/, '');
            applyEditorSectionMarkdown(editorEl, rawMarkdown);
            const titleMatch = rawMarkdown.match(/^# (.*$)/m);
            if (titleMatch) {
                const title = titleMatch[1].trim();
                const { name } = this._resolveLessonHeaderMeta();
                if (!name && title) {
                    this._patchPanelField?.({
                        headerMetaDraft: {
                            nodeId: this.currentNode?.id,
                            title
                        }
                    });
                }
            }
            if (this._lessonSaveState !== 'saving') {
                this._markLessonUserEdited();
            }
        } catch (e) {
            store.notify(ui.editorAiDraftError.replace('{message}', e.message), true);
            applyEditorSectionMarkdown(editorEl, originalMd);
        } finally {
            this._lessonMagicGenerating = false;
        }
    }
};
