import { parseNostrTreeUrl } from './nostr-refs.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';

/**
 * Team / governance hub view modes, single source for ContributorPanelBody routing.
 * @see contributor-hub-chrome.js, shell tokens
 */

/** @typedef {'localDraft' | 'localPublished' | 'networkOwner' | 'networkGuest' | 'noNetworkTree'} ContributorHubView */

/**
 * Resolve hub view from active branch context (ModalContributor shell + panel body).
 * @param {{
 *   activeSource?: { url?: string, shareCode?: string } | null,
 *   userStore?: { state?: { branches?: Array<{ id?: string, publishedNetworkUrl?: string }> } },
 *   getNostrPublisherPair?: (pub: string) => { priv?: string } | null,
 * }} input
 * @returns {ContributorHubView}
 */
export function resolveContributorHubViewFromSource({
    activeSource = null,
    userStore = null,
    getNostrPublisherPair = null,
} = {}) {
    const treeRef = parseNostrTreeUrl((activeSource && activeSource.url) || '');
    const isLocal = fileSystem.isLocal;
    const activeUrl = (activeSource && activeSource.url) || '';
    const localId =
        isLocal && String(activeUrl).startsWith('branch://')
            ? String(activeUrl).slice('branch://'.length)
            : '';
    const localEntry = localId ? userStore?.state?.branches?.find((t) => t.id === localId) : null;
    const localPublishedNetworkUrl =
        localEntry && typeof localEntry.publishedNetworkUrl === 'string'
            ? localEntry.publishedNetworkUrl.trim()
            : '';
    const publishedNetworkRef =
        localPublishedNetworkUrl && parseNostrTreeUrl(localPublishedNetworkUrl)
            ? parseNostrTreeUrl(localPublishedNetworkUrl)
            : null;
    const isOwnerFromUrl = !!(treeRef && getNostrPublisherPair?.(treeRef.pub)?.priv);
    const isPublishedLocalOwner = !!(
        publishedNetworkRef && getNostrPublisherPair?.(publishedNetworkRef.pub)?.priv
    );
    /* After publish, the active branch stays branch://; treat owner as networkOwner. */
    const effectiveTreeRef = treeRef || (isPublishedLocalOwner ? publishedNetworkRef : null);
    const effectiveIsOwner = isOwnerFromUrl || isPublishedLocalOwner;

    return resolveContributorHubView({
        isLocal,
        localPublishedNetworkUrl,
        treeRef: effectiveTreeRef,
        isOwner: effectiveIsOwner,
    });
}

/**
 * @param {{
 *   isLocal?: boolean,
 *   localPublishedNetworkUrl?: string,
 *   treeRef?: { pub: string, universeId: string } | null,
 *   isOwner?: boolean,
 * }} input
 * @returns {ContributorHubView}
 */
export function resolveContributorHubView({
    isLocal = false,
    localPublishedNetworkUrl = '',
    treeRef = null,
    isOwner = false,
} = {}) {
    const hasPublishedLocal = !!String(localPublishedNetworkUrl || '').trim();

    if (isLocal && !hasPublishedLocal) return 'localDraft';
    if (treeRef && isOwner) return 'networkOwner';
    if (treeRef) return 'networkGuest';
    if (hasPublishedLocal) return 'localPublished';
    return 'noNetworkTree';
}

/**
 * Intro copy for owner / guest views (avoids "paste below" when collab UI is hidden).
 * @param {ContributorHubView} view
 * @param {Record<string, string>} ui
 * @param {{ isTreeOwner?: boolean, myRole?: string | null }} ctx
 */
export function resolveContributorIntroText(view, ui, { isTreeOwner = false, myRole = null } = {}) {
    if (view === 'localDraft' || view === 'noNetworkTree') return '';

    if (view === 'networkGuest' && !isTreeOwner && !myRole && ui.governanceReaderNoRoleIntro) {
        return ui.governanceReaderNoRoleIntro;
    }

    if (view === 'networkGuest' && myRole === 'editor') {
        return '';
    }

    /* Owner sees labeled sections (share code, invite, list), skip redundant intro. */
    if ((view === 'localPublished' || view === 'networkOwner') && isTreeOwner) {
        return '';
    }

    return ui.governanceModalIntro || '';
}
