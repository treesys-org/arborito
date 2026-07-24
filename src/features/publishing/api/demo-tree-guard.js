import { DEMO_BRANCH_ID, DEMO_BRANCH_UNIVERSE } from '../../../core/demo/arborito-demo-ids.js';
import { hasGdprNetworkConsent } from '../../privacy-gdpr/api/network-consent.js';

/**
 * True when the loaded curriculum is the bundled Arborito demo (fixed branch id),
 * or a network/memory view of that same universe — not a user’s local fork.
 */
export function isArboritoDemoTree(store) {
    const src = store?.state?.activeSource;
    const branchId =
        src?.type === 'branch'
            ? String(src.id || '')
            : String(src?.url || '').startsWith('branch://')
              ? String(src.url).slice('branch://'.length).split('/')[0]
              : '';
    if (branchId === DEMO_BRANCH_ID) return true;
    /*
     * Local garden forks keep their own branch-… id. Never treat them as the
     * bundled demo even if curriculum metadata still mentions the demo universe
     * (stale titles / universeId left over from an older clone).
     */
    if (branchId && branchId !== DEMO_BRANCH_ID && String(src?.url || '').startsWith('branch://')) {
        return false;
    }
    if (src?.type === 'branch' && branchId && branchId !== DEMO_BRANCH_ID) {
        return false;
    }
    const raw = store?.state?.rawGraphData;
    const universeId = String(raw?.universeId || raw?.meta?.universeId || '').trim();
    if (universeId && universeId !== DEMO_BRANCH_UNIVERSE && universeId.startsWith('branch-')) {
        return false;
    }
    return universeId === DEMO_BRANCH_UNIVERSE;
}

export function isBundledDemoBranchId(branchId) {
    return String(branchId || '').trim() === DEMO_BRANCH_ID;
}

/** Signed in + network consent — demo progress uses this as “always online”. */
export function hasOnlineAccountProgressConsent(store) {
    if (!store || typeof store.isSignedIn !== 'function' || !store.isSignedIn()) return false;
    try {
        if (typeof store.hasGdprNetworkConsent === 'function') {
            return !!store.hasGdprNetworkConsent();
        }
    } catch {
        /* fall through */
    }
    try {
        return !!hasGdprNetworkConsent();
    } catch {
        return false;
    }
}

/**
 * Progress sync allowed: profile cloud toggle, or Arborito demo (always online
 * when the account has network consent — no sync upsell / toggle required).
 */
export function shouldSyncNetworkProgress(store) {
    if (!hasOnlineAccountProgressConsent(store)) return false;
    if (store.userStore?.state?.cloudProgressSync) return true;
    return isArboritoDemoTree(store);
}

/**
 * Ensure demo acts like an online curriculum for progress: turn on the sync
 * flag quietly when the account already has network consent.
 * @returns {boolean} true if sync was enabled or already on
 */
export function ensureDemoProgressSyncOnline(store) {
    if (!store?.userStore?.state || !isArboritoDemoTree(store)) return false;
    if (!hasOnlineAccountProgressConsent(store)) return false;
    if (store.userStore.state.cloudProgressSync) return true;
    store.userStore.state.cloudProgressSync = true;
    try {
        store.userStore.persist?.();
    } catch {
        /* ignore */
    }
    return true;
}
