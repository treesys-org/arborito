/**
 * Student-facing flow when a public Nostr universe has been retracted.
 * Keeps network delisting as source of truth; offers a local garden copy of
 * whatever is already on this device (cache / open tree), without prefetch.
 *
 * Pending notice is persisted until the student chooses save / uninstall /
 * dismiss. Closing the browser mid-dialog leaves `pending` so the modal
 * returns on the next open.
 */

import { yieldToPaint } from '../../../shared/lib/yield-to-paint.js';

const STUDENT_REVOKE_LS = 'arborito-universe-revoked-student-v1';

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

/** @param {object|null|undefined} source */
export function universeRevokeSourceKey(source) {
    return String(source?.id || source?.url || '').trim();
}

function readStudentRevokeMap() {
    try {
        const raw = localStorage.getItem(STUDENT_REVOKE_LS);
        if (!raw) return {};
        const o = JSON.parse(raw);
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch {
        return {};
    }
}

function writeStudentRevokeMap(map) {
    try {
        localStorage.setItem(STUDENT_REVOKE_LS, JSON.stringify(map || {}));
    } catch {
        /* ignore quota / private mode */
    }
}

/**
 * @param {object|null|undefined} source
 * @returns {{ pending?: boolean, ack?: boolean, url?: string, at?: number }|null}
 */
function findStudentRevokeEntry(source) {
    const key = universeRevokeSourceKey(source);
    if (!key) return null;
    const map = readStudentRevokeMap();
    if (map[key]) return map[key];
    const url = String(source?.url || '').trim();
    if (!url) return null;
    for (const ent of Object.values(map)) {
        if (ent && String(ent.url || '').trim() === url) return ent;
    }
    return null;
}

/** True when the student still must see the unpublished dialog. */
export function hasPendingUniverseRevokePrompt(source) {
    const ent = findStudentRevokeEntry(source);
    return !!(ent && ent.pending === true && ent.ack !== true);
}

/** True after save / uninstall / dismiss until a successful live load clears it. */
export function isUniverseRevokeAcknowledged(source) {
    const ent = findStudentRevokeEntry(source);
    return !!(ent && ent.ack === true);
}

/** Mark revoked course as waiting for student choice (survives browser close). */
export function markUniverseRevokePending(source) {
    const key = universeRevokeSourceKey(source);
    if (!key) return;
    const map = readStudentRevokeMap();
    map[key] = {
        pending: true,
        ack: false,
        url: String(source?.url || map[key]?.url || '').trim() || undefined,
        at: Date.now(),
    };
    writeStudentRevokeMap(map);
}

/** Student chose save, uninstall, or dismiss — stop re-prompting until republish cycle. */
export function acknowledgeUniverseRevoke(source) {
    const key = universeRevokeSourceKey(source);
    if (!key) return;
    const map = readStudentRevokeMap();
    const prev = map[key] || findStudentRevokeEntry(source);
    map[key] = {
        pending: false,
        ack: true,
        url: String(source?.url || prev?.url || '').trim() || undefined,
        at: Date.now(),
    };
    writeStudentRevokeMap(map);
}

/** Drop local revoke UI state (uninstall, or successful live load again). */
export function clearUniverseRevokeStudentState(source) {
    const key = universeRevokeSourceKey(source);
    const url = String(source?.url || '').trim();
    if (!key && !url) return;
    const map = readStudentRevokeMap();
    let changed = false;
    if (key && map[key]) {
        delete map[key];
        changed = true;
    }
    if (url) {
        for (const k of Object.keys(map)) {
            if (String(map[k]?.url || '').trim() === url) {
                delete map[k];
                changed = true;
            }
        }
    }
    if (changed) writeStudentRevokeMap(map);
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
    const sourceKey = universeRevokeSourceKey(source) || 'unknown';
    if (isUniverseRevokeAcknowledged(source)) return null;
    if (store._universeRevokedPromptKey === sourceKey) return null;
    store._universeRevokedPromptKey = sourceKey;
    markUniverseRevokePending(source);

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

    const finishAck = () => {
        acknowledgeUniverseRevoke(source);
    };

    try {
        /* Another dialog already owns the resolver — leave pending for a later open. */
        if (store._dialogResolver) return null;

        if (!choices.length) {
            await store.alert(body, title, {
                confirmText: ui.dialogOkButton || 'OK',
                dialogIcon: '📭',
            });
            finishAck();
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
            if (!remove) {
                finishAck();
                return 'dismiss';
            }
            try {
                store.removeCommunitySource(source.id);
            } catch (e) {
                console.warn('[Arborito] uninstall after revoke', e);
            }
            clearUniverseRevokeStudentState(source);
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
        if (!choice || choice === 'dismiss') {
            finishAck();
            return 'dismiss';
        }

        if ((choice === 'save' || choice === 'keep-garden') && hasCopy) {
            const saved = await saveRevokedTreeToGarden(store, {
                treeJson,
                source,
                incomplete,
            });
            if (saved) {
                clearUniverseRevokeStudentState(source);
                return 'keep-garden';
            }
            /* Name prompt cancelled — keep pending so the notice returns. */
            return null;
        }
        if (choice === 'uninstall' && source?.id) {
            try {
                store.removeCommunitySource(source.id);
            } catch (e) {
                console.warn('[Arborito] uninstall after revoke', e);
            }
            clearUniverseRevokeStudentState(source);
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
        finishAck();
        return 'dismiss';
    } finally {
        store._universeRevokedPromptKey = null;
    }
}

/**
 * @param {import('../../../core/store.js').Store} store
 * @param {{ treeJson: object, source?: object|null, incomplete?: boolean }} opts
 * @returns {Promise<boolean>} true when a garden copy was created and opened
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
    if (typed === null || typed === false) return false;
    const name = String(typed || '').trim();
    if (!name) {
        store.notify(ui.forkNetworkTreeEmptyName || 'Please enter a name.', true);
        return false;
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
            return false;
        }
        store.notify(
            ui.universeRevokedKeptGardenToast || 'Saved in My garden. It stays on this device only.',
            false
        );
        return true;
    } catch (e) {
        console.warn('[Arborito] saveRevokedTreeToGarden', e);
        store.notify(
            String(ui.forkNetworkTreeError || 'Could not create copy: {message}').replace(
                '{message}',
                String((e && e.message) || e)
            ),
            true
        );
        return false;
    } finally {
        store.update({ treeHydrating: false, treeGrowingOverlay: false, treeGrowingHint: null });
    }
}
