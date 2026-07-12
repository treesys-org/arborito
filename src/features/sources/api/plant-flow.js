/**
 * Plant a new branch and mount curriculum, used after CC license acceptance and from the sources modal.
 */

import { mountCurriculum } from './mount-curriculum.js';
import { finishSourcesLoadSession, captureHadCurriculumBeforeLoad } from './sources-session.js';

/**
 * @param {import('../../../core/store.js' ).Store} store
 * @param {{ updateContent?: Function, close?: Function, overlay?: unknown, targetId?: unknown }} [modal]
 * @param {string} name
 */
/**
 * @param {import('../../../core/store.js' ).Store} store
 * @param {string} name
 * @param {object} [modal]
 * @param {{ parentCount?: number, childrenPerParent?: number }} [skeleton]
 */
export async function runPlantNewTree(store, name, modal, skeleton = null) {
    const trimmed = String(name != null ? name : '').trim();
    if (!trimmed) {
        store.notify(store.ui.treeNameRequired || 'Please enter a tree name.', true);
        return;
    }
    if (!store.hasAcceptedAuthorLicense()) {
        store.acceptAuthorLicense();
    }

    const hadCurriculumBeforeLoad = captureHadCurriculumBeforeLoad();
    store.update({ treeHydrating: true, constructionMode: true });

    let newTree;
    try {
        newTree = store.userStore.plantBranch(trimmed, skeleton);
    } catch (e) {
        console.error('runPlantNewTree plantBranch', e);
        store.update({ constructionMode: false, treeHydrating: false });
        store.notify(String((e && e.message) || e), true);
        return;
    }

    const source = {
        id: newTree.id,
        name: newTree.name || trimmed,
        url: `branch://${newTree.id}`,
        type: 'branch',
        isTrusted: true
    };

    const mounted = await mountCurriculum(store, source, true);
    if (!mounted) {
        store.update({ constructionMode: false, treeHydrating: false });
        const reason = (store.state.error && String(store.state.error).trim()) || '';
        const ui = store.ui;
        const msg = reason
            ? (ui.plantBranchOpenFailedReason || 'Could not open your new branch: {reason}').replace('{reason}', reason)
            : (ui.plantBranchOpenFailed || 'Could not open your new branch.');
        store.notify(msg, true);
        return;
    }

    const finish = () => {
        requestAnimationFrame(() => {
            queueMicrotask(() => store.dispatchEvent(new CustomEvent('graph-update')));
        });
    };
    if (modal && typeof modal.close === 'function') {
        finish();
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                finishSourcesLoadSession(modal, { hadCurriculumBeforeLoad });
            });
        });
    } else {
        store.goHome();
        finish();
    }
}
