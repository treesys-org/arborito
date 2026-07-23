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
    const ui = store.ui || {};
    const body = republish
        ? ui.publicTreeHubRepublishBody ||
          stripHtmlForPlainText(ui.publicTreeRepublishBody) ||
          'Updates the public copy. Links and share code stay the same.'
        : ui.publicTreeHubConfirmBody ||
          'You will publish a copy online. Do not include private data.';
    return { body: stripHtmlForPlainText(body) };
}

export function defaultIncludeForumForPublish(store, republish) {
    if (republish) {
        return store.state.rawGraphData?.meta?.forumEnabled === true;
    }
    return false;
}

/** Default Discover listing switch in the publish hub (always on; user can opt out). */
export function defaultListInDiscoverForPublish() {
    return true;
}

/** Whether the active local source already has a published network copy we can update. */
export function isRepublishForActiveSource(store) {
    if (!store) return false;
    if (store.canRetractActivePublicUniverse?.()) return true;
    const ref = store.getPublishedTreeRefForActiveLocalSource?.();
    return !!(ref && store.getNostrPublisherPair?.(ref.pub)?.priv);
}
