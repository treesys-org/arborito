import { store } from '../../../core/store.js';

/**
 * Action handlers wired by the lesson construct UI: rename (title input),
 * set icon (emoji picker), and set description (description input).
 */
export const nodeActionsMixin = {
    _bindLessonHeaderMeta() {
        const titleInp = this.querySelector('#inp-lesson-header-title');
        const descInp = this.querySelector('#inp-lesson-header-desc');
        const emojiBtn = this.querySelector('#btn-lesson-node-meta');
        const picker = this.querySelector('#lesson-header-emoji-picker');
        if (!titleInp || !descInp || !this._isLessonConstructEdit()) return;

        const syncDraft = () => {
            const n = store.findNode(this.currentNode.id) || this.currentNode;
            this._headerMetaDraft = {
                nodeId: n.id,
                title: titleInp.value,
                description: descInp.value
            };
            this._refreshLessonSaveButton();
        };

        titleInp.addEventListener('input', syncDraft);
        descInp.addEventListener('input', syncDraft);

        // Main editor "Save" persists name, description, and content together
        // (see `_saveLessonShell`). We no longer autosave on focusout to avoid races
        // with Save and to give a clear moment of persistence.

        if (emojiBtn && picker) {
            let docListener = null;
            const closePicker = () => {
                picker.classList.add('hidden');
                emojiBtn.setAttribute('aria-expanded', 'false');
                if (docListener) {
                    document.removeEventListener('click', docListener);
                    docListener = null;
                }
                this._lessonHeaderEmojiDocCleanup = null;
            };

            this._lessonHeaderEmojiDocCleanup = () => {
                if (docListener) {
                    document.removeEventListener('click', docListener);
                    docListener = null;
                }
                if ((picker && picker.classList)) {
                    picker.classList.add('hidden');
                    emojiBtn.setAttribute('aria-expanded', 'false');
                }
            };

            emojiBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isHidden = picker.classList.contains('hidden');
                if (docListener) {
                    document.removeEventListener('click', docListener);
                    docListener = null;
                }
                if (isHidden) {
                    picker.classList.remove('hidden');
                    emojiBtn.setAttribute('aria-expanded', 'true');
                    docListener = () => {
                        closePicker();
                    };
                    setTimeout(() => document.addEventListener('click', docListener), 0);
                } else {
                    closePicker();
                }
            });

            this.querySelectorAll('.js-lesson-header-emoji-choice').forEach((b) => {
                b.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const icon = (b.textContent || '').trim();
                    closePicker();
                    void this._saveLessonHeaderIcon(icon);
                });
            });
        }
    }
};
