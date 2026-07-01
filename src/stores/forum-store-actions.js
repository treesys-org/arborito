import { getArboritoStore } from '../core/store-singleton.js';
import { storeNostrForumMethods } from './forum-nostr-store-actions.js';
import { selfDeleteNostrForumAccountAction as selfDeleteNostrForumAccountCommunityAction } from './nostr-community-store-actions.js';

const FORUM_METHOD_NAMES = [
    'canModerateForum',
    'hydrateTreeForumIfNeeded',
    'ensureTreeForumPlaceLoaded',
    'ensureTreeForumThreadLoaded',
    'ensureTreeForumThreadWeekLoaded',
    'getLoadedForumThreadWeeks',
    'getTreeForumThreadWeeks',
    'searchTreeForumV3',
    'getForumModerationModeForActiveTree',
    'listForumPendingSummariesForActiveTree',
    'setForumModerationPolicyMode',
    'approveForumPendingMessage',
    'rejectForumPendingMessage',
    'addForumThread',
    'addForumMessage',
    'setForumBanForActiveTree',
    'selfDeleteForumMessage',
    'moderateDeleteForumMessage',
    'moderateDeleteForumThread',
];

function forumCall(method) {
    return function (...args) {
        const fn = storeNostrForumMethods[method];
        return typeof fn === 'function' ? fn(...args) : undefined;
    };
}

/**
 * @param {{ threadId?: string|null, placeId?: string|null, mobilePanel?: string, draft?: string, replyParentId?: string|null }} snap
 */
export function stashForumShellBeforeDialogAction(snap) {
    const store = getArboritoStore();
    if (store) store._forumShellSnapshot = snap;
}

export function consumeForumShellSnapshotAction() {
    const store = getArboritoStore();
    if (!store) return null;
    const s = store._forumShellSnapshot;
    store._forumShellSnapshot = null;
    return s || null;
}

export function getForumStoreAction() {
    return getArboritoStore()?.forumStore ?? null;
}

export function loadForumBansV3Action(opts) {
    const store = getArboritoStore();
    return store?.nostr?.loadForumBansV3?.(opts);
}

export function selfDeleteNostrForumAccountAction(sourceId) {
    return selfDeleteNostrForumAccountCommunityAction(sourceId);
}

/** @type {Record<string, Function>} */
const forumDelegates = {};
for (const name of FORUM_METHOD_NAMES) {
    forumDelegates[name] = forumCall(name);
}

/** Forum actions for hooks — bound store-context delegates from `forum-nostr-store-actions.js`. */
export const forumActions = {
    ...forumDelegates,
    stashForumShellBeforeDialog: stashForumShellBeforeDialogAction,
    consumeForumShellSnapshot: consumeForumShellSnapshotAction,
    getForumStore: getForumStoreAction,
    loadForumBansV3: loadForumBansV3Action,
    selfDeleteNostrForumAccount: selfDeleteNostrForumAccountAction,
};
