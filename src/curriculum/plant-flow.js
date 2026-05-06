/**
 * Plant local garden and mount curriculum — used after CC license acceptance and from the sources modal.
 */

import { mountCurriculum } from './mount-curriculum.js';

/**
 * @param {import('../store.js').Store} store
 * @param {{ updateContent?: Function, close?: Function, overlay?: unknown, targetId?: unknown, _overlayPlantNameDraft?: string }} [modal]
 * @param {string} name
 */
export async function runPlantNewTree(store, name, modal) {
    const trimmed = String(name != null ? name : '').trim();
    if (!trimmed) {
        store.notify(store.ui.treeNameRequired || 'Please enter a tree name.', true);
        return;
    }
    if (!store.hasAcceptedAuthorLicense()) {
        store.acceptAuthorLicense();
    }

    let newTree;
    try {
        newTree = store.userStore.plantTree(trimmed);
    } catch (e) {
        console.error('runPlantNewTree plantTree', e);
        store.notify(String((e && e.message) || e), true);
        return;
    }

    const source = {
        id: newTree.id,
        name: newTree.name || trimmed,
        url: `local://${newTree.id}`,
        type: 'local',
        isTrusted: true
    };

    // Construction mode before mount: same state as DataProcessor and mobile dock (`html.arborito-construction-mobile`).
    store.update({ constructionMode: true });

    const mounted = await mountCurriculum(store, source, true);
    if (!mounted) {
        store.update({ constructionMode: false });
        const reason = (store.state.error && String(store.state.error).trim()) || '';
        const ui = store.ui;
        const msg = reason
            ? (ui.plantTreeOpenFailedReason || 'Could not open your new tree: {reason}').replace('{reason}', reason)
            : (ui.plantTreeOpenFailed || 'Could not open your new tree.');
        store.notify(msg, true);
        return;
    }

    /* `goHome()` sets modal:null and clears `<arborito-modals>` before updateContent. */
    store.goHome();
    queueMicrotask(() => store.dispatchEvent(new CustomEvent('graph-update')));

    if (modal && typeof modal.updateContent === 'function') {
        modal.overlay = null;
        modal.targetId = null;
        modal._overlayPlantNameDraft = '';
        modal.updateContent();
    }
    if (modal && typeof modal.close === 'function') {
        modal.close({ returnToMore: false });
    }
}
