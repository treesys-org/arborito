/** Generated from nostr_spec/spec.json — do not edit by hand. */

export const KIND_TREE_DIRECTORY = 30100;
export const KIND_DIRECTORY_BUMP = 30101;
export const KIND_DIRECTORY_INDEX_SNAPSHOT = 30102;
export const KIND_APP_SIGNED_PAYLOAD = 30103;
export const KIND_BUNDLE_HEADER = 30150;
export const KIND_BUNDLE_CHUNK_JSON = 30151;
export const KIND_UNIVERSE_REVOKE = 30160;
export const KIND_TREE_CODE = 30170;
export const KIND_USER_ACCOUNT_RECORD = 30241;
export const KIND_FORUM_BUCKET = 30263;
export const KIND_PRESENCE_PING = 30280;
export const KIND_USER_PROGRESS = 30290;
export const KIND_USER_SOURCES = 30291;
export const KIND_PRIVATE_TREE_BLOB = 30292;
export const KIND_ACCOUNT_USER_PAIR_ESCROW = 30293;
export const KIND_TREE_LEADERBOARD = 30294;
export const KIND_ACCOUNT_RECOVERY = 30295;

export const NOSTR_CHUNK_CONTENT_MAX = 14000;
export const PRIVATE_TREE_NIP44_PLAINTEXT_MAX = 10000;

export const TAG_APP = 'app';
export const TAG_APP_VALUE = 'arborito';
export const TAG_ARB_ROOT = 'arb';

export function arbRootTag(ownerPubHex, universeId) {
    return [TAG_ARB_ROOT, 'root', String(ownerPubHex || ''), String(universeId || '')];
}

export function bundleHeaderDTag(ownerPubHex, universeId) {
    return `arborito:bundle:hdr:${String(ownerPubHex)}:${String(universeId)}`;
}

export function bundleMainChunkDTag(ownerPubHex, universeId, index) {
    return `arborito:bundle:main:${String(ownerPubHex)}:${String(universeId)}:${Number(index)}`;
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

export function accountEscrowDTag(username) {
    return `arborito:account:escrow:${String(username || '').trim().toLowerCase()}`;
}

export function accountSyncLoginDTag(username) {
    return `arborito:account:sync-login:${String(username || '').trim().toLowerCase()}`;
}

export function accountIdentityDTag(username) {
    return `arborito:account:identity:${String(username || '').trim().toLowerCase()}`;
}

export function accountNetworkPubDTag(username) {
    return `arborito:account:network-pub:${String(username || '').trim().toLowerCase()}`;
}

export function accountRecoveryDTag(username) {
    return `arborito:account:recovery:${String(username || '').trim().toLowerCase()}`;
}

export function userSourcesDTag(username) {
    return `arborito:user:sources:${String(username || '').trim().toLowerCase()}`;
}

export function privateTreeDTag(username, treeId) {
    return `arborito:user:privtree:${String(username || '').trim().toLowerCase()}:${String(treeId || '')}`;
}

export function privateTreePartDTag(username, treeId, partIndex) {
    return `arborito:user:privtree:${String(username || '').trim().toLowerCase()}:${String(treeId || '')}:p:${Math.max(0, Math.floor(Number(partIndex)) || 0)}`;
}

export function treeLeaderboardDTag(userPubHex, weekKey) {
    return `arborito:leaderboard:${String(userPubHex || '')}:${String(weekKey || '')}`;
}

export function searchPackDTag(pub, universeId) {
    return `arborito:search:${String(pub)}:${String(universeId)}:v1`;
}

export function searchPackChunkDTag(pub, universeId, index) {
    return `arborito:search:${String(pub)}:${String(universeId)}:v1:c:${Math.max(0, Math.floor(Number(index)) || 0)}`;
}

export function forumPackDTag(pub, universeId) {
    return `arborito:forum:${String(pub)}:${String(universeId)}:v1`;
}

export function forumPackChunkDTag(pub, universeId, index) {
    return `arborito:forum:${String(pub)}:${String(universeId)}:v1:c:${Math.max(0, Math.floor(Number(index)) || 0)}`;
}

export function userSourcesPartDTag(username, partIndex) {
    return `arborito:user:sources:${String(username || '').trim().toLowerCase()}:p:${Math.max(0, Math.floor(Number(partIndex)) || 0)}`;
}

export function directoryIndexChunkDTag(slot, index) {
    return `arborito:diridx:${String(slot)}:v1:c:${Math.max(0, Math.floor(Number(index)) || 0)}`;
}

