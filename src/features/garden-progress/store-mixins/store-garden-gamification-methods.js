import { celebrate } from '../celebration.js';
import { publishTreeRankingIfOptedIn, fetchTreeRanking } from '../../tree-graph/tree-ranking.js';
import { syncGardenBackground } from '../garden-background.js';
import {
    buildNetworkSocialConsentPatch,
    hasNetworkSocialConsent,
    needsNetworkSocialConsent
} from '../../privacy-gdpr/network-social-consent.js';

/** Garden shop, ranking, and celebration hooks. */
export const gardenGamificationMethods = {
    /** Debounced ranking publish after XP changes. */
    _scheduleRankingPublish() {
        if (this._rankingPublishTimer) clearTimeout(this._rankingPublishTimer);
        this._rankingPublishTimer = setTimeout(() => {
            this._rankingPublishTimer = null;
            void publishTreeRankingIfOptedIn(this);
        }, 2500);
    },

    async loadTreeRanking() {
        return fetchTreeRanking(this);
    },

    buyGardenShopItem(itemId) {
        const ui = this.ui || {};
        const result = this.userStore.purchaseGardenItem(itemId);
        if (!result.ok) {
            if (result.error === 'insufficient') {
                this.notify(ui.gardenShopInsufficient || 'Not enough lúmenes.', true);
            } else if (result.error === 'owned') {
                this.notify(ui.gardenShopAlreadyOwned || 'Already owned.', false);
            }
            return false;
        }
        celebrate('purchase');
        this.notify(ui.gardenShopPurchased || 'Decoration added to your garden!', false);
        syncGardenBackground(this);
        this.update({});
        return true;
    },

    equipGardenShopItem(itemId) {
        const ok = this.userStore.equipGardenDecorItem(itemId);
        if (ok) {
            this.notify(this.ui.gardenShopEquippedToast || 'Decoration placed.', false);
            syncGardenBackground(this);
            this.update({});
        }
        return ok;
    },

    unequipGardenShopItem(slot) {
        const ok = this.userStore.unequipGardenDecorItem(slot);
        if (ok) {
            this.notify(this.ui.gardenShopUnequippedToast || 'Decoration removed.', false);
            syncGardenBackground(this);
            this.update({});
        }
        return ok;
    },

    hasNetworkSocialConsent() {
        return hasNetworkSocialConsent(this);
    },

    needsNetworkSocialConsent() {
        return needsNetworkSocialConsent(this);
    },

    grantNetworkSocialConsent() {
        this.userStore.updateGamification(buildNetworkSocialConsentPatch());
        void this.ensureNetworkUserPair?.().then(() => publishTreeRankingIfOptedIn(this));
        this.update({});
        return true;
    },

    setRankingOptIn(enabled, { anonymous = null } = {}) {
        const g = this.userStore.state.gamification;
        const updates = { rankingOptIn: !!enabled };
        if (anonymous !== null) updates.rankingAnonymous = !!anonymous;
        if (!enabled) updates.rankingAnonymous = false;
        this.userStore.updateGamification(updates);
        if (enabled) {
            void this.ensureNetworkUserPair?.().then(() => publishTreeRankingIfOptedIn(this));
        }
        this.update({});
    }
};
