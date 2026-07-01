import { getArboritoStore } from '../core/store-singleton.js';
import {
    undoConstructionEditAction,
    redoConstructionEditAction,
    getConstructionHistoryTimelineAction,
} from './editor-construction-undo-store-actions.js';
import {
    openConstructionCurriculumLangModalAction,
    addCurriculumLanguageInteractiveAction,
    setCurriculumEditLangAction,
    canOfferCurriculumLanguageAddAction,
    validatePublicationMetadataAction,
} from './tree-graph-curriculum-store-actions.js';
import { openEditorAction } from './navigation-store-actions.js';
import { canRetractActivePublicUniverseAction } from './sources-resolve-store-actions.js';
import { shellUiActions } from './shell-ui-store-actions.js';
import { nostrDomainActions } from './nostr-store-actions.js';

function shell() {
    return getArboritoStore();
}

export function subscribeConstructionUndoAction(fn) {
    const store = shell();
    if (!store) return () => {};
    store.addEventListener('construction-undo-changed', fn);
    return () => store.removeEventListener('construction-undo-changed', fn);
}

export function finishConstructionEditPickAction(result) {
    const store = shell();
    if (!store) return;
    const resolve = store._constructionEditPickResolve;
    store._constructionEditPickResolve = null;
    if (typeof resolve === 'function') resolve(result);
}

/** Editor / construction actions for hooks. */
export const editorActions = {
    openEditor: openEditorAction,
    undoConstructionEdit: undoConstructionEditAction,
    redoConstructionEdit: redoConstructionEditAction,
    getConstructionHistoryTimeline: getConstructionHistoryTimelineAction,
    openConstructionCurriculumLangModal: openConstructionCurriculumLangModalAction,
    addCurriculumLanguageInteractive: addCurriculumLanguageInteractiveAction,
    setCurriculumEditLang: setCurriculumEditLangAction,
    canOfferCurriculumLanguageAdd: canOfferCurriculumLanguageAddAction,
    canRetractActivePublicUniverse: canRetractActivePublicUniverseAction,
    validatePublicationMetadata: validatePublicationMetadataAction,
    openSageModal: shellUiActions.openSageModal,
    getNostrPublisherPair: nostrDomainActions.getNostrPublisherPair,
    getMyTreeNetworkRole: nostrDomainActions.getMyTreeNetworkRole,
    subscribeConstructionUndo: subscribeConstructionUndoAction,
    finishConstructionEditPick: finishConstructionEditPickAction,
};
