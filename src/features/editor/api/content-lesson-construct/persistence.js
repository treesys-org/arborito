import { getArboritoStore as store } from '../../../../core/store-singleton.js';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { parseArboritoFile } from '../editor-engine.js';
import { persistNodeMetaProperties } from '../../../tree-graph/api/node-meta-persist.js';
import { clearLessonDraft } from '../logic/lesson-draft-persist.js';

/** Persistence calls into `fileSystem` / `store` for lesson construct edits. */
export const persistenceMixin = {
    async _saveLessonHeaderIcon(icon) {
        if (!this._isLessonConstructEdit() || !this.currentNode || this._headerMetaSaving) return;
        const node = store.findNode(this.currentNode.id) || this.currentNode;
        const parsed = parseArboritoFile(node.content || '');
        const baselineIcon = parsed.meta.icon || node.icon || '📄';
        if (icon === baselineIcon) return;

        const { name, description } = this._resolveLessonHeaderMeta();
        if (!name) {
            const ui = store.ui;
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
            this._patchPanelField?.({ headerMetaDraft: null });
        } catch (e) {
            store.alert(
                (ui.nodePropertiesSaveError || 'Error saving properties: {message}').replace('{message}', e.message)
            );
        } finally {
            this._headerMetaSaving = false;
        }
    },

    async _saveLessonShell() {
        const editorEl = this._getEditorEl?.();
        if (!editorEl || !this.currentNode) return;

        const node = store.findNode(this.currentNode.id) || this.currentNode;
        this._flushConstructSectionToBody();
        const parsed = parseArboritoFile(node.content || '');
        const bodyMd = this._getLessonBodyForToc();
        let metaForSave = { ...parsed.meta };
        if (this._headerMetaDraft?.nodeId === node.id && this._headerMetaDraft.challenge) {
            metaForSave = { ...metaForSave, challenge: this._headerMetaDraft.challenge };
        }

        const { name, description } = this._resolveLessonHeaderMeta();
        const icon = metaForSave.icon || parsed.meta.icon || node.icon || '📄';

        const ui = store.ui;
        if (!name) {
            store.notify(ui.lessonNameRequired || ui.graphPromptLessonName || 'Lesson name is required.', true);
            return;
        }

        this._syncLessonSaveState('saving');
        this._headerMetaSaving = true;
        try {
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
            this._lessonBodyMarkdown = null;
            this._headerMetaDraft = null;
            this._lessonUserHasEdited = false;
            this._patchPanelField?.({
                lessonBodyMarkdown: null,
                headerMetaDraft: null,
                lessonUserHasEdited: false,
                lessonLocalDraftState: 'none'
            });
            this._syncLessonSaveState('saved');
            const sourceId = store.value.activeSource?.id;
            if (sourceId) clearLessonDraft(sourceId, node.id);
        } catch (e) {
            this._syncLessonSaveState('idle');
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
