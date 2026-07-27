/**
 * Student-facing flow when a public Nostr universe has been retracted.
 * Keeps network delisting as source of truth; offers a local garden copy of
 * whatever is already on this device (cache / open tree), without prefetch.
 */

import { yieldToPaint } from '../../../shared/lib/yield-to-paint.js';

export class UniverseRevokedError extends Error {
    constructor(message) {
        super(message || 'This public tree was retracted by the publisher.');
        this.name = 'UniverseRevokedError';
        this.code = 'UNIVERSE_REVOKED';
    }
}

export function isUniverseRevokedError(err) {
    if (!err) return false;
    if (err.code === 'UNIVERSE_REVOKED' || err.name === 'UniverseRevokedError') return true;
    const msg = String(err.message || err || '');
    return /retracted by the publisher|retirado por quien lo publicó/i.test(msg);
}

/** @param {object|null|undefined} raw */
export function curriculumHasUnmaterializedLessons(raw) {
    if (!raw || typeof raw !== 'object' || !raw.languages) return false;
    let found = false;
    const walk = (node) => {
        if (!node || typeof node !== 'object' || found) return;
        if (node.type === 'leaf' || node.type === 'exam') {
            const empty = !String(node.content || '').trim();
            if (
                empty &&
                (node.treeLazyContent === true ||
                    (node.treeContentKey && !node.content) ||
                    !!node.contentPath)
            ) {
                found = true;
                return;
            }
        }
        if (Array.isArray(node.children)) {
            for (const ch of node.children) walk(ch);
        }
    };
    for (const lang of Object.keys(raw.languages)) {
        walk(raw.languages[lang]);
        if (found) break;
    }
    return found;
}

/**
 * @param {import('../../../core/store.js').Store} store
 * @param {{
 *   source?: object|null,
 *   treeJson?: object|null,
 *   keepViewingCached?: boolean,
 * }} [opts]
 * @returns {Promise<'keep-garden'|'uninstall'|'dismiss'|null>}
 */
export async function promptStudentUniverseRevoked(store, opts = {}) {
    if (!store) return null;
    const source = opts.source || null;
    const sourceKey = String(source?.id || source?.url || 'unknown');
    if (store._universeRevokedPromptKey === sourceKey) return null;
    store._universeRevokedPromptKey = sourceKey;

    const ui = store.ui || {};
    const treeJson =
        opts.treeJson ||
        (store.state.activeSource?.id &&
        source?.id &&
        String(store.state.activeSource.id) === String(source.id)
            ? store.state.rawGraphData
            : null) ||
        null;
    const hasCopy = !!(treeJson && typeof treeJson === 'object' && treeJson.languages);
    const incomplete = hasCopy && curriculumHasUnmaterializedLessons(treeJson);
    const keepViewing = opts.keepViewingCached === true && hasCopy;

    const title =
        ui.universeRevokedStudentTitle ||
        ui.nostrUniverseRevokedError ||
        'Course unpublished';
    let body =
        ui.universeRevokedStudentBody ||
        'The author removed this course from the public network. New opens from the link will not work.';
    if (keepViewing) {
        body =
            ui.universeRevokedStudentBodyCached ||
            'The author removed this course from the public network. You still have a cached copy on this device.';
    }
    if (hasCopy && incomplete) {
        body = `${body}\n\n${
            ui.universeRevokedStudentIncompleteNote ||
            'Some lessons may be missing if they were never opened here.'
        }`;
    } else if (!hasCopy) {
        body = `${body}\n\n${
            ui.universeRevokedStudentNoCacheNote ||
            'This device has no local copy of the lessons to keep.'
        }`;
    }

    /** @type {{ id: string, label: string }[]} */
    const choices = [];
    if (hasCopy) {
        choices.push({
            id: 'save',
            label:
                ui.universeRevokedKeepGardenLabel ||
                ui.forkNetworkTreeCreateButton ||
                'Save to My garden',
        });
    }
    const canUninstall =
        !!(source?.id && typeof store.removeCommunitySource === 'function');
    if (canUninstall) {
        choices.push({
            id: 'uninstall',
            label: ui.universeRevokedUninstallLabel || 'Remove from installed',
        });
    }

    try {
        if (!choices.length) {
            await store.alert(body, title, {
                confirmText: ui.dialogOkButton || 'OK',
                dialogIcon: '📭',
            });
            return 'dismiss';
        }

        /* DialogModal consolidates exactly 2 choices in the footer; a single
         * choice falls through to Cancel/OK without listing the action. */
        if (choices.length === 1 && choices[0].id === 'uninstall') {
            const remove = await store.showDialog({
                type: 'confirm',
                title,
                body,
                danger: true,
                confirmText: choices[0].label,
                cancelText: ui.dialogOkButton || 'OK',
                dialogIcon: '📭',
            });
            if (!remove) return 'dismiss';
            try {
                store.removeCommunitySource(source.id);
            } catch (e) {
                console.warn('[Arborito] uninstall after revoke', e);
            }
            if (String(store.state.activeSource?.id || '') === String(source.id)) {
                store.update({
                    activeSource: null,
                    data: null,
                    rawGraphData: null,
                    path: [],
                    selectedNode: null,
                    previewNode: null,
                    error: null,
                });
                queueMicrotask(() => store.maybePromptNoTree?.());
            }
            store.notify(
                ui.universeRevokedUninstalledToast || 'Removed from your installed list.',
                false
            );
            return 'uninstall';
        }

        if (choices.length === 1 && choices[0].id === 'save') {
            choices.push({
                id: 'dismiss',
                label: ui.dialogOkButton || 'OK',
            });
        }

        const choice = await store.showDialog({
            type: 'choice',
            title,
            body,
            confirmText: ui.dialogOkButton || 'OK',
            cancelText: ui.cancel || 'Cancel',
            dialogIcon: '📭',
            choices,
        });
        if (!choice || choice === 'dismiss') return 'dismiss';

        if ((choice === 'save' || choice === 'keep-garden') && hasCopy) {
            await saveRevokedTreeToGarden(store, {
                treeJson,
                source,
                incomplete,
            });
            return 'keep-garden';
        }
        if (choice === 'uninstall' && source?.id) {
            try {
                store.removeCommunitySource(source.id);
            } catch (e) {
                console.warn('[Arborito] uninstall after revoke', e);
            }
            if (String(store.state.activeSource?.id || '') === String(source.id)) {
                store.update({
                    activeSource: null,
                    data: null,
                    rawGraphData: null,
                    path: [],
                    selectedNode: null,
                    previewNode: null,
                    error: null,
                });
                queueMicrotask(() => store.maybePromptNoTree?.());
            }
            store.notify(
                ui.universeRevokedUninstalledToast || 'Removed from your installed list.',
                false
            );
            return 'uninstall';
        }
        return 'dismiss';
    } finally {
        store._universeRevokedPromptKey = null;
    }
}

