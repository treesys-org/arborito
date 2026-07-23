import { getArboritoStore as store } from '../../../../core/store-singleton.js';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { parseArboritoFile, reconstructArboritoFile } from '../editor-engine.js';
import { persistNodeMetaProperties } from '../../../tree-graph/api/node-meta-persist.js';
import { clearLessonDraft } from '../logic/lesson-draft-persist.js';
import { getToc } from '../../../learning/api/content-toc.js';
import { extractSectionProseMarkdown } from '../../../learning/api/lesson-section-slices.js';
import { captureLiveConstructBodyFromCtx } from '../../../learning/api/live-lesson-body.js';
import { applyEditorSectionMarkdown } from '../logic/lesson-editor-dom.js';
import { bindMediaBlockControls } from '../logic/editor-media-block.js';
import { bindGameBlockControls } from '../logic/editor-game-block.js';
import { bindTableBlockControls } from '../logic/editor-table.js';
import { scheduleSearchIndexAfterConstructionMutation } from '../../../search/api/search-index-service.js';
import { clearSyncLessonDraftBody } from '../logic/lesson-sync-draft-body.js';
import { formatConstructEditorSeed } from '../logic/lesson-construct-seed.js';
import {
    isLessonBodyDomDirty,
    resolveEditorSectionIndex,
} from '../logic/lesson-construct-capture.js';
import { listIncompleteQuizBlocksInBody } from '../../../learning/api/quiz-status.js';

