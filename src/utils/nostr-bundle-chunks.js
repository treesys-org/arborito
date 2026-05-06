/**
 * Nostr publish format v2 (no legacy): aggressive sharding of the main `bundle`.
 * - Lessons → chunks.lessons
 * - Version snapshots (graphs) → chunks.snapshots
 * - Search index (titles + descriptions + body snippet) → chunks.search
 * - Package forum: empty in `bundle`; sharded snapshot in `chunks.forum.*` (lazy load when opening forum)
 * - Package progress cleared (per-user progress in `progress.users.*`)
 * - No searchIndex / forum embedded in tree
 */

import { flattenTreeSearchEntriesWithLessonBody } from './search-index-core.js';

/** Messages per node under chunks.forum (avoids huge puts). */
export const NOSTR_FORUM_MESSAGE_CHUNK = 200;

function safeKeyPart(s) {
    return String(s != null ? s : '').replace(/[^a-zA-Z0-9:_-]/g, '_');
}

/** @param {string} nodeId */
export function nostrMainLessonChunkKey(nodeId) {
    return `m__${safeKeyPart(nodeId)}`;
}

/** @param {string} snapshotId @param {string} nodeId */
export function nostrSnapshotLessonChunkKey(snapshotId, nodeId) {
    return `s__${safeKeyPart(snapshotId)}__${safeKeyPart(nodeId)}`;
}

/** @param {string} snapshotId */
export function nostrSnapshotGraphChunkKey(snapshotId) {
    return `snap__${safeKeyPart(snapshotId)}`;
}

/**
 * @param {unknown} node
 * @param {Record<string, { content: string }>} lessonChunks
 * @param {(nodeId: string) => string} makeKey
 * @param {WeakSet<object>} seen — prevents infinite recursion if `children` forms a cycle (corrupt tree).
 */
function walkTreeNode(node, lessonChunks, makeKey, seen) {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    const t = node.type;
    if ((t === 'leaf' || t === 'exam') && typeof node.content === 'string' && node.content.length > 0) {
        const key = makeKey(node.id);
        lessonChunks[key] = { content: node.content };
        node.content = '';
        node.treeLazyContent = true;
        node.treeContentKey = key;
    } else {
        delete node.treeLazyContent;
        delete node.treeContentKey;
    }
    if (Array.isArray(node.children)) {
        for (const ch of node.children) {
            walkTreeNode(ch, lessonChunks, makeKey, seen);
        }
    }
}

/**
 * @param {object} rawGraph — `languages` + optional `releaseSnapshots`
 * @param {Record<string, { content: string }>} lessonChunks
 */
function stripLanguagesAndSnapshots(rawGraph, lessonChunks) {
    const seen = new WeakSet();
    const langs = rawGraph.languages;
    if (langs && typeof langs === 'object') {
        for (const lk of Object.keys(langs)) {
            walkTreeNode(langs[lk], lessonChunks, nostrMainLessonChunkKey, seen);
        }
    }
    const snaps = rawGraph.releaseSnapshots;
    if (snaps && typeof snaps === 'object') {
        for (const snapId of Object.keys(snaps)) {
            const snap = snaps[snapId];
            if (!snap || typeof snap !== 'object') continue;
            const sl = snap.languages;
            if (sl && typeof sl === 'object') {
                for (const lk of Object.keys(sl)) {
                    walkTreeNode(sl[lk], lessonChunks, (nodeId) => nostrSnapshotLessonChunkKey(snapId, nodeId), seen);
                }
            }
        }
    }
}

/**
 * Replaces each full snapshot with `{ treeSnapshotRef }` and copies the graph into snapshotChunks.
 * Must run after stripLanguagesAndSnapshots (bodies already in lessonChunks).
 */
/**
 * @param {object} tree — rawGraph with `languages` and lesson content still present
 * @returns {object[]}
 */
/**
 * @param {object} forumObj
 * @returns {{ meta: object, threads: object[], moderationLog: object[], messageParts: object[][] }}
 */
