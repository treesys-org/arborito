import { getArboritoStore } from '../core/store-singleton.js';
import { publishTreePublicInteractiveAction } from './publishing-store-actions.js';
import { parseNostrTreeUrl, isNostrNetworkAvailable } from '../features/nostr/api/nostr-refs.js';
import { getConnectedNostr } from '../shared/lib/connected-services/index.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { notifyAction } from './shell-ui-store-actions.js';
import { normalizeUsername } from '../shared/lib/normalize-username.js';

/**
 * Apply a Nostr patch to the singleton (syncs slices via `store.update`).
 * @param {Record<string, unknown>} partial
 */
export function commitNostrState(partial) {
    const store = getArboritoStore();
    if (!store || !partial) return;
    store.update(partial);
}

function shell() {
    return getArboritoStore();
}

export function getNostrPublisherPairsAction() {
    try {
        return JSON.parse(localStorage.getItem('arborito-nostr-publisher-pairs') || '{}') || {};
    } catch {
        return {};
    }
}

export function saveNostrPublisherPairAction(pair) {
    const store = shell();
    if (!store || !pair?.pub) return;
    const all = getNostrPublisherPairsAction();
    all[String(pair.pub)] = pair;
    localStorage.setItem('arborito-nostr-publisher-pairs', JSON.stringify(all));
}

export function getNostrPublisherPairAction(pub) {
    return getNostrPublisherPairsAction()[String(pub)] || null;
}

function maybeNotifyEditorAccessGrantedAction(store, treeRef) {
    if (!store || !treeRef) return;
    const ui = store.ui || {};
    const role = getMyTreeNetworkRoleAction();
    if (role !== 'editor') return;
    const sessionUser = normalizeUsername(store._authSession?.username || '');
    if (!sessionUser) return;
    const key = `arborito-editor-grant:${treeRef.pub}:${treeRef.universeId}:${sessionUser}`;
    try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
    } catch {
        return;
    }
    notifyAction(
        ui.governanceEditorAccessGranted ||
            'You can edit this branch in Construction.',
        false
    );
}

export async function refreshTreeNetworkGovernanceAction(source) {
    const store = shell();
    if (!store) return;
    const ref =
        typeof store.getActivePublicTreeRef === 'function'
            ? store.getActivePublicTreeRef()
            : source?.url
              ? parseNostrTreeUrl(String(source.url))
              : null;
    if (!ref || !isNostrNetworkAvailable()) {
        store.update({
            treeCollaboratorRoles: null,
            treeCollaboratorUsernames: null,
            treeCollaboratorRolesByUsername: null,
        });
        return;
    }
    const net = await getConnectedNostr(store);
    if (!net) {
        store.update({
            treeCollaboratorRoles: null,
            treeCollaboratorUsernames: null,
            treeCollaboratorRolesByUsername: null,
        });
        return;
    }
    try {
        const rows = await net.loadCollaboratorInvites({
            ownerPub: ref.pub,
            universeId: ref.universeId,
        });
        const roles = {};
        const usernames = {};
        const rolesByUsername = {};
        for (const row of rows) {
            if (row.role === 'editor' || row.role === 'proposer') {
                roles[String(row.inviteePub)] = row.role;
                const label = String(row.inviteeUsername || '').trim();
                if (label) {
                    usernames[String(row.inviteePub)] = label;
                    rolesByUsername[normalizeUsername(label)] = row.role;
                }
            }
        }
        store.update({
            treeCollaboratorRoles: roles,
            treeCollaboratorUsernames: usernames,
            treeCollaboratorRolesByUsername: rolesByUsername,
        });
        maybeNotifyEditorAccessGrantedAction(store, ref);
    } catch (e) {
        console.warn('refreshTreeNetworkGovernance', e);
        /* Soft failure: keep last-known roles so editors do not lose canWrite mid-session. */
        store.notify?.(
            store.ui?.governanceRefreshFailed ||
                'Could not refresh collaborator roles. Using the last known access.',
            true
        );
    }
}

export function getMyTreeNetworkRoleAction() {
    const store = shell();
    if (!store) return null;
    const treeRef = store.getActivePublicTreeRef?.();
    if (!treeRef) return null;
    if (getNostrPublisherPairAction(treeRef.pub)?.priv) return 'owner';
    const my = store.getNetworkUserPair?.()?.pub;
    if (my) {
        const r = store.state.treeCollaboratorRoles?.[String(my)];
        if (r === 'editor' || r === 'proposer') return r;
    }
    return null;
}

export function canMutateNostrGraphAction() {
    if (!fileSystem.isNostrTreeSource()) return true;
    const r = getMyTreeNetworkRoleAction();
    return r === 'owner' || r === 'editor';
}