/** Persistence calls into `fileSystem` / `store` for lesson construct edits. */
export const persistenceMixin = {
    _captureLiveBodyMarkdown() {
        return captureLiveConstructBodyFromCtx({
            getEditorEl: () => this._getEditorEl?.(),
            flushForce: () => this._flushConstructSectionToBody?.({ force: true }),
            getLessonBodyForToc: () => this._getLessonBodyForToc?.() || '',
            lessonBodyMarkdown: this._lessonBodyMarkdown,
        });
    },

    async _saveLessonHeaderIcon(icon) {
        if (!this._isLessonConstructEdit() || !this.currentNode || this._headerMetaSaving) return;
        if (this._lessonSaveState === 'saving') return;
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

        const bodyMd = this._captureLiveBodyMarkdown();
        /* Same rule as shell save / TOC: never persist or clear dirty without a successful flush. */
        if (bodyMd == null) return;

        this._cancelDraftAutosave?.();
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
            const savedContent = reconstructArboritoFile(
                { ...parsed.meta, title: name, icon, description },
                bodyMd
            );
            const freshNode = store.findNode(node.id);
            if (freshNode) freshNode.content = savedContent;
            node.content = savedContent;
            this._lessonBodyMarkdown = null;
            this._headerMetaDraft = null;
            this._lessonUserHasEdited = false;
            clearSyncLessonDraftBody(node.id);
            this._patchPanelField?.({
                headerMetaDraft: null,
                lessonBodyMarkdown: null,
                lessonConstructDraft: false,
                lessonUserHasEdited: false,
                lessonLocalDraftState: 'none',
                currentNode: freshNode
                    ? { ...freshNode, content: savedContent }
                    : { ...node, content: savedContent }
            });
            const ed = this._getEditorEl?.();
            if (ed) {
                try {
                    delete ed.dataset.arboritoEditorDirty;
                } catch {
                    /* ignore */
                }
            }
            const sourceId = store.value.activeSource?.id;
            if (sourceId) {
                clearLessonDraft(
                    sourceId,
                    node.id,
                    store.getCurrentContentLangKey?.() ||
                        store.value.curriculumEditLang ||
                        store.value.lang
                );
            }
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
        if (this._headerMetaSaving || this._lessonSaveState === 'saving') return;

        const ui = store.ui;
        const node = store.findNode(this.currentNode.id) || this.currentNode;
        /* Single capture path — never re-implement DOM merge here. */
        const flushed = isLessonBodyDomDirty(editorEl)
            ? this._flushConstructSectionToBody?.({ force: true })
            : null;
        if (
            flushed?.ok === false ||
            flushed?.aborted ||
            (isLessonBodyDomDirty(editorEl) && (flushed == null || flushed.ok === false))
        ) {
            /* Pin mismatch — refuse to save a body that omitted the dirty DOM. */
            store.notify(
                ui.lessonSaveFlushBlocked ||
                    'Could not save: the editor did not sync this section. Tap the text again and retry.',
                true
            );
            return;
        }
        const bodyMd = flushed?.bodyMarkdown ?? this._getLessonBodyForToc?.() ?? '';
        const incompleteQuizzes = listIncompleteQuizBlocksInBody(bodyMd);
        if (incompleteQuizzes.length) {
            const first = incompleteQuizzes[0];
            const lang = String(store.value.lang || 'ES').toUpperCase() === 'EN' ? 'en' : 'es';
            const detail =
                first.hints?.map((h) => h[lang] || h.es || h.en).filter(Boolean).join('; ') ||
                first.concept ||
                '';
            const base =
                ui.lessonSaveQuizIncomplete ||
                "Can't save yet: finish every questionnaire (or remove it). Each one needs a playable question for learners.";
            const withDetail = detail
                ? (
                      ui.lessonSaveQuizIncompleteDetail ||
                      'Questionnaire issue: {detail}'
                  ).replace('{detail}', detail)
                : '';
            store.notify(withDetail ? `${base}\n${withDetail}` : base, true);
            return;
        }
        const sectionIdx =
            Number.isInteger(flushed?.flushIdx) && flushed.flushIdx >= 0
                ? flushed.flushIdx
                : resolveEditorSectionIndex(editorEl, {
                      activeSectionIndex: this.activeSectionIndex,
                  });
        const capturedSectionMd =
            flushed?.sectionMd != null
                ? flushed.sectionMd
                : extractSectionProseMarkdown(bodyMd, sectionIdx);
        const sectionId = getToc({ content: bodyMd })[sectionIdx]?.id || '';

        const parsed = parseArboritoFile(node.content || '');
        let metaForSave = { ...parsed.meta };
        if (this._headerMetaDraft?.nodeId === node.id) {
            if (this._headerMetaDraft.title != null) metaForSave.title = this._headerMetaDraft.title;
            if (this._headerMetaDraft.description != null) {
                metaForSave.description = this._headerMetaDraft.description;
            }
        }

        const { name, description } = this._resolveLessonHeaderMeta();
        const icon = metaForSave.icon || parsed.meta.icon || node.icon || '📄';

        if (!name) {
            store.notify(ui.lessonNameRequired || ui.graphPromptLessonName || 'Lesson name is required.', true);
            return;
        }

        this._cancelDraftAutosave?.();
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
            editorEl.dataset.arboritoEditorSeed = formatConstructEditorSeed(sectionIdx, sectionId);
            editorEl.dataset.arboritoEditorProse = capturedSectionMd;
            delete editorEl.dataset.arboritoEditorDirty;
            Array.from(editorEl.getElementsByClassName('arborito-media-edit')).forEach((block) => {
                bindMediaBlockControls(block);
            });
            Array.from(editorEl.getElementsByClassName('arborito-game-edit')).forEach((block) => {
                bindGameBlockControls(block);
            });
            Array.from(editorEl.getElementsByClassName('arborito-table-edit')).forEach((block) => {
                bindTableBlockControls(block);
            });

            this._lessonBodyMarkdown = null;
            this._headerMetaDraft = null;
            this._lessonUserHasEdited = false;
            clearSyncLessonDraftBody(node.id);
            this._invalidateLessonParseCache?.();
            this._patchPanelField?.({
                lessonBodyMarkdown: null,
                headerMetaDraft: null,
                lessonUserHasEdited: false,
                lessonLocalDraftState: 'none',
                lessonConstructDraft: false,
                lessonHistoryStack: [],
                lessonHistoryRedoStack: [],
                currentNode: panelNode
            });
            this.scheduleUpdate?.(true);
            this._syncLessonSaveState('saved');
            const sourceId = store.value.activeSource?.id;
            if (sourceId) {
                clearLessonDraft(
                    sourceId,
                    node.id,
                    store.getCurrentContentLangKey?.() ||
                        store.value.curriculumEditLang ||
                        store.value.lang
                );
            }
            try {
                scheduleSearchIndexAfterConstructionMutation(store);
            } catch {
                /* ignore */
            }
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
