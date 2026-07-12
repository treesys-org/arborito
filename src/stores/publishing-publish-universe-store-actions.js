import { getArboritoStore } from '../core/store-singleton.js';
import { isNostrNetworkAvailable, parseNostrTreeUrl, formatNostrTreeUrl, createNostrPair } from '../features/nostr/api/nostr-refs.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { generateTreeShareCode } from '../features/sources/api/share-code.js';
import { randomUUIDSafe } from '../shared/lib/secure-web-crypto.js';
import { ensureConnectedNostr } from '../shared/lib/connected-services/index.js';
import { yieldToPaint } from '../shared/lib/yield-to-paint.js';
import {
    bumpInactivityPolicy,
    createInitialInactivityPolicy,
    getInactivityPolicyFromMeta,
} from '../features/publishing/api/inactivity-lifetime.js';
import { usesGlobalDirectoryPointerForTorrent } from '../features/p2p-webtorrent/api/global-directory-torrent-runtime.js';
import { escHtml as esc, escHtml as escAttr } from '../shared/lib/html-escape.js';

import { buildArboritoTreeBundleObject } from '../features/forest/api/arborito-tree-bundle.js';
import { computeBranchSetHash } from '../features/forest/api/branch-set-hash.js';
import { buildComposedTreeExportAttribution } from '../shared/lib/arborito-attribution.js';
import { shell } from './publishing-publish-revoke-helpers.js';
import { requireSignInDialog } from '../features/publishing/api/account-hub-gate.js';

