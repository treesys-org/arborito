import { openModal } from '../../../app/modal-open.js';

/**
 * Sign-in gates + modal entry points for team and publish hubs.
 * @see contributor-hub-chrome.js, team modal title/shell
 * @see publish-hub-chrome.js, publish hub scroll + footer labels
 * @see construction-scope-publish.js, construction dock publish tab
 */

/**
 * Sign-in dialog → Profile on confirm. Returns true only if already signed in.
 * @param {import('../../../core/store.js').Store | null | undefined} store
 * @param {{ title?: string, body?: string, confirmText?: string }} [copy]
 */
export async function requireSignInDialog(store, copy = {}) {
    if (!store) return false;
    if (typeof store.isSignedIn === 'function' && store.isSignedIn()) return true;
    const ui = store.ui || {};
    const confirmed = await store.acknowledge({
        title: copy.title || ui.publishNeedLoginTitle || 'Sign in required',
        body:
            copy.body ||
            ui.publishNeedLoginBody ||
            'Sign in from Profile to use network features. Your local garden on this device is not affected.',
        confirmText: copy.confirmText || ui.publishNeedLoginConfirm || ui.forumLoginGoToProfile || 'Sign in',
        dialogIcon: copy.dialogIcon || '🪪',
        dialogSpotlight: copy.dialogSpotlight,
    });
    if (confirmed) {
        openModal({ type: 'profile', focus: 'register' });
    }
    return false;
}

export function teamSignInCopy(ui = {}) {
    return {
        title: ui.governanceNeedLoginTitle || ui.publishNeedLoginTitle || 'Sign in required',
        body:
            ui.governanceNeedLoginBody ||
            ui.publishNeedLoginBody ||
            'Sign in from Profile to manage your team and share course links.',
        confirmText: ui.governanceNeedLoginConfirm || ui.publishNeedLoginConfirm || 'Sign in',
        dialogIcon: '👥',
    };
}

/** @param {import('../../../core/store.js').Store | null | undefined} store */
export async function requireSignInForPublish(store) {
    return requireSignInDialog(store);
}

/** @param {import('../../../core/store.js').Store | null | undefined} store */
export async function requireSignInForTeam(store) {
    return requireSignInDialog(store, teamSignInCopy(store?.ui));
}

/** Open publish hub only when signed in. */
export async function openPublishHub(store, payload = {}) {
    if (!(await requireSignInForPublish(store))) return false;
    const inConstruction = !!store?.state?.constructionMode;
    openModal({
        type: 'construction-about',
        fromConstruction: true,
        publishIntent: true,
        ...(inConstruction ? { dockUi: true } : {}),
        ...payload,
    });
    return true;
}

/** Open team / governance hub only when signed in. */
export async function openContributorHub(store, payload = {}) {
    if (!(await requireSignInForTeam(store))) return false;
    const inConstruction = !!store?.state?.constructionMode;
    openModal({
        type: 'contributor',
        ...(inConstruction ? { dockUi: true } : {}),
        ...payload,
    });
    return true;
}
