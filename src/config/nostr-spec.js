/**
 * Arborito Nostr application spec (kinds 30000–39999, replaceable where noted).
 * @see https://github.com/nostr-protocol/nips/blob/master/33.md
 */

/** Global tree directory row (replaceable per publisher+tree). */
export const KIND_TREE_DIRECTORY = 30100;

/** Directory “bump” for indexer recency (normal event, append). */
export const KIND_DIRECTORY_BUMP = 30101;

/** Aggregator snapshot (trusted publishers only; same shape as legacy). */
export const KIND_DIRECTORY_INDEX_SNAPSHOT = 30102;

/** Signed JSON payload carrier (SEA replacement: verifyEvent + JSON.parse(content)). */
export const KIND_APP_SIGNED_PAYLOAD = 30103;

/** Bundle header (replaceable NIP-33). */
export const KIND_BUNDLE_HEADER = 30150;

/** Bundle JSON chunk (ordered; references header id in `e` root tag). */
export const KIND_BUNDLE_CHUNK_JSON = 30151;

/** Bundle auxiliary blob (gzip base64 lesson/snapshot/search/forum parts). */
export const KIND_BUNDLE_BLOB_CHUNK = 30152;

/** Universe revocation marker (replaceable). */
export const KIND_UNIVERSE_REVOKE = 30160;

/** Share code → tree mapping (replaceable by `d` = normalized code). */
export const KIND_TREE_CODE = 30170;

/** Passkey / auth credential row (per browser writer key; filter by `u` tag). */
export const KIND_AUTH_CREDENTIAL = 30241;

/** Forum message (threaded via `e` tags). */
export const KIND_FORUM_MESSAGE = 30260;

/** Forum thread root / metadata updates. */
export const KIND_FORUM_THREAD = 30261;

/** Forum moderation / deletion tombstone (signed payload kind inside content). */
export const KIND_FORUM_MOD = 30262;

/** Forum v3 bucket storage (threads, pages, bans, pending). */
export const KIND_FORUM_BUCKET = 30263;

/** Presence heartbeat (ephemeral-ish; clients ignore >90s). */
export const KIND_PRESENCE_PING = 30280;

/** User progress sync blob per user. */
export const KIND_USER_PROGRESS = 30290;

/** QR Signaling: ephemeral authorization request (desktop publishes, mobile scans). */
export const KIND_QR_SIGNAL_REQUEST = 30295;

/** QR Signaling: authorization response (mobile publishes after scanning, desktop listens). */
export const KIND_QR_SIGNAL_AUTH = 30296;

/** Max UTF-8 length of `content` per chunk after compression (conservative for relays). */
export const NOSTR_CHUNK_CONTENT_MAX = 14000;

/** Tag names */
export const TAG_APP = 'app';
export const TAG_APP_VALUE = 'arborito';

export const TAG_ARB_ROOT = 'arb';
/**
 * One Nostr tag row: ["arb","root", ownerPubHex, universeId] (scopes tree data).
 * Use as a single element inside `event.tags` — do not spread into `tags`.
 */
export function arbRootTag(ownerPubHex, universeId) {
    return [TAG_ARB_ROOT, 'root', String(ownerPubHex || ''), String(universeId || '')];
}

/** Replaceable `d` for bundle header. */
export function bundleHeaderDTag(ownerPubHex, universeId) {
    return `arborito:bundle:hdr:${String(ownerPubHex)}:${String(universeId)}`;
}

export function bundleChunkDTag(ownerPubHex, universeId, slot, index) {
    return `arborito:bundle:chk:${String(ownerPubHex)}:${String(universeId)}:${String(slot)}:${String(index)}`;
}

export function directoryDTag(ownerPubHex, universeId) {
    return `arborito:dir:v2:${String(ownerPubHex)}:${String(universeId)}`;
}

export function revokeDTag(ownerPubHex, universeId) {
    return `arborito:revoke:${String(ownerPubHex)}:${String(universeId)}`;
}

export function treeCodeDTag(normalizedCode) {
    return `arborito:code:${String(normalizedCode)}`;
}

/** d-tag for QR signaling request (replaceable by temporary desktop pubkey). */
export function qrSignalDTag(tempPubkey) {
    return `arborito:qr:sig:${String(tempPubkey || '')}`;
}

/** d-tag for QR authorization response (references the session ID). */
export function qrAuthDTag(sessionId) {
    return `arborito:qr:auth:${String(sessionId || '')}`;
}

/** Logical deletion: publish KIND_UNIVERSE_REVOKE or NIP-09 — we use explicit revoke event + header tombstone in content. */
export const REVOKE_CONTENT_KIND = 'revoke_universe';
