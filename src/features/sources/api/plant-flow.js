/**
 * Plant a new branch and mount curriculum, used after CC license acceptance and from the sources modal.
 */

import { mountCurriculum } from './mount-curriculum.js';
import { finishSourcesLoadSession } from './sources-session.js';
import { requestConstructionTourOnce } from '../../tour/api/product-tour-start-bridge.js';
import { isAutoSyncLocalBranchesEnabled } from '../../identity-auth/api/register-sync-local.js';

/**
 * After planting: if auto-sync is on, upload quietly with no done dialog.
 * Otherwise ask with the sync switch (signed-in only).
 * @param {import('../../../core/store.js').Store} store
 * @param {{ id?: string, name?: string }} newTree
 */
async function offerPlantBranchAccountSync(store, newTree) {
    const ui = store.ui;
    const signedIn = !!(store.isSignedIn && store.isSignedIn());
    if (!signedIn) return;

    const name = String(newTree?.name || '').trim() || ui.plantBranchShort || 'Branch';
    const body = String(
        ui.plantBranchDoneBody || '“{name}” is ready on this device.'
    ).replace(/\{name\}/g, name);
    const autoSync = isAutoSyncLocalBranchesEnabled(store.userStore);

    const quietPublish = async (silent) => {
        try {
            if (typeof store.publishBranchAsPrivate === 'function' && newTree?.id) {
                await store.publishBranchAsPrivate(newTree.id, silent ? { silent: true } : {});
            } else if (typeof store.publishActiveBranchAsPrivate === 'function') {
                await store.publishActiveBranchAsPrivate();
            }
        } catch (err) {
            store.notify(
                (ui.plantBranchSyncFailed ||
                    ui.importTreeSyncFailed ||
                    'Branch created, but account sync failed: {message}').replace(
                    '{message}',
                    err && err.message ? err.message : String(err)
                ),
                true
            );
        }
    };

    if (autoSync) {
        void quietPublish(true);
        return;
    }

    const result = await store.acknowledge({
        title: ui.plantBranchDoneTitle || 'Branch planted',
        body,
        dialogIcon: '🌱',
        confirmText: ui.plantBranchDoneOk || ui.importTreeDoneOk || ui.dialogConfirmTitle || 'OK',
        switchLabel:
            ui.plantBranchSyncCheckbox ||
            ui.importBranchSyncCheckbox ||
            'Sync to my account',
        switchDefault: true,
    });

    let sync = false;
    if (result === true) sync = true;
    else if (result && typeof result === 'object' && result.confirmed) {
        sync = !!result.checked;
    }
    if (!sync) return;
    await quietPublish(false);
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

    /* Hydrate first; enter construction only after the new branch mounts.
     * Setting constructionMode before mount used to trigger “load while editing?”. */
    store.update({ treeHydrating: true });

    let newTree;
    try {
        newTree = store.userStore.plantBranch(trimmed, skeleton);
    } catch (e) {
        console.error('runPlantNewTree plantBranch', e);
        store.update({ treeHydrating: false });
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

    const mounted = await mountCurriculum(store, source, true, {
        skipConstructionLoadConfirm: true,
    });
    if (!mounted) {
        store.update({ treeHydrating: false });
        const reason = (store.state.error && String(store.state.error).trim()) || '';
        const ui = store.ui;
        const msg = reason
            ? (ui.plantBranchOpenFailedReason || 'Could not open your new branch: {reason}').replace('{reason}', reason)
            : (ui.plantBranchOpenFailed || 'Could not open your new branch.');
        store.notify(msg, true);
        return;
    }
    if (!store.state.constructionMode) {
        store.update({ constructionMode: true });
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
                    /* Always close Forest after planting — keep-open is only for open/switch. */
                    finishSourcesLoadSession(modal, { hadCurriculumBeforeLoad: false });
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

    /* Plant sets constructionMode directly (not toggleConstructionMode) — fire tour after
     * the sync dialog so acknowledge/modals do not swallow the one-time start. */
    if (store.state.constructionMode) {
        requestConstructionTourOnce({ source: 'plant-branch' });
    }
}
