/**
 * Existing-account sign-in: if this device already has guest learning progress,
 * ask whether to keep it (union-merge into the account) or use the account only.
 * New accounts (register) skip this — they always sync local progress up.
 */

import { storageManager } from '../../backup-export/api/storage-manager.js';
import { hasMeaningfulLearningProgress } from '../../../core/user-store/progress-sync-merge.js';

export const SIGNIN_CANCELLED_CODE = 'SIGNIN_CANCELLED';

export function isSignInCancelledError(err) {
    if (!err || typeof err !== 'object') return false;
    return err.code === SIGNIN_CANCELLED_CODE || String(err.message || '') === SIGNIN_CANCELLED_CODE;
}

export function makeSignInCancelledError() {
    const e = new Error(SIGNIN_CANCELLED_CODE);
    e.code = SIGNIN_CANCELLED_CODE;
    return e;
}

/**
 * @param {{ userStore?: { getPersistenceData?: () => object, state?: object }, getProgressPayloadForSync?: () => object } | null | undefined} store
 */
export function deviceHasGuestLearningProgress(store) {
    if (!store) return false;
    let payload = null;
    try {
        if (typeof store.getProgressPayloadForSync === 'function') {
            payload = store.getProgressPayloadForSync();
        }
    } catch {
        payload = null;
    }
    if (!payload) {
        try {
            const p =
                typeof store.userStore?.getPersistenceData === 'function'
                    ? store.userStore.getPersistenceData()
                    : {
                          progress: [...(store.userStore?.state?.completedNodes || [])],
                          memory: store.userStore?.state?.memory,
                          bookmarks: store.userStore?.state?.bookmarks,
                          gamification: store.userStore?.state?.gamification,
                          gameData: store.userStore?.state?.gameData,
                      };
            let arcadeSaves = {};
            try {
                arcadeSaves = storageManager.exportForSync();
            } catch {
                arcadeSaves = {};
            }
            payload = {
                progress: Array.isArray(p.progress) ? p.progress : [],
                memory: p.memory,
                bookmarks: p.bookmarks,
                gamification: p.gamification,
                gameData: p.gameData,
                arcadeSaves,
            };
        } catch {
            return false;
        }
    }
    return hasMeaningfulLearningProgress(payload);
}

/**
 * Drop device learning data so the next account pull/reconcile does not
 * union-merge guest lessons into an existing online account.
 * Keeps cosmetic username/avatar (sign-in overwrites username next).
 * @param {{ userStore?: object } | null | undefined} store
 */
export function clearDeviceLearningProgressForAccountPull(store) {
    const us = store?.userStore;
    if (!us?.state) return;
    us.state.completedNodes = new Set();
    us.state.xpAwardedNodes = new Set();
    us.state.memory = {};
    us.state.bookmarks = {};
    us.state.gameData = {};
    try {
        storageManager.clearAll();
    } catch {
        /* ignore */
    }
    const g = us.state.gamification && typeof us.state.gamification === 'object' ? us.state.gamification : {};
    if (typeof us.updateGamification === 'function') {
        us.updateGamification({
            xp: 0,
            dailyXP: 0,
            streak: 0,
            weeklyLumens: 0,
            arcadeScore: 0,
            arcadeDailyXP: 0,
            arcadeXpDay: null,
            lumensSpent: 0,
            streakShields: 0,
            seeds: [],
            inventory: [],
            gardenDecor: {},
            quizXpAwarded: {},
            lastStudyDate: null,
            /* Preserve display cosmetics until account profile merges. */
            username: g.username || '',
            avatar: g.avatar || '👤',
            profileUpdatedAt: g.profileUpdatedAt ?? null,
            rankingOptIn: !!g.rankingOptIn,
            rankingAnonymous: !!g.rankingAnonymous,
            networkSocialConsentAt: g.networkSocialConsentAt ?? null,
            networkSocialConsentVersion: g.networkSocialConsentVersion ?? null,
            lastLoginDate: g.lastLoginDate ?? null,
            weeklyWeekKey: g.weeklyWeekKey ?? null,
        });
    } else {
        us.state.gamification = {
            ...g,
            xp: 0,
            dailyXP: 0,
            streak: 0,
            weeklyLumens: 0,
            arcadeScore: 0,
            arcadeDailyXP: 0,
            arcadeXpDay: null,
            lumensSpent: 0,
            streakShields: 0,
            seeds: [],
            inventory: [],
            gardenDecor: {},
            quizXpAwarded: {},
            lastStudyDate: null,
        };
        try {
            us.persist?.();
        } catch {
            /* ignore */
        }
    }
}

/**
 * @param {{
 *   showDialog?: (opts: object) => Promise<unknown>,
 *   ui?: Record<string, string>,
 *   userStore?: object,
 *   getProgressPayloadForSync?: () => object,
 * }} store
 * @returns {Promise<'merge' | 'account'>}
 * @throws {Error} SIGNIN_CANCELLED when the user backs out
 */
export async function resolveSignInLocalProgressChoice(store) {
    if (!deviceHasGuestLearningProgress(store)) return 'merge';

    const ui = store.ui || {};
    const title = ui.signInLocalProgressTitle || 'Progress on this device';
    const body =
        ui.signInLocalProgressBody ||
        'This device already has learning progress. You can include it in your account, or turn the switch off to use only what is already on the account.';
    const switchLabel = ui.signInLocalProgressMergeSwitch || 'Include progress from this device';
    const switchHint =
        ui.signInLocalProgressMergeHint ||
        'Off = use only what is already on the account (this device’s progress is not kept).';
    const confirmText = ui.signInLocalProgressConfirm || ui.onboardingSessionContinue || 'Sign in';

    let result = null;
    try {
        if (typeof store.showDialog === 'function') {
            result = await store.showDialog({
                type: 'confirm',
                title,
                body,
                confirmText,
                switchLabel,
                switchHint,
                switchDefault: true,
            });
        }
    } catch {
        result = null;
    }

    /* Cancel / backdrop → null. Confirm with switch → { confirmed, checked }. */
    if (!result) throw makeSignInCancelledError();

    const merge =
        result === true ||
        (result && typeof result === 'object' && result.confirmed && result.checked !== false);

    if (!merge) {
        clearDeviceLearningProgressForAccountPull(store);
        return 'account';
    }
    return 'merge';
}
