/** Strip HTML tags from locale strings (stale pack.json may still contain markup). */
export function stripHtmlForPlainText(s) {
    return String(s || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Copy above the forum switch in the publish hub footer, keep it short. */
export function buildPublishHubConfirmBody(store, { republish }) {
    const ui = store?.ui || {};
    const body = republish
        ? ui.publicTreeHubRepublishBody ||
          stripHtmlForPlainText(ui.publicTreeRepublishBody) ||
          'Updates the public copy. Links and share code stay the same.'
        : ui.publicTreeHubConfirmBody ||
          'This creates a public copy. Share only material you’re allowed to, with no personal data (more in About → Legal). After ~12 months unused it unpublishes itself (GDPR).';
    return { body: stripHtmlForPlainText(body) };
}

function activeComposedTreeEntry(store) {
    const treeId = String(store?.state?.activeSource?.treeId || '').trim();
    if (!treeId || store?.state?.activeSource?.type !== 'composed-tree') return null;
    return store.userStore?.getTree?.(treeId) || null;
}

/** Live forum option for hub dirty checks / defaults. */
export function liveIncludeForumForPublish(store) {
    const meta = store?.state?.rawGraphData?.meta;
    if (meta && Object.prototype.hasOwnProperty.call(meta, 'forumEnabled')) {
        return meta.forumEnabled === true;
    }
    const entry = activeComposedTreeEntry(store);
    if (entry?.publishedNetworkUrl) {
        return entry.publishedForumEnabled === true;
    }
    return false;
}

/**
 * Live Discover option for hub dirty checks / defaults.
 * Unset means listed (`!== false`), matching network directory behavior.
 */
export function liveListInDiscoverForPublish(store) {
    const meta = store?.state?.rawGraphData?.meta;
    if (meta && Object.prototype.hasOwnProperty.call(meta, 'listInDiscover')) {
        return meta.listInDiscover !== false;
    }
    const entry = activeComposedTreeEntry(store);
    if (entry?.publishedNetworkUrl) {
        return entry.publishedListInDiscover !== false;
    }
    return true;
}

/** Forum switch default: match live published options (off when unset). */
export function defaultIncludeForumForPublish(store) {
    return liveIncludeForumForPublish(store);
}

/** Discover switch default: match live published options. */
export function defaultListInDiscoverForPublish(store) {
    return liveListInDiscoverForPublish(store);
}

/** Whether the active local source already has a published network copy we can update. */
export function isRepublishForActiveSource(store) {
    if (!store) return false;
    if (store.canRetractActivePublicUniverse?.()) return true;
    const ref = store.getPublishedTreeRefForActiveLocalSource?.();
    return !!(ref && store.getNostrPublisherPair?.(ref.pub)?.priv);
}
