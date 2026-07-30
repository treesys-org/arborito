/**
 * After a guest earns first lesson progress, offer account once (human copy).
 * Decline → short spotlight on Profile so they know where to register later.
 */

import { isGuestSyncBannerDismissed, dismissGuestSyncBanner } from '../../sources/api/guest-sync-banner-prefs.js';

const OFFERED_KEY = 'arborito-guest-account-progress-offered';

function readFlag(key) {
    try {
        return localStorage.getItem(key) === 'true';
    } catch {
        return false;
    }
}

function writeFlag(key) {
    try {
        localStorage.setItem(key, 'true');
    } catch {
        /* ignore */
    }
}

export function hasOfferedGuestAccountAfterProgress() {
    return readFlag(OFFERED_KEY);
}

function scheduleGuestAccountTour() {
    /* Dynamic import: static pull of feature-tour into app-stores creates circular chunks. */
    queueMicrotask(() => {
        void import('../../tour/api/product-tour-start-bridge.js')
            .then((m) => {
                m.requestGuestAccountTour?.();
            })
            .catch(() => {});
    });
}

/**
 * @param {{
 *   isSignedIn?: () => boolean,
 *   showDialog?: (opts: object) => Promise<unknown>,
 *   confirm?: (body: string, title?: string, danger?: boolean, confirmText?: string) => Promise<boolean>,
 *   setModal?: (m: object) => void,
 *   ui?: Record<string, string>,
 * }} store
 */
export async function maybeOfferGuestAccountAfterProgress(store) {
    if (!store || typeof store.setModal !== 'function') return;
    if (typeof store.isSignedIn === 'function' ? store.isSignedIn() : false) return;
    if (hasOfferedGuestAccountAfterProgress()) return;
    if (isGuestSyncBannerDismissed()) return;

    writeFlag(OFFERED_KEY);

    const ui = store.ui || {};
    const title = ui.guestProgressAccountTitle || 'Keep your progress?';
    const body =
        ui.guestProgressAccountBody ||
        'Create a free account so you do not lose what you learned if you clear this browser or switch devices.';
    const confirmText = ui.guestProgressAccountCta || ui.sourcesGuestSyncBannerCta || 'Back up my progress';
    const cancelText = ui.guestProgressAccountNotNow || 'Not now';

    let ok = false;
    try {
        if (typeof store.showDialog === 'function') {
            ok = !!(await store.showDialog({
                type: 'confirm',
                title,
                body,
                confirmText,
                cancelText,
            }));
        } else if (typeof store.confirm === 'function') {
            ok = !!(await store.confirm(body, title, false, confirmText));
        }
    } catch {
        ok = false;
    }

    if (ok) {
        store.setModal({ type: 'profile', focus: 'register' });
        return;
    }

    dismissGuestSyncBanner();
    scheduleGuestAccountTour();
}