export function splitForumForNostrChunks(forumObj) {
    const fo = forumObj && typeof forumObj === 'object' ? forumObj : {};
    const threads = Array.isArray(fo.threads) ? fo.threads : [];
    const messages = Array.isArray(fo.messages) ? fo.messages : [];
    const moderationLog = Array.isArray(fo.moderationLog) ? fo.moderationLog : [];
    const messageParts = [];
    for (let i = 0; i < messages.length; i += NOSTR_FORUM_MESSAGE_CHUNK) {
        messageParts.push(messages.slice(i, i + NOSTR_FORUM_MESSAGE_CHUNK));
    }
    if (messageParts.length === 0) messageParts.push([]);
    return {
        meta: {
            version: 1,
            threadCount: threads.length,
            messageCount: messages.length,
            messageParts: messageParts.length
        },
        threads,
        moderationLog,
        messageParts
    };
}

function collectSearchEntriesFromTree(tree) {
    const all = [];
    const langs = tree.languages;
    if (!langs || typeof langs !== 'object') return all;
    for (const lk of Object.keys(langs)) {
        const root = langs[lk];
        const langU = String(lk).toUpperCase().slice(0, 8);
        all.push(...flattenTreeSearchEntriesWithLessonBody(root, langU));
    }
    return all;
}

function offloadReleaseSnapshotsToChunks(tree, snapshotChunks) {
    const rs = tree.releaseSnapshots;
    if (!rs || typeof rs !== 'object') return;
    const placeholder = {};
    for (const id of Object.keys(rs)) {
        const snap = rs[id];
        if (!snap || typeof snap !== 'object') continue;
        const key = nostrSnapshotGraphChunkKey(id);
        snapshotChunks[key] = snap;
        placeholder[id] = { treeSnapshotRef: key };
    }
    tree.releaseSnapshots = placeholder;
}

/**
 * @param {object} bundle — arborito-bundle shape
 * @returns {{
 *   slimBundle: object,
 *   lessonChunks: Record<string, { content: string }>,
 *   snapshotChunks: Record<string, object>,
 *   searchPack: { version: number, entries: object[] },
 *   forumSplit: ReturnType<typeof splitForumForNostrChunks>
 * }}
 */
export function prepareNostrSplitBundleV2(bundle) {
    const slimBundle = JSON.parse(JSON.stringify(bundle));
    const lessonChunks = {};
    const snapshotChunks = {};

    if (slimBundle.tree && typeof slimBundle.tree === 'object') {
        delete slimBundle.tree.searchIndex;
        delete slimBundle.tree.forum;
    }

    const forumSplit = splitForumForNostrChunks(
        slimBundle.forum && typeof slimBundle.forum === 'object' ? slimBundle.forum : {}
    );

    // Nostr bundle warns on arrays inside objects; the actual forum data is published in chunks.forum.* anyway.
    // Keep a tiny stub in the main bundle for backwards compatibility.
    slimBundle.forum = { version: 1 };

    slimBundle.progress = {
        completedNodes: [],
        memory: {},
        bookmarks: {},
        gamification: {},
        gameData: {}
    };

    /** Before stripping lessons: capture search entries that include body text. */
    const searchEntries =
        slimBundle.tree && typeof slimBundle.tree === 'object'
            ? collectSearchEntriesFromTree(slimBundle.tree)
            : [];

    if (slimBundle.tree && typeof slimBundle.tree === 'object') {
        stripLanguagesAndSnapshots(slimBundle.tree, lessonChunks);
        offloadReleaseSnapshotsToChunks(slimBundle.tree, snapshotChunks);
    }

    slimBundle.meta = slimBundle.meta && typeof slimBundle.meta === 'object' ? { ...slimBundle.meta } : {};
    slimBundle.meta.nostrBundleFormat = 2;
    const nLessons = Object.keys(lessonChunks).length;
    const nSnapshots = Object.keys(snapshotChunks).length;
    slimBundle.meta.nostrLessonChunksCount = nLessons;
    slimBundle.meta.nostrSnapshotChunksCount = nSnapshots;
    slimBundle.meta.nostrSearchEntryCount = searchEntries.length;
    slimBundle.meta.nostrForumMessageParts = forumSplit.meta.messageParts;

    const searchPack = { version: 1, entries: searchEntries };

    return { slimBundle, lessonChunks, snapshotChunks, searchPack, forumSplit };
}
