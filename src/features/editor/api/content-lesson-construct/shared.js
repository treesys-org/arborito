import { parseArboritoFile } from '../editor-engine.js';

/** Small utilities shared across lesson-construct partials. */
export const sharedMixin = {
    _resolveLessonHeaderMeta() {
        const node = this.currentNode;
        if (!node) return { name: '', description: '' };
        const parsed = parseArboritoFile(node.content || '');
        const draft = this._headerMetaDraft?.nodeId === node.id ? this._headerMetaDraft : null;
        let name = parsed.meta.title || node.name || '';
        let description = String(
            parsed.meta.description != null ? parsed.meta.description : node.description != null ? node.description : ''
        );
        if (draft?.title != null) name = draft.title;
        if (draft?.description != null) description = draft.description;
        return { name: String(name).trim(), description: String(description).trim() };
    },

    _syncLessonSaveState(state) {
        this._lessonSaveState = state;
        const patch = { lessonSaveState: state };
        if (state === 'saved') patch.lessonLocalDraftState = 'none';
        this._patchPanelField?.(patch);
        this.scheduleUpdate?.(true);
    },

    _setLessonSaveButtonSavedVisual(_btn, saved) {
        this._syncLessonSaveState(saved ? 'saved' : 'idle');
    }
};
