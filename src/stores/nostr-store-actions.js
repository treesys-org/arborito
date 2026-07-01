import { getArboritoStore } from '../core/store-singleton.js';
import { publishTreePublicInteractiveAction } from './publishing-store-actions.js';
import { parseNostrTreeUrl, isNostrNetworkAvailable } from '../features/nostr/api/nostr-refs.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { notifyAction } from './shell-ui-store-actions.js';

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

export async function refreshTreeNetworkGovernanceAction(source) {
    const store = shell();
    if (!store) return;
    const ref = source?.url ? parseNostrTreeUrl(String(source.url)) : null;
    if (!ref || !isNostrNetworkAvailable()) {
        store.update({ treeCollaboratorRoles: null });
        return;
    }
    try {
        const rows = await store.nostr.loadCollaboratorInvites({
            ownerPub: ref.pub,
            universeId: ref.universeId,
        });
        const roles = {};
        for (const row of rows) {
            if (row.role === 'editor' || row.role === 'proposer') {
                roles[String(row.inviteePub)] = row.role;
            }
        }
        store.update({ treeCollaboratorRoles: roles });
    } catch (e) {
        console.warn('refreshTreeNetworkGovernance', e);
        store.update({ treeCollaboratorRoles: null });
    }
}

export function getMyTreeNetworkRoleAction() {
    const store = shell();
    if (!store) return null;
    const treeRef = store.getActivePublicTreeRef?.();
    if (!treeRef) return null;
    if (getNostrPublisherPairAction(treeRef.pub)?.priv) return 'owner';
    const my = store.getNetworkUserPair?.()?.pub;
    if (!my) return null;
    const r = store.state.treeCollaboratorRoles?.[String(my)];
    if (r === 'editor' || r === 'proposer') return r;
    return null;
}

export function canMutateNostrGraphAction() {
    if (!fileSystem.isNostrTreeSource()) return true;
    const r = getMyTreeNetworkRoleAction();
    return r === 'owner' || r === 'editor';
}

export async function inviteNostrCollaboratorAction({ inviteePub, role } = {}) {
    const store = shell();
    if (!store) return;
    const ui = store.ui;
    const treeRef = store.getActivePublicTreeRef?.();
    const ownerPair = treeRef ? getNostrPublisherPairAction(treeRef.pub) : null;
    if (!treeRef || !ownerPair?.priv) {
        notifyAction(ui.governanceCollabOwnerOnly || 'Only the tree owner can invite collaborators.', true);
        return;
    }
    const pub = String(inviteePub || '').trim();
    if (pub.length < 32) {
        notifyAction(ui.governanceCollabInvalidPub || 'Paste a valid public key.', true);
        return;
    }
    try {
        await store.nostr.putCollaboratorInvite({
            ownerPair,
            universeId: treeRef.universeId,
            inviteePub: pub,
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
    try {
        await store.nostr.removeCollaboratorInvite({
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

/** Store.prototype — Nostr admin / governance. */
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
