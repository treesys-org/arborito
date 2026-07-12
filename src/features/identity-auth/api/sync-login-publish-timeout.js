/**
 * Race a publish-style promise against a timeout.
 *
 * The Nostr SimplePool used by `store.registerSyncLoginAccount` (and the
 * other `_publish` helpers) doesn't expose an abort handle, so when every
 * relay is unreachable a publish can resolve only after each per-relay
 * timeout elapses (30+s). `publishWithTimeout` lets the caller surface an
 * actionable error after a configurable budget while the underlying
 * publish keeps running in the background, if it eventually succeeds the
 * record is still written.
 *
 * Pure utility: no DOM, no `store`, no side effects.
 *
 * @template T
 * @param {Promise<T>} publishPromise   The in-flight publish/network call.
 * @param {number}     timeoutMs        Budget in ms before rejecting.
 * @param {string}     timeoutMessage   Short message rendered to the user when the timeout fires.
 * @returns {Promise<T>}
 */
export function publishWithTimeout(publishPromise, timeoutMs, timeoutMessage) {
    return Promise.race([
        publishPromise,
        new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(timeoutMessage));
            }, Number(timeoutMs) || 0);
        })
    ]);
}
