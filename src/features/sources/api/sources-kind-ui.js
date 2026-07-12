/**
 * Shared UI helpers for branch vs composed-tree (kind) across Biblioteca and switcher.
 */

/** @param {string} [contentKind] @param {string} [universeId] */
export function isComposedTreeListing(contentKind, universeId) {
    if (String(contentKind || '').trim() === 'composed-tree') return true;
    const id = String(universeId || '').trim();
    return id.startsWith('tre-');
}

/** @param {string} [contentKind] @param {string} [universeId] */
export function listingKind(contentKind, universeId) {
    return isComposedTreeListing(contentKind, universeId) ? 'composed-tree' : 'branch';
}

/** @param {'branch'|'composed-tree'} kind */
export function kindEmoji(kind) {
    return kind === 'composed-tree' ? '🌳' : '🌿';
}
