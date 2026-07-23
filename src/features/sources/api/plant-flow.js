/**
 * Plant a new branch and mount curriculum, used after CC license acceptance and from the sources modal.
 */

import { mountCurriculum } from './mount-curriculum.js';
import { finishSourcesLoadSession, captureHadCurriculumBeforeLoad } from './sources-session.js';

/**
 * After planting: if signed in, ask whether to sync an encrypted draft to the account
 * (same pattern as import). Guests get a short hint only.
 * @param {import('../../../core/store.js').Store} store
 * @param {{ id?: string, name?: string }} newTree
 */
async function offerPlantBranchAccountSync(store, newTree) {
    const ui = store.ui;
    const signedIn = !!(store.isSignedIn && store.isSignedIn());
    if (!signedIn) return;

    const name = String(newTree?.name || '').trim() || ui.plantBranchShort || 'Branch';
    const body = String(
        ui.plantBranchDoneBody || '“{name}” is ready on this device. Sync an encrypted draft to your account?'
    ).replace(/\{name\}/g, name);

    const result = await store.acknowledge({
        title: ui.plantBranchDoneTitle || 'Branch planted',
        body,
        dialogIcon: '🌱',
        confirmText: ui.plantBranchDoneOk || ui.importTreeDoneOk || ui.dialogConfirmTitle || 'OK',
        switchLabel:
            ui.plantBranchSyncCheckbox ||
            ui.importBranchSyncCheckbox ||
            'Sync encrypted copy to my account (other devices)',
        switchDefault: true,
    });

    let sync = false;
    if (result === true) sync = true;
    else if (result && typeof result === 'object' && result.confirmed) {
        sync = !!result.checked;
    }
    if (!sync) return;

    try {
        if (typeof store.publishBranchAsPrivate === 'function' && newTree?.id) {
            await store.publishBranchAsPrivate(newTree.id);
        } else if (typeof store.publishActiveBranchAsPrivate === 'function') {
            await store.publishActiveBranchAsPrivate();
        }
    } catch (err) {
        store.notify(
            (ui.plantBranchSyncFailed || ui.importTreeSyncFailed || 'Branch created, but account sync failed: {message}').replace(
                '{message}',
                err && err.message ? err.message : String(err)
            ),
            true
        );
    }
}

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
        await new Promise((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    finishSourcesLoadSession(modal, { hadCurriculumBeforeLoad });
                    resolve();
                });
            });
        });
    } else {
        store.goHome();
        finish();
    }

    try {
        await offerPlantBranchAccountSync(store, newTree);
    } catch (e) {
        console.warn('[Arborito] plant branch sync offer failed', e);
    }
}
