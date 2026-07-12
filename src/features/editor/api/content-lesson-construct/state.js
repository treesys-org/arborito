import { getArboritoStore as store } from '../../../../core/store-singleton.js';
import { fileSystem } from '../../../backup-export/api/filesystem.js';

/** Local state predicates and save-button helpers for lesson construct. */
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

    _markLessonUserEdited() {
        if (!this._isLessonConstructEdit()) return;
        this._lessonUserHasEdited = true;
        this._patchPanelField?.({ lessonUserHasEdited: true, lessonLocalDraftState: 'pending' });
        this._refreshLessonSaveButton();
    },

    _refreshLessonSaveButton() {
        if (!this._isLessonConstructEdit()) return;
        if (this._lessonSaveState === 'saving') return;
        const isDirty = this._isLessonDirty();
        this._syncLessonSaveState(isDirty ? 'idle' : 'saved');
    },

    _isLessonDirty() {
        if (!this.currentNode || !this._isLessonConstructEdit()) return false;
        return !!this._lessonUserHasEdited;
    }
};
