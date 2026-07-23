/**
 * Domain change notifications, replaces no-op `store.update({})` calls.
 * `shell-store.update({})` is intentionally a no-op; use these instead.
 */

/** @param {EventTarget} store */
export function notifyUserProgressChanged(store) {
    store?.dispatchEvent(new CustomEvent('arborito-user-progress-changed'));
}

/** @param {EventTarget} store */
export function notifyIdentityChanged(store) {
    store?.dispatchEvent(new CustomEvent('arborito-identity-changed'));
}

/** @param {EventTarget} store */
export function notifyForumChanged(store) {
    store?.dispatchEvent(new CustomEvent('arborito-forum-changed'));
}

/** @param {EventTarget} store */
export function notifyCommunityChanged(store) {
    store?.dispatchEvent(new CustomEvent('arborito-community-changed'));
}

/** @param {EventTarget} store */
export function notifyPublishingChanged(store) {
    store?.dispatchEvent(new CustomEvent('arborito-publishing-changed'));
}
