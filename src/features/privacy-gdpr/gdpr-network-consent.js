/**
 * GDPR network consent — gate for any external network call made on behalf of
 * the user BEFORE they have actively agreed to the privacy policy.
 *
 * Why this exists
 * ---------------
 * Arborito reaches out to external systems (Nostr relays, WebTorrent
 * peers/trackers, optional CDN catalogs, AI model hosts) that learn the
 * user's IP address and request fingerprint as soon as a connection opens.
 * GDPR / ePrivacy require an explicit opt-in BEFORE that first byte leaves
 * the device — "implicit by visiting" is not acceptable for non-essential
 * third-party connections.
 *
 * Behaviour
 * ---------
 * - Consent is stored as `arborito-gdpr-network-consent` =
 *   `{ "at": "<ISO>", "version": 1 }` in `localStorage`.
 * - `hasGdprNetworkConsent()` returns `true` iff the current version was
 *   granted on this device.
 * - Every visitor must tick the privacy checkbox in onboarding step 1
 *   before they can advance — no implicit consent path.
 * - Withdrawing consent (Privacy → "Reset consents") clears the key; the
 *   next external call will surface the gate again.
 *
 * Where it's enforced
 * -------------------
 * 1. `NostrUniverseService` short-circuits subscribe/publish if no consent.
 * 2. `WebTorrentService._getClient` refuses to instantiate the client.
 * 3. `boot-webtorrent.ensureWebTorrentLoaded` will not even fetch the
 *    vendor bundle.
 * 4. `loadGlobalDirectoryRowsFromHttp` skips cross-origin URLs.
 * 5. The store boot pipeline (`store.js` constructor `.then`) waits for
 *    consent before calling `sourceManager.init()` so no auto-load fires.
 */

const GDPR_NETWORK_CONSENT_KEY = 'arborito-gdpr-network-consent';
const GDPR_NETWORK_CONSENT_VERSION = 1;

/* Module-level listeners so services can wake up the moment consent flips
 * from `false` to `true` (e.g. NostrUniverseService can flush its queued
 * fetches, sourceManager can resume the share-link flow). Listeners are
 * stored in a Set so duplicate `subscribe` calls during HMR are no-ops. */
/** @type {Set<() => void>} */
const _consentGrantedListeners = new Set();

let _cachedConsent = null;

function _readRaw() {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(GDPR_NETWORK_CONSENT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
}

/**
 * True iff the current GDPR network-consent version was granted on this
 * device. Cheap (cached) so it can be called from hot paths.
 */
export function hasGdprNetworkConsent() {
    if (_cachedConsent !== null) return _cachedConsent;
    const parsed = _readRaw();
    _cachedConsent =
        !!parsed && Number(parsed.version) === GDPR_NETWORK_CONSENT_VERSION;
    return _cachedConsent;
}

/** Granted explicitly by the user (onboarding checkbox or privacy modal). */
export function grantGdprNetworkConsent() {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(
            GDPR_NETWORK_CONSENT_KEY,
            JSON.stringify({
                at: new Date().toISOString(),
                version: GDPR_NETWORK_CONSENT_VERSION
            })
        );
    } catch {
        /* private mode / quota — accept the consent in memory anyway */
    }
    _cachedConsent = true;
    _consentGrantedListeners.forEach((cb) => {
        try {
            cb();
        } catch (e) {
            console.warn('[Arborito] gdpr consent listener failed', e);
        }
    });
}

/** Right to withdraw (GDPR art. 7.3). Called from the Privacy modal. */
export function withdrawGdprNetworkConsent() {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.removeItem(GDPR_NETWORK_CONSENT_KEY);
    } catch {
        /* ignore */
    }
    _cachedConsent = false;
}

/**
 * Register a callback that runs once consent transitions to "granted".
 * Returns an unsubscribe function. Listeners are NOT called retroactively if
 * consent is already granted — callers should check `hasGdprNetworkConsent()`
 * up front.
 */
export function onGdprNetworkConsentGranted(cb) {
    if (typeof cb !== 'function') return () => {};
    _consentGrantedListeners.add(cb);
    return () => _consentGrantedListeners.delete(cb);
}
