import { isNostrNetworkAvailable, parseNostrTreeUrl, formatNostrTreeUrl, createNostrPair } from '../nostr-refs.js';
import { resolveTreeInput } from '../../sources/tree-aliases.js';

/** Mixin applied to `Store.prototype` — extracted from `store.js` to reduce file size. */
export const storeNostrCommunityMethods = {
    /**
     * Remove this device’s forum identity + cloud progress for the active public universe (self-service GDPR).
     * Local study progress in the browser stays; a new keypair is issued for future posts.
     */
    async selfDeleteNostrForumAccount(sourceId) {
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef) {
            this.notify(this.ui.forumNoPublicUniverse || 'This tree is not an online public universe.', true);
            return false;
        }
        if (!isNostrNetworkAvailable()) {
            this.notify(
                this.ui.nostrNotLoadedHint ||
                    'Nostr relays unavailable (see index.html). Configure relays and reload for online identity actions.',
                true
            );
            return false;
        }
        const pair = await this.ensureNetworkUserPair();
        if (!(pair && pair.pub)) {
            this.notify(
                this.ui.nostrIdentityUnavailable || 'Online identity needs HTTPS or localhost on this browser.',
                true
            );
            return false;
        }
        const uid = String(pair.pub);
        try {
            await this.nostr.deleteAccountSelf({ ...treeRef, pair });
            this.nostr.clearUserProgress({ ...treeRef, userPub: uid });
            this.forumStore.deleteMessagesByAuthorPub(sourceId, uid);
            const newPair = await createNostrPair();
            this.saveNetworkUserPair(newPair);
            this.maybeSyncNetworkProgress(this.userStore.getPersistenceData());
            this.update({});
            await this.showDialog({
                type: 'alert',
                title: this.ui.forumSelfAccountRemovedTitle || 'Online presence removed',
                body: this.ui.forumSelfAccountRemovedBody || ''
            });
            return true;
        } catch (e) {
            console.warn('selfDeleteNostrForumAccount', e);
            this.notify(this.ui.forumAccountActionError || 'Could not complete the request.', true);
            return false;
        }
    },

    /** After loading a public tree: if an admin removed this key from the network, explain once per session. */
    async maybeNotifyNetworkAccountRemoved(treeRef) {
        if (!treeRef || !isNostrNetworkAvailable()) return;
        try {
            const pair = await this.ensureNetworkUserPair();
            if (!(pair && pair.pub)) return;
            const userPub = pair.pub;
            const rec = await this.nostr.getDeletedAccountRecord({ ...treeRef, userPub });
            if (!rec) return;
            const by = String(rec.by || '');
            const adminPub = String(treeRef.pub);
            if (by === userPub) return;
            if (by !== adminPub) return;
            const key = `arborito-nostr-admin-removal-${adminPub}-${treeRef.universeId}-${userPub}`;
            if (sessionStorage.getItem(key)) return;
            sessionStorage.setItem(key, '1');
            const ui = this.ui;
            await this.showDialog({
                type: 'alert',
                title: ui.nostrAccountRemovedByAdminTitle || 'Account removed on this tree',
                body: ui.nostrAccountRemovedByAdminBody || ''
            });
        } catch (e) {
            console.warn('maybeNotifyNetworkAccountRemoved', e);
        }
    },

    notifyCommunityAddResult(res) {
        if (!res) return;
        if (res.ok) {
            this.notify(this.ui.sourcesAddNewOk || 'Added to your tree list.', false);
            return;
        }
        if (res.reason === 'maintainer_blocklist') {
            this.notify(
                this.ui.maintainerBlocklistAddRefused ||
                    this.ui.maintainerBlocklistLoadRefused ||
                    'This tree is blocked in this app build (maintainer list).',
                true
            );
            return;
        }
        if (res.reason === 'duplicate') {
            const hint = (res.existing && res.existing.name)
                ? ` (${res.existing.name})`
                : '';
            const msg = this.ui.sourcesAddDuplicate || 'That tree is already in your list.{hint}';
            this.notify(msg.replace(/\{hint\}/g, hint), false);
        }
    },

    /** Add community tree: official short name, 8-char share code, nostr://…, or HTTPS URL. */
    async requestAddCommunitySource(rawInput) {
        const trimmed = String(rawInput || '').trim();
        if (!trimmed) return;
        const pre = resolveTreeInput(trimmed);
        if (pre.kind === 'unknown_alias') {
            const msg =
                this.ui.sourcesUnknownAlias ||
                'Unknown name “{name}”. Try an 8-character code or paste a full link.';
            this.notify(msg.replace(/\{name\}/g, pre.tried), true);
            return;
        }
        if (pre.kind === 'code') {
            if (!isNostrNetworkAvailable()) {
                this.notify(
                    this.ui.nostrNotLoadedHint ||
                        'Nostr relays unavailable (see index.html). Configure relays and reload to use share codes.',
                    true
                );
                return;
            }
            let ref = null;
            try {
                ref = await this.nostr.resolveTreeShareCode(pre.code);
            } catch (e) {
                console.warn('Share code lookup failed', e);
            }
            if (!ref) {
                this.notify(this.ui.sourcesUnknownCode || 'Unknown or invalid code.', true);
                return;
            }
            if (this.isNostrTreeMaintainerBlocked(ref.pub, ref.universeId)) {
                this.notify(
                    this.ui.maintainerBlocklistLoadRefused ||
                        'This tree is blocked in this app build (maintainer list).',
                    true
                );
                return;
            }
            const effective = formatNostrTreeUrl(ref.pub, ref.universeId);
            const treeRef = parseNostrTreeUrl(effective);
            let ack = false;
            try {
                ack =
                    localStorage.getItem(`arborito-nostr-public-ack:${treeRef.pub}:${treeRef.universeId}`) ===
                    '1';
            } catch {
                /* ignore */
            }
            if (ack || this.sourceManager.isUrlTrusted(effective)) {
                const res = this.sourceManager.addCommunitySource(trimmed, {
                    resolvedNostrTreeUrl: effective,
                    codeLabel: pre.code
                });
                this.notifyCommunityAddResult(res);
                await this.maybeAutoLoadSoleCommunityAfterAdd(res);
            } else {
                this.update({ modal: { type: 'security-warning', url: effective } });
            }
            return;
        }
        const effective =
            pre.kind === 'resolved' ? pre.url : pre.kind === 'raw' ? pre.value : trimmed;
        const treeRef = parseNostrTreeUrl(effective);
        if (treeRef) {
            if (this.isNostrTreeMaintainerBlocked(treeRef.pub, treeRef.universeId)) {
                this.notify(
                    this.ui.maintainerBlocklistLoadRefused ||
                        'This tree is blocked in this app build (maintainer list).',
                    true
                );
                return;
            }
            if (!isNostrNetworkAvailable()) {
                this.notify(
                    this.ui.nostrNotLoadedHint ||
                        'Nostr relays unavailable (see index.html). Configure relays and reload to open nostr:// trees.',
                    true
                );
                return;
            }
            let ack = false;
            try {
                ack =
                    localStorage.getItem(`arborito-nostr-public-ack:${treeRef.pub}:${treeRef.universeId}`) ===
                    '1';
            } catch {
                /* ignore */
            }
            if (ack || this.sourceManager.isUrlTrusted(effective)) {
                const res = this.sourceManager.addCommunitySource(trimmed);
                this.notifyCommunityAddResult(res);
                await this.maybeAutoLoadSoleCommunityAfterAdd(res);
            } else {
                this.update({ modal: { type: 'security-warning', url: effective } });
            }
            return;
        }
        let candidate;
        try {
            candidate = new URL(effective, window.location.href).href;
        } catch {
            this.notify(this.ui.sourcesInvalidLink || 'Could not understand that link.', true);
            return;
        }
        if (this.sourceManager.isUrlTrusted(candidate)) {
            const res = this.sourceManager.addCommunitySource(trimmed);
            this.notifyCommunityAddResult(res);
            await this.maybeAutoLoadSoleCommunityAfterAdd(res);
        } else {
            this.update({ modal: { type: 'security-warning', url: candidate } });
        }
    }

};