export async function inviteNostrCollaboratorAction({ inviteePub, inviteeUsername, role } = {}) {
    const store = shell();
    if (!store) return;
    const ui = store.ui;
    const treeRef = store.getActivePublicTreeRef?.();
    const ownerPair = treeRef ? getNostrPublisherPairAction(treeRef.pub) : null;
    if (!treeRef || !ownerPair?.priv) {
        notifyAction(ui.governanceCollabOwnerOnly || 'Only the tree owner can invite collaborators.', true);
        return;
    }

    let pub = String(inviteePub || '').trim();
    let username = normalizeUsername(inviteeUsername || '');

    const net = await getConnectedNostr(store);

    if (!pub && username) {
        if (!net) {
            notifyAction(ui.nostrNotLoadedHint || 'Nostr relays unavailable.', true);
            return;
        }
        try {
            const resolved = await net.resolveInviteAccountOnce(username);
            if (!resolved?.accountSignerPub) {
                notifyAction(
                    ui.governanceCollabUnknownUser ||
                        'No online account found for that username.',
                    true
                );
                return;
            }
            const netPub = String(resolved.networkUserPub || '').trim();
            if (netPub.length < 32) {
                notifyAction(
                    ui.governanceCollabUnknownUser ||
                        'No online account found for that username.',
                    true
                );
                return;
            }
            pub = netPub;
            username = resolved.username;
        } catch (e) {
            console.warn('resolveInviteAccountOnce', e);
            notifyAction(
                ui.governanceCollabUnknownUser ||
                    'No online account found for that username.',
                true
            );
            return;
        }
    } else if (!username && pub) {
        if (/^[0-9a-f]{32,64}$/i.test(pub)) {
            /* Legacy: raw pubkey pasted directly. */
        } else {
            username = normalizeUsername(pub);
            pub = '';
            if (username) {
                try {
                    const resolved = net
                        ? await net.resolveInviteAccountOnce(username)
                        : null;
                    if (resolved?.accountSignerPub) {
                        const netPub = String(resolved.networkUserPub || '').trim();
                        if (netPub.length >= 32) {
                            pub = netPub;
                            username = resolved.username;
                        }
                    }
                } catch {
                    pub = '';
                }
            }
            if (!pub) {
                notifyAction(
                    ui.governanceCollabUnknownUser ||
                        'No online account found for that username.',
                    true
                );
                return;
            }
        }
    }

    if (pub.length < 32) {
        notifyAction(ui.governanceCollabInvalidUsername || 'Enter a valid username.', true);
        return;
    }
    if (!net) {
        notifyAction(ui.nostrNotLoadedHint || 'Nostr relays unavailable.', true);
        return;
    }
    try {
        await net.putCollaboratorInvite({
            ownerPair,
            universeId: treeRef.universeId,
            inviteePub: pub,
            inviteeUsername: username || undefined,
            role: role === 'proposer' ? 'proposer' : 'editor',
        });
        await refreshTreeNetworkGovernanceAction(store.state.activeSource);
        notifyAction(ui.governanceCollabInviteSent || 'Invitation saved on the network.', false);
    } catch (e) {
        console.warn('inviteNostrCollaborator', e);
        notifyAction((ui.governanceCollabInviteFail || '{message}').replace('{message}', String(e?.message || e)), true);
    }
}

export async function removeNostrCollaboratorAction(inviteePub) {
    const store = shell();
    if (!store) return;
    const ui = store.ui;
    const treeRef = store.getActivePublicTreeRef?.();
    const ownerPair = treeRef ? getNostrPublisherPairAction(treeRef.pub) : null;
    if (!treeRef || !ownerPair?.priv) return;
    const pub = String(inviteePub || '').trim();
    if (!pub) return;
    const net = await getConnectedNostr(store);
    if (!net) return;
    try {
        await net.removeCollaboratorInvite({
            ownerPair,
            universeId: treeRef.universeId,
            inviteePub: pub,
        });
        await refreshTreeNetworkGovernanceAction(store.state.activeSource);
        notifyAction(ui.governanceCollabRemoved || 'Collaborator removed.', false);
    } catch (e) {
        console.warn('removeNostrCollaborator', e);
        notifyAction((ui.governanceCollabInviteFail || '{message}').replace('{message}', String(e?.message || e)), true);
    }
}

export function getNetworkUserPairAction() {
    return shell()?.getNetworkUserPair?.();
}

export function setNostrRelayUrlsAction(peers) {
    return shell()?.setNostrRelayUrls?.(peers);
}

export function getActivePublicTreeRefAction() {
    return shell()?.getActivePublicTreeRef?.();
}

/** Store.prototype, Nostr admin / governance. */
export const nostrAdminGovernanceMethods = {
    getNostrPublisherPairs: getNostrPublisherPairsAction,
    saveNostrPublisherPair: saveNostrPublisherPairAction,
    getNostrPublisherPair: getNostrPublisherPairAction,
    refreshTreeNetworkGovernance: refreshTreeNetworkGovernanceAction,
    getMyTreeNetworkRole: getMyTreeNetworkRoleAction,
    canMutateNostrGraph: canMutateNostrGraphAction,
    inviteNostrCollaborator: inviteNostrCollaboratorAction,
    removeNostrCollaborator: removeNostrCollaboratorAction,
};

/** Nostr domain actions for hooks. */
export const nostrDomainActions = {
    getNostrPublisherPair: getNostrPublisherPairAction,
    getMyTreeNetworkRole: getMyTreeNetworkRoleAction,
    getNetworkUserPair: getNetworkUserPairAction,
    publishTreePublicInteractive: publishTreePublicInteractiveAction,
    inviteNostrCollaborator: inviteNostrCollaboratorAction,
    removeNostrCollaborator: removeNostrCollaboratorAction,
    setNostrRelayUrls: setNostrRelayUrlsAction,
    getActivePublicTreeRef: getActivePublicTreeRefAction,
    refreshTreeNetworkGovernance: refreshTreeNetworkGovernanceAction,
    canMutateNostrGraph: canMutateNostrGraphAction,
};
