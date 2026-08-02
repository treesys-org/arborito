/**
 * Tear down public Discover listings when a local/private course is deleted.
 *
 * Private account delete used to clear only the encrypted draft. If
 * `publishedNetworkUrl` was missing (typical after private restore), revoke +
 * directory delist never ran — share codes stayed live in Forest.
 */

import { formatNostrTreeUrl, parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { KIND_TREE_DIRECTORY } from '../../nostr/api/nostr-spec.js';
import { normalizeTreeShareCode } from '../../sources/api/share-code.js';
import { ensureConnectedNostr } from '../../../shared/lib/connected-services/index.js';
import { canonicalNetworkTreeUrlString } from '../../sources/api/modals/logic/sources-helpers.js';

/** @param {object | null | undefined} entry */
export function entryHasPublishHints(entry) {
    if (!entry || typeof entry !== 'object') return false;
    return !!(
        String(entry.publishedNetworkUrl || '').trim() ||
        String(entry.data?.meta?.publishedNetworkUrl || '').trim() ||
        String(entry.publishedShareCode || '').trim() ||
        String(entry.data?.meta?.shareCode || '').trim() ||
        String(entry.publishedSnapshot?.meta?.shareCode || '').trim()
    );
}

/**
 * @param {object | null | undefined} entry
 * @returns {string[]}
 */
function publishUrlCandidates(entry) {
    return [
        String(entry?.publishedNetworkUrl || '').trim(),
        String(entry?.data?.meta?.publishedNetworkUrl || '').trim(),
    ].filter(Boolean);
}

/**
 * @param {object | null | undefined} entry
 * @returns {string[]}
 */
function publishShareCodeCandidates(entry) {
    const raw = [
        entry?.publishedShareCode,
        entry?.data?.meta?.shareCode,
        entry?.publishedSnapshot?.meta?.shareCode,
    ];
    /** @type {string[]} */
    const out = [];
    const seen = new Set();
    for (const c of raw) {
        const norm = normalizeTreeShareCode(c);
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        out.push(norm);
    }
    return out;
}

/**
 * Resolve an owned public tree ref for revoke/delist on delete.
 * @param {object | null | undefined} entry
 * @param {{ getNostrPublisherPair?: Function, nostr?: object }} store
 * @returns {Promise<{ pub: string, universeId: string, shareCode?: string } | null>}
 */
export async function resolveOwnedPublicTreeRef(entry, store) {
    if (!entry || !store) return null;
    const getPair =
        typeof store.getNostrPublisherPair === 'function'
            ? store.getNostrPublisherPair.bind(store)
            : null;
    if (!getPair) return null;

    for (const url of publishUrlCandidates(entry)) {
        try {
            const ref = parseNostrTreeUrl(url);
            if (ref?.pub && ref?.universeId && getPair(ref.pub)?.priv) {
                return { pub: String(ref.pub), universeId: String(ref.universeId) };
            }
        } catch {
            /* next */
        }
    }

    const codes = publishShareCodeCandidates(entry);
    if (!codes.length) return null;

    try {
        await ensureConnectedNostr(store, { timeoutMs: 12000 });
    } catch {
        /* still try if nostr already set */
    }
    const net = store.nostr;
    if (!net) return null;

    for (const code of codes) {
        try {
            let ref = null;
            if (typeof net.resolveTreeShareCode === 'function') {
                ref = await net.resolveTreeShareCode(code);
            }
            /* Claim may outlive a partial revoke — still need pub/universe for delist. */
            if ((!ref || !ref.pub) && typeof net.loadCodeRecordOnce === 'function') {
                const raw = await net.loadCodeRecordOnce(code);
                if (raw && !raw.revoked) {
                    ref = {
                        pub: String(raw.ownerPub || raw.by || ''),
                        universeId: String(raw.universeId || ''),
                    };
                }
            }
            if (ref?.pub && ref?.universeId && getPair(ref.pub)?.priv) {
                return {
                    pub: String(ref.pub),
                    universeId: String(ref.universeId),
                    shareCode: code,
                };
            }
        } catch {
            /* next code */
        }
    }
    return null;
}

/**
 * Best-effort public teardown when deleting a local/private course.
 * Does not consult team-editor gates (those are for the active curriculum).
 * @param {object | null | undefined} entry
 * @param {object} store
 * @param {{ branchIdToUnlink?: string, treeIdToUnlink?: string, contentKind?: string }} [opts]
 * @returns {Promise<boolean>} true if revoke was attempted and reported ok
 */
export async function revokeOwnedPublicOnDelete(entry, store, opts = {}) {
    if (!entry || !store || typeof store._revokePublicTreeCore !== 'function') return false;
    if (!entryHasPublishHints(entry) && !opts.forceProbe) return false;
    try {
        const resolved = await resolveOwnedPublicTreeRef(entry, store);
        if (!resolved?.pub || !resolved?.universeId) return false;
        const result = await store._revokePublicTreeCore(
            { pub: resolved.pub, universeId: resolved.universeId },
            {
                branchIdToUnlink: opts.branchIdToUnlink || null,
                treeIdToUnlink: opts.treeIdToUnlink || null,
                contentKind: opts.contentKind || null,
                skipConfirm: true,
                silent: true,
            }
        );
        return !!result?.ok;
    } catch (e) {
        console.warn('[Arborito] revoke owned public on delete failed', e);
        return false;
    }
}

/**
 * @param {object} store
 * @returns {Set<string>} canonical nostr urls + share codes bound on this device
 */
export function collectLocalPublishBinds(store) {
    /** @type {Set<string>} */
    const binds = new Set();
    const branches = store?.userStore?.state?.branches || [];
    for (const b of branches) {
        for (const url of publishUrlCandidates(b)) {
            const canon = canonicalNetworkTreeUrlString(url) || url;
            if (canon) binds.add(canon);
        }
        for (const code of publishShareCodeCandidates(b)) binds.add(`code:${code}`);
    }
    const trees = store?.userStore?.state?.trees || [];
    for (const t of trees) {
        for (const url of publishUrlCandidates(t)) {
            const canon = canonicalNetworkTreeUrlString(url) || url;
            if (canon) binds.add(canon);
        }
        for (const code of publishShareCodeCandidates(t)) binds.add(`code:${code}`);
    }
    return binds;
}

/**
 * Delist owned Discover rows that no longer have a local publish bind.
 * Cleans ghosts left by the old private-delete path (e.g. #TD9J-634V).
 * Skips rows still bound on this device (multi-device: the device that still
 * has the course keeps the listing).
 *
 * Also queries the owner's own directory replaceables (not only the current
 * Discover page) so low-ranked ghosts are still torn down.
 *
 * @param {object} store
 * @param {object[]} directoryRows
 * @returns {Promise<{ count: number, keys: Set<string> }>}
 */
export async function sweepOwnedDiscoverGhosts(store, directoryRows) {
    /** @type {Set<string>} */
    const keys = new Set();
    if (!store || typeof store._revokePublicTreeCore !== 'function') {
        return { count: 0, keys };
    }
    if (typeof store.getNostrPublisherPair !== 'function') return { count: 0, keys };

    /** @type {object[]} */
    const rows = [...(Array.isArray(directoryRows) ? directoryRows : [])];

    try {
        await ensureConnectedNostr(store, { timeoutMs: 12000 });
        const net = store.nostr;
        const pubs = new Set();
        for (const r of rows) {
            const pub = String(r?.ownerPub || '').trim();
            if (pub && store.getNostrPublisherPair(pub)?.priv) pubs.add(pub);
        }
        /* Always include the signed-in network key even when the page has no hits. */
        try {
            const pair =
                (typeof store.ensureNetworkUserPair === 'function'
                    ? await store.ensureNetworkUserPair()
                    : null) || store.getNostrPublisherPair?.();
            if (pair?.pub && pair?.priv) pubs.add(String(pair.pub));
        } catch {
            /* ignore */
        }
        if (net && typeof net._query === 'function' && pubs.size) {
            for (const pub of pubs) {
                let evs = [];
                try {
                    evs = await net._query(
                        { kinds: [KIND_TREE_DIRECTORY], authors: [pub], limit: 200 },
                        8000
                    );
                } catch {
                    evs = [];
                }
                const latest =
                    typeof net._latestTreeDirectoryRowsFromEvents === 'function'
                        ? net._latestTreeDirectoryRowsFromEvents(evs || [])
                        : [];
                for (const { body } of latest) {
                    if (!body || body.delisted === true) continue;
                    rows.push({
                        ownerPub: String(body.ownerPub || pub),
                        universeId: String(body.universeId || ''),
                        shareCode: String(body.shareCode || ''),
                        updatedAt: String(body.updatedAt || ''),
                    });
                }
            }
        }
    } catch (e) {
        console.warn('[Arborito] owned Discover ghost author probe', e);
    }

    if (!rows.length) return { count: 0, keys };

    const binds = collectLocalPublishBinds(store);
    /** @type {Map<string, { pub: string, universeId: string, shareCode?: string }>} */
    const ghosts = new Map();
    /* Grace for multi-device: a just-published course may not be restored on
     * this device yet. Only tear down listings older than this window. */
    const minAgeMs = 48 * 60 * 60 * 1000;
    const now = Date.now();

    for (const r of rows) {
        const pub = String(r?.ownerPub || '').trim();
        const universeId = String(r?.universeId || '').trim();
        if (!pub || !universeId) continue;
        if (!store.getNostrPublisherPair(pub)?.priv) continue;
        let url = '';
        try {
            url = formatNostrTreeUrl(pub, universeId) || '';
        } catch {
            url = '';
        }
        const canon = url ? canonicalNetworkTreeUrlString(url) || url : '';
        const code = normalizeTreeShareCode(r?.shareCode);
        if (canon && binds.has(canon)) continue;
        if (code && binds.has(`code:${code}`)) continue;
        const updatedMs = Date.parse(String(r?.updatedAt || '')) || 0;
        if (updatedMs && now - updatedMs < minAgeMs) continue;
        const key = `${pub}/${universeId}`;
        if (!ghosts.has(key)) {
            ghosts.set(key, { pub, universeId, ...(code ? { shareCode: code } : {}) });
        }
    }

    if (!ghosts.size) return { count: 0, keys };
    let n = 0;
    for (const [key, ghost] of ghosts) {
        try {
            const result = await store._revokePublicTreeCore(
                { pub: ghost.pub, universeId: ghost.universeId },
                { skipConfirm: true, silent: true, contentKind: 'network' }
            );
            if (result?.ok) {
                n += 1;
                keys.add(key);
            }
        } catch (e) {
            console.warn('[Arborito] owned Discover ghost sweep failed', ghost, e);
        }
    }
    return { count: n, keys };
}