export async function publishActiveTreeToNostrUniverseAction({
    universeId = null,
    reuseNostrTreeUrl = null,
    includeForum = false,
    listInDiscover = true,
} = {}) {
    const store = shell();
    if (!store) return undefined;
    if (store.state.activeSource?.type === 'composed-tree') {
        return store.publishComposedTreeToNostr({
            treeId: store.state.activeSource.treeId,
            universeId,
            reuseNostrTreeUrl,
            includeForum,
            listInDiscover,
        });
    }
    const ui = store.ui;
    const bundle = store.buildArboritoBundleObject();
    if (!bundle) {
        store.notify(ui.forumNoTree || 'No tree loaded.', true);
        return null;
    }
    if (!isNostrNetworkAvailable()) {
        store.notify(
        ui.nostrNotLoadedHint ||
        'Nostr relays unavailable (see index.html). Configure relays and reload to publish.',
        true
        );
        return null;
    }
    await ensureConnectedNostr(store);
    if (!store.nostr?.hasConfiguredRelays?.()) {
        store.notify(
            ui.nostrRelaysRequired ||
                'Configure at least one relay in Profile or accept the network during onboarding to use online features.',
            true
        );
        return null;
    }
    // GDPR/minimization: public universes should not ship learner progress or usernames.
    bundle.progress = { completedNodes: [], memory: {}, bookmarks: {}, gamification: {}, gameData: {} };

    const activeTreeRef = store.getActivePublicTreeRef();
    const reuseRef = reuseNostrTreeUrl ? parseNostrTreeUrl(reuseNostrTreeUrl) : null;
    const publishedLocalRef = (store.getPublishedTreeRefForActiveLocalSource && store.getPublishedTreeRefForActiveLocalSource()) || null;
    const effectiveRef = reuseRef || activeTreeRef || publishedLocalRef;
    const adminPair = effectiveRef ? store.getNostrPublisherPair(effectiveRef.pub) : null;
    const republish =
    !!effectiveRef &&
    !!(adminPair && adminPair.priv) &&
    String(adminPair.pub) === String(effectiveRef.pub);

    let pair;
    let id;
    let shareCode = null;

    if (republish) {
        pair = adminPair;
        id = String(universeId || effectiveRef.universeId);
        const srcUrl = String(store.state.activeSource?.url || '');
        const localId = srcUrl.startsWith('branch://') ? srcUrl.slice('branch://'.length).split('/')[0] : '';
        shareCode = String(
            bundle.meta?.shareCode ||
                (localId ? store.userStore.getBranchPublishedShareCode?.(localId) : '') ||
                ''
        ).trim() || null;
        if (shareCode) bundle.meta.shareCode = shareCode;
    } else {
    try {
        pair = await createNostrPair();
    } catch (e) {
    console.warn(e);
    store.notify(
    store.ui.nostrIdentityUnavailable || 'Publishing needs HTTPS or localhost for crypto on store browser.',
    true
    );
    return null;
    }
    id = String(universeId || `brn-${randomUUIDSafe()}`);
    for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = generateTreeShareCode();
        const taken = await store.nostr.loadCodeRecordOnce(candidate);
        if (!taken) {
            shareCode = candidate;
            break;
        }
    }
    if (!shareCode) {
        store.notify(ui.publicTreeCodeAllocFailed || 'Could not allocate a share code. Try again.', true);
        return null;
    }
    bundle.meta = bundle.meta && typeof bundle.meta === 'object' ? bundle.meta : {};
    bundle.meta.shareCode = shareCode;
    }

    bundle.meta = bundle.meta && typeof bundle.meta === 'object' ? bundle.meta : {};
    bundle.meta.forumEnabled = !!includeForum;
    if (!includeForum) {
        bundle.forum = { version: 1, threads: [], messages: [], moderationLog: [] };
    }
    bundle.meta.inactivityPolicy = republish
        ? bumpInactivityPolicy(getInactivityPolicyFromMeta(bundle.meta))
        : createInitialInactivityPolicy();
    bundle.meta.listInDiscover = !!listInDiscover;

    await yieldToPaint();
    await store.nostr.publishBundle({ pair, universeId: id, bundle, includeForum: !!includeForum });

    if (listInDiscover) {
    // Global directory (metadata-only): let others discover store tree without indexing content.
    try {
        /* Bundled tree shape is `{ languages: { EN: {...}, ES: {...} } }`. We surface the
        * declared language keys in the directory meta so the Trees picker can show language
        * pills before the user installs the bundle (they were missing previously). Cheap to
        * derive, bundle.tree is already a deep copy at store point. */
        const langKeys =
        bundle && bundle.tree && bundle.tree.languages && typeof bundle.tree.languages === 'object'
        ? Object.keys(bundle.tree.languages)
        : [];
        await store.nostr.putGlobalTreeDirectoryEntry({
            pair,
            universeId: id,
            title: String(((bundle && bundle.meta) ? bundle.meta.title : undefined) || ((bundle && bundle.meta) ? bundle.meta.universeName : undefined) || 'Arborito'),
            shareCode: String(((bundle && bundle.meta) ? bundle.meta.shareCode : undefined) || shareCode || ''),
            description: String(((bundle && bundle.meta) ? bundle.meta.description : undefined) || '').trim(),
            authorName: String(((bundle && bundle.meta) ? bundle.meta.authorName : undefined) || '').trim(),
            languages: langKeys,
            contentKind: 'branch',
            forkOfUrl: String(bundle?.meta?.attribution?.forkOf?.treeUrl || bundle?.tree?.universePresentation?.forkOf?.treeUrl || '').trim() || undefined,
            recommendedRelays: Array.isArray((store.nostr && store.nostr.peers)) ? store.nostr.peers : null
        });
        try {
            const forkOf =
            bundle?.meta?.attribution?.forkOf ||
            bundle?.tree?.universePresentation?.forkOf ||
            null;
            const { publishForkSignalIfNeeded } = await import('../features/nostr/api/publish-fork-signal.js');
            await publishForkSignalIfNeeded(store, forkOf, { pub: pair.pub, universeId: id });
        } catch (eFork) {
        console.warn('branch fork signal failed', eFork);
    }
    // Light signal for the directory aggregator **recent** index (Nostr directory bump).
    try {
        await store.nostr.putDirectoryBumpForPublishedTree(pair, id);
    } catch (e2) {
    console.warn('directory bump failed', e2);
    }
    } catch (e) {
    // Best-effort: publishing the bundle must still succeed even if directory is unavailable.
    console.warn('global directory publish failed', e);
    }
    } else if (republish) {
        try {
            await store.nostr.putGlobalTreeDirectoryDelist({ pair, universeId: id });
        } catch (eDelist) {
            console.warn('global directory delist failed', eDelist);
        }
    }

    if (!republish) {
        await store.nostr.putTreeCodeClaim({
            pair,
            code: shareCode,
            universeId: id,
            // Transparent relay bootstrap: publish current peer list as recommendations for store tree.
            recommendedRelays: Array.isArray((store.nostr && store.nostr.peers)) ? store.nostr.peers : null
        });
        store.saveNostrPublisherPair(pair);
    }

    const publicTreeUrl = formatNostrTreeUrl(pair.pub, id);
    const resolvedShareCode = String(shareCode || bundle.meta?.shareCode || '').trim();
    return {
        publicTreeUrl,
        pub: pair.pub,
        universeId: id,
        shareCode: resolvedShareCode,
        republish,
        includeForum: !!includeForum,
        listInDiscover: !!listInDiscover,
        inactivityPolicy: bundle.meta.inactivityPolicy,
    };

}
export async function publishComposedTreeToNostrAction({
    treeId = null,
    universeId = null,
    reuseNostrTreeUrl = null,
    includeForum = false,
    listInDiscover = true,
} = {}) {
    const store = shell();
    if (!store) return undefined;
    const ui = store.ui;
    if (typeof store.isSignedIn === 'function' && !store.isSignedIn()) {
        await requireSignInDialog(store);
        return null;
    }
    const tid = String(treeId || store.state.activeSource?.treeId || '').trim();
    const entry = tid ? store.userStore.getTree(tid) : null;
    if (!entry) {
        store.notify(ui.forumNoTree || 'No tree loaded.', true);
        return null;
    }
    if (!isNostrNetworkAvailable()) {
        store.notify(ui.nostrNotLoadedHint || 'Nostr relays unavailable.', true);
        return null;
    }
    await ensureConnectedNostr(store);
    if (!store.nostr?.hasConfiguredRelays?.()) {
        store.notify(ui.nostrRelaysRequired || 'Configure at least one relay in Profile.', true);
        return null;
    }
    const attribution = buildComposedTreeExportAttribution(store, entry);
    const bundle = buildArboritoTreeBundleObject(entry, {}, attribution);
    let branchSetHash = '';
    try {
        branchSetHash = await computeBranchSetHash(entry.branchRefs || []);
        if (branchSetHash) store.userStore.updateTree(tid, { branchSetHash });
    } catch {
    branchSetHash = String(entry.branchSetHash || '');
    }

    const reuseRef = reuseNostrTreeUrl ? parseNostrTreeUrl(reuseNostrTreeUrl) : null;
    const publishedUrl = entry.publishedNetworkUrl ? parseNostrTreeUrl(entry.publishedNetworkUrl) : null;
    const effectiveRef = reuseRef || publishedUrl;
    const adminPair = effectiveRef ? store.getNostrPublisherPair(effectiveRef.pub) : null;
    const republish = !!effectiveRef && !!(adminPair && adminPair.priv);
    const effectiveListInDiscover = !!listInDiscover;

    let pair;
    let id;
    let shareCode = null;
    if (republish) {
        pair = adminPair;
        id = String(universeId || effectiveRef.universeId);
        shareCode = String(bundle.meta?.shareCode || entry.publishedShareCode || '').trim() || null;
        if (shareCode) bundle.meta.shareCode = shareCode;
    } else {
    pair = await createNostrPair();
    id = String(universeId || `tre-${randomUUIDSafe()}`);
    for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = generateTreeShareCode();
        const taken = await store.nostr.loadCodeRecordOnce(candidate);
        if (!taken) {
            shareCode = candidate;
            break;
        }
    }
    if (!shareCode) {
        store.notify(ui.publicTreeCodeAllocFailed || 'Could not allocate a share code.', true);
        return null;
    }
    bundle.meta = bundle.meta && typeof bundle.meta === 'object' ? bundle.meta : {};
    bundle.meta.shareCode = shareCode;
    }

    bundle.meta = bundle.meta && typeof bundle.meta === 'object' ? bundle.meta : {};
    bundle.meta.forumEnabled = !!includeForum;
    if (!includeForum) {
        bundle.forum = { version: 1, threads: [], messages: [], moderationLog: [] };
    }
    bundle.meta.inactivityPolicy = republish
        ? bumpInactivityPolicy(getInactivityPolicyFromMeta(bundle.meta))
        : createInitialInactivityPolicy();
    bundle.meta.listInDiscover = !!effectiveListInDiscover;

    await store.nostr.publishBundle({ pair, universeId: id, bundle, includeForum: !!includeForum });
    const publicTreeUrl = formatNostrTreeUrl(pair.pub, id);
    store.userStore.setTreePublishedNetworkUrl(tid, publicTreeUrl, shareCode || bundle.meta?.shareCode || '');
    const treeEntry = store.userStore.getTree(tid);
    if (treeEntry) treeEntry.publishedInactivityPolicy = bundle.meta.inactivityPolicy;

    if (effectiveListInDiscover) {
    try {
        await store.nostr.putGlobalTreeDirectoryEntry({
            pair,
            universeId: id,
            title: String(entry.name || bundle.meta?.title || 'Tree'),
            shareCode: String(bundle.meta?.shareCode || shareCode || ''),
            description: String(bundle.meta?.description || attribution.description || '').trim(),
            authorName: String(bundle.meta?.authorName || attribution.authorName || '').trim(),
            contentKind: 'composed-tree',
            branchSetHash: branchSetHash || undefined,
            forkOfUrl: String(entry.forkOf?.treeUrl || attribution.forkOf?.treeUrl || '').trim() || undefined,
            recommendedRelays: Array.isArray(store.nostr?.peers) ? store.nostr.peers : null,
        });
        try {
            const { publishForkSignalIfNeeded } = await import('../features/nostr/api/publish-fork-signal.js');
            await publishForkSignalIfNeeded(store, entry.forkOf || attribution.forkOf, {
                pub: pair.pub,
                universeId: id,
            });
        } catch (eFork) {
        console.warn('composed tree fork signal failed', eFork);
    }
    try {
        await store.nostr.putDirectoryBumpForPublishedTree(pair, id);
    } catch (e2) {
    console.warn('composed tree directory bump failed', e2);
    }
    } catch (e) {
    console.warn('composed tree directory publish failed', e);
    }
    } else if (republish) {
        try {
            await store.nostr.putGlobalTreeDirectoryDelist({ pair, universeId: id });
        } catch (eDelist) {
            console.warn('composed tree directory delist failed', eDelist);
        }
    }

    if (!republish && shareCode) {
        await store.nostr.putTreeCodeClaim({
            pair,
            code: shareCode,
            universeId: id,
            recommendedRelays: Array.isArray(store.nostr?.peers) ? store.nostr.peers : null,
        });
        store.saveNostrPublisherPair(pair);
    }

    store.notify(ui.publicTreePublishedOk || 'Tree published.', false);
    return {
        publicTreeUrl,
        pub: pair.pub,
        universeId: id,
        shareCode: shareCode || '',
        republish,
        includeForum: !!includeForum,
        listInDiscover: !!effectiveListInDiscover,
        inactivityPolicy: bundle.meta.inactivityPolicy,
    };

}
