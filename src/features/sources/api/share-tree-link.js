import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { copyTextToClipboard } from '../../../shared/lib/copy-text.js';
import { getAliasForUrl } from './tree-aliases.js';
import { formatNostrTreeUrl, parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { buildPublicShareAppUrl } from '../../../shared/lib/public-app-url.js';

function sharePageUrl(sourceParam) {
    return buildPublicShareAppUrl(`?source=${encodeURIComponent(sourceParam)}`);
}

/** @param {{ url?: string, shareCode?: string, ownerPub?: string, universeId?: string }} input */
export function buildTreeShareLink(input = {}) {
    const url = String(input.url || '').trim();
    if (url.startsWith('branch://') || url.startsWith('tree://')) return null;
    const sc = String(input.shareCode || '').trim();
    let sourceParam = sc;
    if (!sourceParam && url) {
        sourceParam = getAliasForUrl(url) || url;
    }
    if (!sourceParam) {
        const pub = String(input.ownerPub || '').trim();
        const uid = String(input.universeId || '').trim();
        if (pub && uid) {
            try {
                const nostrUrl = formatNostrTreeUrl(pub, uid);
                sourceParam = getAliasForUrl(nostrUrl) || nostrUrl;
            } catch {
                return null;
            }
        }
    }
    if (!sourceParam) return null;
    return sharePageUrl(sourceParam);
}

/** @param {object} treeEntry - composed tree row from userStore */
export function buildComposedTreeShareLink(treeEntry) {
    if (!treeEntry?.publishedNetworkUrl) return null;
    const ref = parseNostrTreeUrl(String(treeEntry.publishedNetworkUrl));
    return buildTreeShareLink({
        url: treeEntry.publishedNetworkUrl,
        shareCode: treeEntry.publishedShareCode || '',
        ownerPub: ref?.pub || '',
        universeId: ref?.universeId || '',
    });
}

/** @returns {string|null} Shareable URL for the active tree, or null if local-only / missing. */
export function buildActiveTreeShareLink() {
    const src = store.value.activeSource;
    if (!src) return null;
    if (src.type === 'composed-tree') {
        const entry = store.userStore.getTree(src.treeId);
        return entry ? buildComposedTreeShareLink(entry) : null;
    }
    return buildTreeShareLink({
        url: src.url,
        shareCode: src.shareCode,
    });
}

export function canShareActiveTree() {
    return !!buildActiveTreeShareLink();
}

async function deliverShareLink(link, name) {
    const ui = store.ui;
    if (!link) {
        store.notify(
            ui.sourcesShareLocalOnly ||
                'Publish this tree on the network first to get a share link.',
            true
        );
        return;
    }
    const treeName = String(name || 'Arborito').trim();
    const shareText = String(ui.sourcesShareText || 'Learn with me on Arborito: {name}').replace(/\{name\}/g, treeName);

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
            await navigator.share({ title: treeName, text: shareText, url: link });
            return;
        } catch (e) {
            if (e && e.name === 'AbortError') return;
        }
    }

    if (await copyTextToClipboard(link)) {
        store.notify(ui.sourcesShareCopied || 'Share link copied to clipboard.');
        return;
    }

    store.notify(link);
}

/** Web Share API on mobile when available; otherwise clipboard. */
export async function shareActiveTree() {
    const link = buildActiveTreeShareLink();
    const name = String(store.value.activeSource?.name || 'Arborito').trim();
    await deliverShareLink(link, name);
}

/** Share a specific tree row (Sources modal). */
export async function shareTreeLink(input = {}) {
    const link = buildTreeShareLink(input);
    const name = String(input.name || 'Arborito').trim();
    await deliverShareLink(link, name);
}

/** Share a composed tree playlist by local id. */
export async function shareComposedTree(treeId) {
    const entry = store.userStore.getTree(String(treeId || '').trim());
    if (!entry) return;
    const link = buildComposedTreeShareLink(entry);
    await deliverShareLink(link, entry.name);
}
