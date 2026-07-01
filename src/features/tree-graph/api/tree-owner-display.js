/**
 * Shared labels for tree owner / author across presentation, readme, Sage, and Sources.
 * Priority: stored authorName (published metadata) → forum display name → Anon-XXXXXX.
 */

/** Username from the active online account session (sync-login). */
export function currentOnlineAccountUsername(store) {
    return String(store.authSession?.username || '').trim();
}

/** Author name saved in universePresentation when the tree was published/edited. */
export function storedTreeAuthorName(store) {
    const pres = store.value?.rawGraphData?.universePresentation;
    return String(pres?.authorName || '').trim();
}

/** Best-effort display name from forum messages for a Nostr pubkey. */
export function forumDisplayNameForPub(store, pub) {
    try {
        const p = String(pub || '');
        if (!p) return '';
        const fs = store.forumStore;
        const src = store.value.activeSource;
        const snap = fs && src && src.id && typeof fs.getSnapshot === 'function' ? fs.getSnapshot(src.id) : null;
        const msgs = snap && Array.isArray(snap.messages) ? snap.messages : [];
        for (let i = msgs.length - 1; i >= 0; i--) {
            const m = msgs[i];
            if (m?.author?.pub === p && m.author.name && String(m.author.name).trim()) {
                return String(m.author.name).trim();
            }
        }
    } catch {
        /* forum unavailable */
    }
    return '';
}

/** Anonymous directory fallback when no published or forum name exists. */
export function anonOwnerLabel(ownerPub) {
    const p = String(ownerPub || '');
    return p ? `Anon-${p.slice(0, 6)}` : '';
}

/**
 * Owner label for the currently open tree (map card, readme, Sage).
 * @returns {{ label: string, sub: string }}
 */
export function resolveOpenTreeOwnerDisplay(store, ownerPub) {
    const pub = String(ownerPub || '').trim();
    const stored = storedTreeAuthorName(store);
    if (stored) {
        return {
            label: stored,
            sub: pub ? `${pub.slice(0, 6)}…${pub.slice(-4)}` : ''
        };
    }
    if (pub) {
        const forum = forumDisplayNameForPub(store, pub);
        const short = `${pub.slice(0, 6)}…${pub.slice(-4)}`;
        if (forum) return { label: forum, sub: short };
        return { label: anonOwnerLabel(pub), sub: short };
    }
    const session = currentOnlineAccountUsername(store);
    if (session) return { label: session, sub: '' };
    return { label: '', sub: '' };
}

/**
 * Author line for directory / saved-tree rows (metadata from index, tree may be closed).
 */
export function resolveDirectoryAuthorLabel(row = {}) {
    const authorName = String(row.authorName || '').trim();
    if (authorName) return authorName;
    const pub = String(row.ownerPub || '').trim();
    if (pub) return anonOwnerLabel(pub);
    return '';
}