/**
 * @param {import('../../../core/store.js').Store} store
 * @param {{ treeJson: object, source?: object|null, incomplete?: boolean }} opts
 */
async function saveRevokedTreeToGarden(store, opts) {
    const ui = store.ui || {};
    const treeJson = opts.treeJson;
    const source = opts.source || null;
    const defaultName = String(
        (source && source.name) ||
            treeJson?.universeName ||
            ui.forkNetworkTreePromptPlaceholder ||
            'My copy'
    ).trim();
    const typed = await store.showDialog({
        type: 'prompt',
        title: ui.universeRevokedKeepGardenPromptTitle || ui.forkNetworkTreePromptTitle || 'Save local copy',
        body: opts.incomplete
            ? ui.universeRevokedKeepGardenPromptBodyIncomplete ||
              ui.universeRevokedStudentIncompleteNote ||
              'Choose a name for your copy in My garden. Some lessons may be incomplete.'
            : ui.universeRevokedKeepGardenPromptBody ||
              'Choose a name for your copy in My garden.',
        bodyHtml: false,
        placeholder: defaultName,
        confirmText: ui.forkNetworkTreeCreateButton || ui.plantBranchShort || 'Create',
        cancelText: ui.cancel || 'Cancel',
    });
    if (typed === null || typed === false) return;
    const name = String(typed || '').trim();
    if (!name) {
        store.notify(ui.forkNetworkTreeEmptyName || 'Please enter a name.', true);
        return;
    }

    const busyHint = ui.forkNetworkTreeBusy || ui.treeGrowingShort || 'Creating your editable copy…';
    store.update({ treeHydrating: true, treeGrowingOverlay: true, treeGrowingHint: busyHint });
    await yieldToPaint();
    try {
        await store.userStore?.ensureBranchesHydrated?.();
        const entry = store.userStore.plantBranchFromCurriculumClone(name, treeJson, {
            sourceUrl: String(source?.url || '').trim(),
        });
        if (typeof store.userStore?.flushBranchEntry === 'function') {
            await store.userStore.flushBranchEntry(entry.id);
        } else {
            const { persistBranchEntry } = await import('../../../shared/lib/arborito-catalog-store.js');
            await persistBranchEntry(entry);
        }
        if (source?.id && typeof store.removeCommunitySource === 'function') {
            try {
                store.removeCommunitySource(source.id);
            } catch {
                /* ignore */
            }
        }
        const mounted = await store.loadData(
            {
                id: entry.id,
                name: entry.name,
                url: `branch://${entry.id}`,
                type: 'branch',
                isTrusted: true,
            },
            true,
            { skipConstructionLoadConfirm: true, freshBranchId: entry.id }
        );
        if (mounted === false) {
            store.notify(
                ui.forkNetworkTreeLoadFailed ||
                    'Could not open your copy. Find it in My garden or try again.',
                true
            );
            return;
        }
        store.notify(
            ui.universeRevokedKeptGardenToast || 'Saved in My garden. It stays on this device only.',
            false
        );
    } catch (e) {
        console.warn('[Arborito] saveRevokedTreeToGarden', e);
        store.notify(
            String(ui.forkNetworkTreeError || 'Could not create copy: {message}').replace(
                '{message}',
                String((e && e.message) || e)
            ),
            true
        );
    } finally {
        store.update({ treeHydrating: false, treeGrowingOverlay: false, treeGrowingHint: null });
    }
}
