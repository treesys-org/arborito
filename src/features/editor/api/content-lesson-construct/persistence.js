import { getArboritoStore as store } from '../../../../core/store-singleton.js';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { parseArboritoFile, reconstructArboritoFile } from '../editor-engine.js';
import { persistNodeMetaProperties } from '../../../tree-graph/api/node-meta-persist.js';
import { clearLessonDraft } from '../logic/lesson-draft-persist.js';
import {
    replaceTocSectionMarkdown,
    sanitiseConstructSectionMarkdown
} from '../../../learning/api/lesson-section-slices.js';
import { applyEditorSectionMarkdown, captureEditorSectionMarkdown } from '../logic/lesson-editor-dom.js';
import { bindMediaBlockControls } from '../logic/editor-media-block.js';
import { bindGameBlockControls } from '../logic/editor-game-block.js';

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
        try {
            editorEl.dataset.arboritoEditorDirty = '1';
        } catch {
            /* ignore */
        }
        this._flushConstructSectionToBody();
        const parsed = parseArboritoFile(node.content || '');
        const sectionIdx = Number.isInteger(this._constructEditorBoundSection)
            ? this._constructEditorBoundSection
            : Number.isInteger(this.activeSectionIndex)
              ? this.activeSectionIndex
              : 0;
        /* Read DOM synchronously — patchPanel from flush is async; getLessonBodyForToc would miss new media URLs. */
        const capturedSectionMd = sanitiseConstructSectionMarkdown(captureEditorSectionMarkdown(editorEl));
        const bodyMd = replaceTocSectionMarkdown(this._getLessonBodyForToc(), sectionIdx, capturedSectionMd);
        let metaForSave = { ...parsed.meta };
        if (this._headerMetaDraft?.nodeId === node.id) {
            if (this._headerMetaDraft.title != null) metaForSave.title = this._headerMetaDraft.title;
            if (this._headerMetaDraft.description != null) {
                metaForSave.description = this._headerMetaDraft.description;
            }
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
        const savedContent = reconstructArboritoFile(metaForSave, bodyMd);
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

            const freshNode = store.findNode(node.id);
            if (freshNode) freshNode.content = savedContent;
            node.content = savedContent;
            const panelNode = freshNode ? { ...freshNode, content: savedContent } : { ...node, content: savedContent };

            applyEditorSectionMarkdown(editorEl, capturedSectionMd);
            editorEl.dataset.arboritoEditorSeed = `${sectionIdx}\u0001${capturedSectionMd}`;
            delete editorEl.dataset.arboritoEditorDirty;
            Array.from(editorEl.getElementsByClassName('arborito-media-edit')).forEach((block) => {
                bindMediaBlockControls(block);
            });
            Array.from(editorEl.getElementsByClassName('arborito-game-edit')).forEach((block) => {
                bindGameBlockControls(block);
            });

            this._lessonBodyMarkdown = null;
            this._headerMetaDraft = null;
            this._lessonUserHasEdited = false;
            this._invalidateLessonParseCache?.();
            this._patchPanelField?.({
                lessonBodyMarkdown: null,
                headerMetaDraft: null,
                lessonUserHasEdited: false,
                lessonLocalDraftState: 'none',
                lessonConstructDraft: false,
                currentNode: panelNode
            });
            this.scheduleUpdate?.(true);
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
