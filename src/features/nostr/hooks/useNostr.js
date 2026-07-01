import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useHookUi, useShellModalActions } from '../../../app/hooks/useHookShell.js';
import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { useNostrSlice, nostrActions } from '../../../stores/nostr-store.js';
import { useTreeGraphSlice } from '../../../stores/tree-graph-store.js';
import { useSourcesSlice } from '../../../stores/sources-store.js';
import { getUserStoreAction } from '../../../stores/identity-store-actions.js';

/** Nostr admin, governance, publicación en red. */
export function useNostr() {
    const ui = useHookUi();
    const { dismissModal, setModal, notify, update } = useShellModalActions();
    const { treeCollaboratorRoles } = useNostrSlice((s) => s);
    const { nostrLiveSeeds, rawGraphData } = useTreeGraphSlice(
        useShallow((s) => ({
            nostrLiveSeeds: s.nostrLiveSeeds,
            rawGraphData: s.rawGraphData,
        }))
    );
    const activeSource = useSourcesSlice((s) => s.activeSource);

    const getNostrPublisherPair = useCallback((pub) => nostrActions.getNostrPublisherPair(pub), []);
    const getMyTreeNetworkRole = useCallback(() => nostrActions.getMyTreeNetworkRole(), []);
    const getNetworkUserPair = useCallback(() => nostrActions.getNetworkUserPair(), []);
    const publishTreePublicInteractive = useCallback(() => nostrActions.publishTreePublicInteractive(), []);
    const inviteNostrCollaborator = useCallback((opts) => nostrActions.inviteNostrCollaborator(opts), []);
    const removeNostrCollaborator = useCallback((pub) => nostrActions.removeNostrCollaborator(pub), []);

    return {
        ui,
        userStore: getUserStoreAction(),
        activeSource,
        rawGraphData,
        treeCollaboratorRoles,
        nostrLiveSeeds,
        nostr: store.nostr,
        getNostrPublisherPair,
        getMyTreeNetworkRole,
        getNetworkUserPair,
        publishTreePublicInteractive,
        inviteNostrCollaborator,
        removeNostrCollaborator,
        dismissModal,
        setModal,
        notify,
        update,
    };
}

export function useNostrStore() {
    return store;
}
