import { store } from '../../../core/store.js';
import { fileSystem } from '../../backup-export/filesystem.js';
import { parseArboritoFile } from '../editor-engine.js';
import { persistNodeMetaProperties } from '../../tree-graph/node-meta-persist.js';

/** Persistence calls into `fileSystem` / `store` for lesson construct edits. */
export const persistenceMixin = {
    async _saveLessonHeaderMeta() {
        if (!this._isLessonConstructEdit() || !this.currentNode || this._headerMetaSaving) return;
        const titleInp = this.querySelector('#inp-lesson-header-title');
        const descInp = this.querySelector('#inp-lesson-header-desc');
        if (!titleInp || !descInp) return;

        const node = store.findNode(this.currentNode.id) || this.currentNode;
        const parsed = parseArboritoFile(node.content || '');
        const name = titleInp.value.trim();
        const description = descInp.value.trim();

        if (!name) {
            const ui = store.ui;
            titleInp.classList.add('arborito-input-required-empty');
            setTimeout(() => titleInp.classList.remove('arborito-input-required-empty'), 3000);
            store.notify(ui.lessonNameRequired || ui.graphPromptLessonName || 'Lesson name is required.', true);
            return;
        }

        const baselineName = (parsed.meta.title || node.name || '').trim();
        const baselineDesc = String((parsed.meta.description != null ? parsed.meta.description : (node.description != null ? node.description : ''))).trim();
        if (name === baselineName && description === baselineDesc) return;

        const bodyMd =
            this._lessonDraftLessonId === node.id && this._lessonBodyMarkdown !== null
                ? this._lessonBodyMarkdown
                : parsed.body;

        const icon = parsed.meta.icon || node.icon || '📄';
        this._headerMetaSaving = true;
        const ui = store.ui;
        const saveBtn = this.querySelector('#btn-lesson-save');
        try {
            await persistNodeMetaProperties(
                { fileSystem, store },
                {
                    node,
                    name,
                    icon,
                    description,
                    originalMeta: parsed.meta,
                    originalBody: bodyMd,
                    skipReload: true
                }
            );
            this._headerMetaDraft = null;
            if (saveBtn) this._setLessonSaveButtonSavedVisual(saveBtn, true);
        } catch (e) {
            store.alert(
                (ui.nodePropertiesSaveError || 'Error saving properties: {message}').replace('{message}', e.message)
            );
        } finally {
            this._headerMetaSaving = false;
        }
    },

    async _saveLessonHeaderIcon(icon) {
        if (!this._isLessonConstructEdit() || !this.currentNode || this._headerMetaSaving) return;
        const node = store.findNode(this.currentNode.id) || this.currentNode;
        const parsed = parseArboritoFile(node.content || '');
        const baselineIcon = parsed.meta.icon || node.icon || '📄';
        if (icon === baselineIcon) return;

        const titleInp = this.querySelector('#inp-lesson-header-title');
        const descInp = this.querySelector('#inp-lesson-header-desc');
        if (!titleInp || !descInp) return;
        const name = titleInp.value.trim();
        const description = descInp.value.trim();
        if (!name) {
            const ui = store.ui;
            titleInp.value = node.name;
            store.notify(ui.graphPromptLessonName || 'Lesson name:', true);
            return;
        }

        const bodyMd =
            this._lessonDraftLessonId === node.id && this._lessonBodyMarkdown !== null
                ? this._lessonBodyMarkdown
                : parsed.body;

        this._headerMetaSaving = true;
        const ui = store.ui;
        try {
            await persistNodeMetaProperties(
                { fileSystem, store },
                {
                    node,
                    name,
                    icon,
                    description,
                    originalMeta: parsed.meta,
                    originalBody: bodyMd,
                    skipReload: true
                }
            );
            this._headerMetaDraft = null;
        } catch (e) {
            store.alert(
                (ui.nodePropertiesSaveError || 'Error saving properties: {message}').replace('{message}', e.message)
            );
        } finally {
            this._headerMetaSaving = false;
        }
    },

    async _saveLessonShell() {
        const editorEl = this.querySelector('#lesson-visual-editor');
        const titleInp = this.querySelector('#inp-lesson-header-title');
        const descInp = this.querySelector('#inp-lesson-header-desc');
        if (!editorEl || !this.currentNode) return;

        const node = store.findNode(this.currentNode.id) || this.currentNode;
        this._flushConstructSectionToBody();
        const parsed = parseArboritoFile(node.content || '');
        const bodyMd = this._getLessonBodyForToc();
        const metaForSave = parsed.meta;

        const name = titleInp ? titleInp.value.trim() : (parsed.meta.title || node.name);
        const description = descInp ? descInp.value.trim() : ((parsed.meta.description != null ? parsed.meta.description : (node.description != null ? node.description : '')));
        const icon = metaForSave.icon || parsed.meta.icon || node.icon || '📄';

        const ui = store.ui;
        if (!name) {
            if (titleInp) {
                titleInp.focus();
                titleInp.classList.add('arborito-input-required-empty');
                setTimeout(() => titleInp.classList.remove('arborito-input-required-empty'), 3000);
            }
            store.notify(ui.lessonNameRequired || ui.graphPromptLessonName || 'Lesson name is required.', true);
            return;
        }

        const saveBtn = this.querySelector('#btn-lesson-save');
        const origLabel = saveBtn ? String(saveBtn.textContent || '').trim() : '';
        const labelRestore = origLabel || ui.editorLocalSave || 'Save';
        this._lessonSaveState = 'saving';
        this._headerMetaSaving = true;
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = '…';
            saveBtn.classList.remove('arborito-lesson-save-btn--saved');
            saveBtn.style.filter = '';
        }
        try {
            // Use the unified persist pipeline: this updates content (with new bodyMd),
            // renames the file when the name changed, and reloads tree data so the
            // graph reflects the new lesson name immediately.
            await persistNodeMetaProperties(
                { fileSystem, store },
                {
                    node,
                    name,
                    icon,
                    description,
                    originalMeta: metaForSave,
                    originalBody: bodyMd,
                    skipReload: true
                }
            );
            this._lessonSaveState = 'saved';
            this._lessonBodyMarkdown = null;
            this._headerMetaDraft = null;
            if (saveBtn) {
                saveBtn.textContent = labelRestore;
                this._setLessonSaveButtonSavedVisual(saveBtn, true);
            }
        } catch (e) {
            this._lessonSaveState = 'idle';
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = labelRestore;
                this._setLessonSaveButtonSavedVisual(saveBtn, false);
            }
            store.notify(
                (ui.nodePropertiesSaveError || 'Error saving properties: {message}').replace(
                    '{message}',
                    e.message
                ),
                true
            );
        } finally {
            this._headerMetaSaving = false;
        }
    }
};
