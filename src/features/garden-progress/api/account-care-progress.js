/**
 * Progress channel for signed-in care when no public tree is open.
 * Private/local branches have no ownerPub:universeId for kind 30290; without
 * this fallback, lesson XP and garden state never leave the device.
 */
export const ACCOUNT_CARE_UNIVERSE_ID = 'arborito-account-care';

/**
 * @param {string|null|undefined} pairPub
 * @returns {{ pub: string, universeId: string }|null}
 */
export function resolveAccountCareTreeRef(pairPub) {
    const pub = String(pairPub || '').trim();
    if (!pub) return null;
    return { pub, universeId: ACCOUNT_CARE_UNIVERSE_ID };
}
