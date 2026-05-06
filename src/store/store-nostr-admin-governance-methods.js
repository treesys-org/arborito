import { parseNostrTreeUrl, isNostrNetworkAvailable } from '../services/nostr-refs.js';
import { fileSystem } from '../services/filesystem.js';

/** Mixin applied to `Store.prototype` — extracted from `store.js` to reduce file size. */
export const nostrAdminGovernanceMethods = {
    // --- Nostr (public, mutable) ---
    getNostrPublisherPairs() {
        try {
            const legacy = JSON.parse(localStorage.getItem('arborito-nostr-admin-pairs') || '{}') || {};
            const cur = JSON.parse(localStorage.getItem('arborito-nostr-publisher-pairs') || '{}') || {};
            return { ...legacy, ...cur };
        } catch {
            return {};
        }
    },

    saveNostrPublisherPair(pair) {
        if (!(pair && pair.pub)) return;
        const all = this.getNostrPublisherPairs();
        all[String(pair.pub)] = pair;
        localStorage.setItem('arborito-nostr-publisher-pairs', JSON.stringify(all));
    },

    getNostrPublisherPair(pub) {
        const all = this.getNostrPublisherPairs();
        return all[String(pub)] || null;
    },

    removeNostrPublisherPair(pub) {
        const all = this.getNostrPublisherPairs();
        delete all[String(pub)];
        localStorage.setItem('arborito-nostr-publisher-pairs', JSON.stringify(all));
        try {
            const leg = JSON.parse(localStorage.getItem('arborito-nostr-admin-pairs') || '{}') || {};
            delete leg[String(pub)];
            localStorage.setItem('arborito-nostr-admin-pairs', JSON.stringify(leg));
        } catch {
            /* ignore */
        }
    },

    /**
     * Carga invitaciones firmadas desde la red (`governance/collaborators`).
     * @param {object|null} source
     */
    async refreshTreeNetworkGovernance(source) {
        const ref = (source && source.url) ? parseNostrTreeUrl(String(source.url)) : null;
        if (!ref || !isNostrNetworkAvailable()) {
            this.update({ treeCollaboratorRoles: null });
            return;
        }
        try {
            const rows = await this.nostr.loadCollaboratorInvites({
                ownerPub: ref.pub,
                universeId: ref.universeId
            });
            /** @type {Record<string, 'editor'|'proposer'>} */
            const roles = {};
            for (const row of rows) {
                if (row.role === 'editor' || row.role === 'proposer') {
                    roles[String(row.inviteePub)] = row.role;
                }
            }
            this.update({ treeCollaboratorRoles: roles });
        } catch (e) {
            console.warn('refreshTreeNetworkGovernance', e);
            this.update({ treeCollaboratorRoles: null });
        }
    },

    /**
     * `owner` = clave de publicador en este dispositivo; invitados por `treeCollaboratorRoles` + `getNetworkUserPair`.
     * @returns {'owner'|'editor'|'proposer'|null}
     */
    getMyTreeNetworkRole() {
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef) return null;
        if ((this.getNostrPublisherPair(treeRef.pub) ? this.getNostrPublisherPair(treeRef.pub).priv : undefined)) return 'owner';
        const my = (this.getNetworkUserPair() ? this.getNetworkUserPair().pub : undefined);
        if (!my) return null;
        const r = (this.state.treeCollaboratorRoles ? this.state.treeCollaboratorRoles[String(my)] : undefined);
        if (r === 'editor' || r === 'proposer') return r;
        return null;
    },

    /** Mutate published graph (content / structure): owner or invited editor only. */
    canMutateNostrGraph() {
        if (!fileSystem.isNostrTreeSource()) return true;
        const r = this.getMyTreeNetworkRole();
        return r === 'owner' || r === 'editor';
    },

    /** Invite collaborator by SEA public key (same as forum / progress identity). Owner only. */
    async inviteNostrCollaborator({ inviteePub, role }) {
        const ui = this.ui;
        const treeRef = this.getActivePublicTreeRef();
        const ownerPair = treeRef ? this.getNostrPublisherPair(treeRef.pub) : null;
        if (!treeRef || !(ownerPair && ownerPair.priv)) {
            this.notify(ui.governanceCollabOwnerOnly || 'Only the tree owner can invite collaborators.', true);
            return;
        }
        const pub = String(inviteePub || '').trim();
        if (pub.length < 32) {
            this.notify(ui.governanceCollabInvalidPub || 'Paste a valid public key.', true);
            return;
        }
        try {
            await this.nostr.putCollaboratorInvite({
                ownerPair,
                universeId: treeRef.universeId,
                inviteePub: pub,
                role: role === 'proposer' ? 'proposer' : 'editor'
            });
            await this.refreshTreeNetworkGovernance(this.state.activeSource);
            this.notify(ui.governanceCollabInviteSent || 'Invitation saved on the network.', false);
        } catch (e) {
            console.warn('inviteNostrCollaborator', e);
            this.notify((ui.governanceCollabInviteFail || '{message}').replace('{message}', String((e && e.message) || e)), true);
        }
    },

    async removeNostrCollaborator(inviteePub) {
        const ui = this.ui;
        const treeRef = this.getActivePublicTreeRef();
        const ownerPair = treeRef ? this.getNostrPublisherPair(treeRef.pub) : null;
        if (!treeRef || !(ownerPair && ownerPair.priv)) return;
        const pub = String(inviteePub || '').trim();
        if (!pub) return;
        try {
            await this.nostr.removeCollaboratorInvite({
                ownerPair,
                universeId: treeRef.universeId,
                inviteePub: pub
            });
            await this.refreshTreeNetworkGovernance(this.state.activeSource);
            this.notify(ui.governanceCollabRemoved || 'Collaborator removed.', false);
        } catch (e) {
            console.warn('removeNostrCollaborator', e);
            this.notify((ui.governanceCollabInviteFail || '{message}').replace('{message}', String((e && e.message) || e)), true);
        }
    }

};
