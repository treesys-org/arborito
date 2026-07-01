/**
 * Arborito Nostr application spec (kinds 30000–39999, replaceable where noted).
 * @see https://github.com/nostr-protocol/nips/blob/master/33.md
 */

/** Global tree directory row (replaceable per publisher+tree). */
export const KIND_TREE_DIRECTORY = 30100;

/** Directory "bump" for indexer recency (normal event, append). */
export const KIND_DIRECTORY_BUMP = 30101;

/** Aggregator snapshot (trusted publishers only). */
export const KIND_DIRECTORY_INDEX_SNAPSHOT = 30102;

/** Signed JSON payload carrier (SEA replacement: verifyEvent + JSON.parse(content)). */
export const KIND_APP_SIGNED_PAYLOAD = 30103;

/** Bundle header (replaceable NIP-33). */
export const KIND_BUNDLE_HEADER = 30150;

/** Bundle JSON chunk (ordered; references header id in `e` root tag). */
export const KIND_BUNDLE_CHUNK_JSON = 30151;

/** Universe revocation marker (replaceable). */
export const KIND_UNIVERSE_REVOKE = 30160;

/** Share code → tree mapping (replaceable by `d` = normalized code). */
export const KIND_TREE_CODE = 30170;

/**
 * Per-username account record (replaceable NIP-33, sub-typed via `d` tag):
 *   - `arborito:account:sync-login:<user>` — hashed sync secret.
 *   - `arborito:account:identity:<user>` — signed username ↔ DID claim.
 */
export const KIND_USER_ACCOUNT_RECORD = 30241;

/** Forum v3 bucket storage (threads, pages, bans, pending). */
export const KIND_FORUM_BUCKET = 30263;

/** Presence heartbeat (ephemeral-ish; clients ignore >90s). */
export const KIND_PRESENCE_PING = 30280;

/** User progress sync blob per user. */
export const KIND_USER_PROGRESS = 30290;

/** Opt-in weekly leaderboard row for a public tree (replaceable per user + week). */
export const KIND_TREE_LEADERBOARD = 30294;

/** User's encrypted installed-sources list (per username, replaceable). */
export const KIND_USER_SOURCES = 30291;

/** User's encrypted private tree blob (replaceable by username + tree id). */
export const KIND_PRIVATE_TREE_BLOB = 30292;

/**
 * Account user-pair escrow: passphrase-encrypted Nostr user pair stored under
 * the username so a fresh device can recover it via sync-secret alone.
 */
export const KIND_ACCOUNT_USER_PAIR_ESCROW = 30293;

/** Max UTF-8 length of `content` per chunk after compression (conservative for relays). */
export const NOSTR_CHUNK_CONTENT_MAX = 14000;

/** Tag names */
export const TAG_APP = 'app';
export const TAG_APP_VALUE = 'arborito';

const TAG_ARB_ROOT = 'arb';
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

export function directoryDTag(ownerPubHex, universeId) {
    return `arborito:dir:v2:${String(ownerPubHex)}:${String(universeId)}`;
}

export function revokeDTag(ownerPubHex, universeId) {
    return `arborito:revoke:${String(ownerPubHex)}:${String(universeId)}`;
}

export function treeCodeDTag(normalizedCode) {
    return `arborito:code:${String(normalizedCode)}`;
}

/** Replaceable `d` for user account escrow (per-username). */
export function accountEscrowDTag(username) {
    return `arborito:account:escrow:${String(username || '').trim().toLowerCase()}`;
}

/** Replaceable `d` for sync-login hash (per-username). Indexed by relays (NIP-33). */
export function accountSyncLoginDTag(username) {
    return `arborito:account:sync-login:${String(username || '').trim().toLowerCase()}`;
}

/** Replaceable `d` for signed identity claim (per-username). */
export function accountIdentityDTag(username) {
    return `arborito:account:identity:${String(username || '').trim().toLowerCase()}`;
}

/** Replaceable `d` for the user's installed sources list (per-username). */
export function userSourcesDTag(username) {
    return `arborito:user:sources:${String(username || '').trim().toLowerCase()}`;
}

/** Replaceable `d` for a private tree blob (per-username + local tree id). */
export function privateTreeDTag(username, treeId) {
    return `arborito:user:privtree:${String(username || '').trim().toLowerCase()}:${String(treeId || '')}`;
}

/** Replaceable weekly leaderboard snapshot (per tree + user + ISO week). */
export function treeLeaderboardDTag(userPubHex, weekKey) {
    return `arborito:leaderboard:${String(userPubHex || '')}:${String(weekKey || '')}`;
}
