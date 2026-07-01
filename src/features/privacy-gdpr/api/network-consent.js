/**
 * Unified network consent — device GDPR gate + account social/ranking consent.
 *
 * App code MUST import from `shared/lib/connected-services/index.js` (consent +
 * runtime). This module is the implementation; do not add parallel consent keys.
 */

/* --- GDPR device gate (Nostr, WebTorrent, CDN, AI hosts) --- */

const GDPR_NETWORK_CONSENT_KEY = 'arborito-gdpr-network-consent';
const GDPR_NETWORK_CONSENT_VERSION = 1;

/** @type {Set<() => void>} */
const _consentGrantedListeners = new Set();

let _cachedGdprConsent = null;

function _readGdprRaw() {
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

export function hasGdprNetworkConsent() {
    if (_cachedGdprConsent !== null) return _cachedGdprConsent;
    const parsed = _readGdprRaw();
    _cachedGdprConsent =
        !!parsed && Number(parsed.version) === GDPR_NETWORK_CONSENT_VERSION;
    return _cachedGdprConsent;
}

export function grantGdprNetworkConsent() {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(
            GDPR_NETWORK_CONSENT_KEY,
            JSON.stringify({
                at: new Date().toISOString(),
                version: GDPR_NETWORK_CONSENT_VERSION,
            })
        );
    } catch {
        /* private mode / quota */
    }
    _cachedGdprConsent = true;
    _consentGrantedListeners.forEach((cb) => {
        try {
            cb();
        } catch (e) {
            console.warn('[Arborito] gdpr consent listener failed', e);
        }
    });
}

export function withdrawGdprNetworkConsent() {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.removeItem(GDPR_NETWORK_CONSENT_KEY);
    } catch {
        /* ignore */
    }
    _cachedGdprConsent = false;
}

export function onGdprNetworkConsentGranted(cb) {
    if (typeof cb !== 'function') return () => {};
    _consentGrantedListeners.add(cb);
    return () => _consentGrantedListeners.delete(cb);
}

/* --- Account social consent (forum, ranking, Nostr identity actions) --- */

const NETWORK_SOCIAL_CONSENT_VERSION = 1;

export function hasNetworkSocialConsent(store) {
    const g = store?.userStore?.state?.gamification;
    if (!g?.networkSocialConsentAt) return false;
    return Number(g.networkSocialConsentVersion) === NETWORK_SOCIAL_CONSENT_VERSION;
}

export function needsNetworkSocialConsent(store) {
    if (typeof store.isSignedIn !== 'function' || !store.isSignedIn()) return false;
    return !hasNetworkSocialConsent(store);
}

export function buildNetworkSocialConsentPatch() {
    return {
        networkSocialConsentAt: new Date().toISOString(),
        networkSocialConsentVersion: NETWORK_SOCIAL_CONSENT_VERSION,
        rankingOptIn: true,
    };
}
