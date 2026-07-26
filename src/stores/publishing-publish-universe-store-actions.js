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
import { computeBranchSetHash, computeBranchSetHashSync } from '../features/forest/api/branch-set-hash.js';
import { buildComposedTreeExportAttribution } from '../shared/lib/arborito-attribution.js';
import { pickTitleForLang, titlesFromTreeLanguages, descriptionsFromTreeLanguages } from '../shared/lib/catalog-titles.js';
import { resolveDirectoryIconForPublish } from '../features/sources/api/branch-catalog-icon.js';
import { shell } from './publishing-publish-revoke-helpers.js';
import { branchIdFromBranchUrl } from '../shared/lib/branch-id.js';
import { requireSignInDialog } from '../features/publishing/api/account-hub-gate.js';
import {
    curriculumHasLocalMedia,
    sanitizeImportedTreeJson,
} from '../features/tree-graph/api/tree-import-sanitize.js';
import { collectLocalMediaLessonTitles } from '../features/learning/api/lesson-local-media-store.js';
import { getPanelRef } from '../app/panel-refs.js';

async function flushOpenLessonBeforePublish(store) {
    const contentApi = getPanelRef('content');
    if (!contentApi) return true;
    if (typeof contentApi.confirmLeaveIfNeeded === 'function') {
        return contentApi.confirmLeaveIfNeeded();
    }
    return true;
}

/** Delist from Discover with retries — used before Discover-off republish and on revoke. */
async function delistPublishedTreeWithRetries(store, { pair, universeId, attempts = 3 }) {
    let lastErr = null;
    for (let i = 0; i < attempts; i++) {
        try {
            await store.nostr.putGlobalTreeDirectoryDelist({ pair, universeId });
            return true;
        } catch (e) {
            lastErr = e;
            if (i + 1 < attempts) {
                await new Promise((r) => setTimeout(r, 350 * (i + 1)));
            }
        }
    }
    if (lastErr) throw lastErr;
    return false;
}

export async function publishActiveTreeToNostrUniverseAction({
    universeId = null,
    reuseNostrTreeUrl = null,
    includeForum = false,
    listInDiscover = true,
    skipLocalMediaConfirm = false,
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
            skipLocalMediaConfirm,
            quiet: true,
        });
    }
    const ui = store.ui;
    const lessonOk = await flushOpenLessonBeforePublish(store);
    if (!lessonOk) return null;
    /* Network trees keep lesson bodies lazy until opened — materialize before bundling. */
    try {
        if (typeof store.graphLogic?.materializeAllLazyLessonBodiesIntoRaw === 'function') {
            await store.graphLogic.materializeAllLazyLessonBodiesIntoRaw();
        }
    } catch (e) {
        console.warn('[Arborito] materialize before publish', e);
        store.notify(
            ui.publishMaterializeFailed ||
                'Could not load all lessons before publishing. Check the network and try again.',
            true
        );
        return null;
    }
    const bundle = store.buildArboritoBundleObject();
    if (!bundle) {
        store.notify(ui.forumNoTree || 'No tree loaded.', true);
        return null;
    }
    if (!skipLocalMediaConfirm && curriculumHasLocalMedia(bundle.tree)) {
        const lessons = collectLocalMediaLessonTitles(bundle.tree);
        const list =
            lessons.length > 0
                ? `\n\n• ${lessons.slice(0, 12).join('\n• ')}${lessons.length > 12 ? '\n• …' : ''}`
                : '';
        const intro =
            ui.publishLocalMediaOmitBody ||
            'These lessons still use Local media (./media/). Replace with moderated links, or publish omitting Local media (those blocks will be empty online).';
        const ok = await store.confirm(
            `${intro}${list}`,
            ui.publishLocalMediaOmitTitle || 'Local media found',
            false,
            ui.publishLocalMediaOmitConfirm || 'Publish without Local media'
        );
        if (!ok) return null;
    }
    if (bundle.tree) {
        const { tree: scrubbed } = sanitizeImportedTreeJson(JSON.parse(JSON.stringify(bundle.tree)), {
            allowLocal: false,
        });
        if (scrubbed) bundle.tree = scrubbed;
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

    /*
     * Existing public tree without owner key: never mint a new publisher identity
     * (would create a lookalike fork). Editors should fork locally instead.
     */
    if (effectiveRef && !republish) {
        const role =
            typeof store.getMyTreeNetworkRole === 'function' ? store.getMyTreeNetworkRole() : null;
        store.notify(
            role === 'editor' || role === 'proposer'
                ? ui.governanceEditorCannotPublish ||
                      'Only the tree owner can publish updates. Create a local copy to keep editing.'
                : ui.publicTreeOwnerKeyMissing ||
                      'Missing the owner key for this public tree. Open your local garden copy to update it.',
            true
        );
        if (
            (role === 'editor' || role === 'proposer') &&
            typeof store.offerLocalCopyFromNetworkTreeForEditing === 'function'
        ) {
            queueMicrotask(() => {
                void store.offerLocalCopyFromNetworkTreeForEditing({ enterConstruction: true });
            });
        }
        return null;
    }

    let pair;
    let id;
    let shareCode = null;

    if (republish) {
        pair = adminPair;
        id = String(universeId || effectiveRef.universeId);
        const srcUrl = String(store.state.activeSource?.url || '');
        const localId = branchIdFromBranchUrl(srcUrl);
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
    /* First publish: always allocate a random network id. Archive `meta.id` / local
     * slugs must never become the Nostr universeId (collisions + author typos). */
    id = `brn-${randomUUIDSafe()}`;
    let claimed = false;
    for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = generateTreeShareCode();
        const taken = await store.nostr.loadCodeRecordOnce(candidate);
        if (taken) continue;
        /* Claim before bundle/directory so the code is never advertised unbound. */
        await store.nostr.putTreeCodeClaim({
            pair,
            code: candidate,
            universeId: id,
            recommendedRelays: Array.isArray((store.nostr && store.nostr.peers)) ? store.nostr.peers : null
        });
        const confirmed = await store.nostr.loadCodeRecordOnce(candidate);
        const owner = String(confirmed?.ownerPub || confirmed?.by || '');
        if (
            confirmed &&
            !confirmed.revoked &&
            owner === String(pair.pub) &&
            String(confirmed.universeId) === String(id)
        ) {
            shareCode = candidate;
            claimed = true;
            break;
        }
    }
    if (!claimed || !shareCode) {
        store.notify(ui.publicTreeCodeAllocFailed || 'Could not allocate a share code. Try again.', true);
        return null;
    }
    bundle.meta = bundle.meta && typeof bundle.meta === 'object' ? bundle.meta : {};
    bundle.meta.shareCode = shareCode;
    store.saveNostrPublisherPair(pair);
    /* Bind local garden to this identity now so a failed bundle publish retries
     * as republish (same pair/universe/code) instead of minting a second one. */
    {
        const pendingUrl = formatNostrTreeUrl(pair.pub, id);
        const srcUrl = String(store.state.activeSource?.url || '');
        const localId = branchIdFromBranchUrl(srcUrl);
        if (localId) {
            store.userStore.setBranchPublishedNetworkUrl(localId, pendingUrl, shareCode, {
                bindOnly: true,
            });
        }
    }
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

    /* Discover-off: delist before rewriting the bundle so a failed delist aborts cleanly. */
    if (republish && !listInDiscover) {
        try {
            await delistPublishedTreeWithRetries(store, { pair, universeId: id });
        } catch (eDelist) {
            console.warn('global directory delist failed', eDelist);
            store.notify(
                ui.publicTreeDiscoverDelistFailed ||
                    'Could not remove the course from forest listing. Check relays and try again.',
                true
            );
            return null;
        }
    }

    await yieldToPaint();
    const published = await store.nostr.publishBundle({
        pair,
        universeId: id,
        bundle,
        includeForum: !!includeForum,
    });
    const bundleGen = String(published?.gen || '').trim();

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
        const titles = titlesFromTreeLanguages(bundle?.tree);
        const descriptions = descriptionsFromTreeLanguages(bundle?.tree);
        const uiLang = String(store.state?.lang || '').trim().toUpperCase();
        const primaryTitle =
            pickTitleForLang(titles, uiLang, '') ||
            String(
                ((bundle && bundle.meta) ? bundle.meta.title : undefined) ||
                    ((bundle && bundle.meta) ? bundle.meta.universeName : undefined) ||
                    'Arborito'
            );
        /* Prefer About (universePresentation → bundle.meta) over lang-root text.
         * New branches used to ship langRoot.description = defaultGardenName, which
         * drowned the real public blurb in Discover. */
        const fromPresentation = String(
            ((bundle && bundle.meta) ? bundle.meta.description : undefined) || ''
        ).trim();
        const fromLangRoot = pickTitleForLang(descriptions, uiLang, '');
        const primaryDescription = fromPresentation || fromLangRoot;
        const directoryDescriptions = (() => {
            if (!fromPresentation) {
                return Object.keys(descriptions).length ? descriptions : undefined;
            }
            /** @type {Record<string, string>} */
            const out = { ...descriptions };
            if (uiLang) out[uiLang] = fromPresentation;
            if (!Object.keys(out).length) out.EN = fromPresentation;
            return out;
        })();
        const catalogIcon = resolveDirectoryIconForPublish(bundle);
        await store.nostr.putGlobalTreeDirectoryEntry({
            pair,
            universeId: id,
            title: primaryTitle,
            titles: Object.keys(titles).length ? titles : undefined,
            shareCode: String(((bundle && bundle.meta) ? bundle.meta.shareCode : undefined) || shareCode || ''),
            description: primaryDescription,
            descriptions: directoryDescriptions,
            authorName: String(((bundle && bundle.meta) ? bundle.meta.authorName : undefined) || '').trim(),
            languages: langKeys,
            contentKind: 'branch',
            icon: catalogIcon || undefined,
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
    }

    const publicTreeUrl = formatNostrTreeUrl(pair.pub, id);
    const resolvedShareCode = String(shareCode || bundle.meta?.shareCode || '').trim();
    /* Clear claim-time publishPending even if the interactive wrapper is skipped. */
    {
        const srcUrl = String(store.state.activeSource?.url || '');
        const localId = branchIdFromBranchUrl(srcUrl);
        if (localId) {
            store.userStore.setBranchPublishedNetworkUrl(localId, publicTreeUrl, resolvedShareCode || null, {
                bundleGen: bundleGen || undefined,
            });
        }
    }
    return {
        publicTreeUrl,
        pub: pair.pub,
        universeId: id,
        shareCode: resolvedShareCode,
        republish,
        includeForum: !!includeForum,
        listInDiscover: !!listInDiscover,
        inactivityPolicy: bundle.meta.inactivityPolicy,
        gen: bundleGen || undefined,
    };

}
export async function publishComposedTreeToNostrAction({
    treeId = null,
    universeId = null,
    reuseNostrTreeUrl = null,
    includeForum,
    listInDiscover,
    skipLocalMediaConfirm = false,
    quiet = false,
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
    const lessonOk = await flushOpenLessonBeforePublish(store);
    if (!lessonOk) return null;
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
    const localLessons = [];
    for (const ref of entry.branchRefs || []) {
        const bid = String(ref?.branchId || ref?.id || '').trim();
        const data = bid ? store.userStore.getBranchData?.(bid) : null;
        if (data && curriculumHasLocalMedia(data)) {
            for (const t of collectLocalMediaLessonTitles(data)) localLessons.push(t);
        }
    }
    if (localLessons.length && !skipLocalMediaConfirm) {
        const unique = [...new Set(localLessons)];
        const list = `\n\n• ${unique.slice(0, 12).join('\n• ')}${unique.length > 12 ? '\n• …' : ''}`;
        const intro =
            ui.publishLocalMediaOmitBody ||
            'These lessons still use Local media (./media/). Replace with moderated links, or publish omitting Local media (those blocks will be empty online).';
        const ok = await store.confirm(
            `${intro}${list}`,
            ui.publishLocalMediaOmitTitle || 'Local media found',
            false,
            ui.publishLocalMediaOmitConfirm || 'Publish without Local media'
        );
        if (!ok) return null;
    }
    const bundle = buildArboritoTreeBundleObject(entry, {}, attribution);
    /*
     * Local dirty detection (dock / Biblioteca) compares against computeBranchSetHashSync.
     * Keep branchSetHash / publishedBranchSetHash on that algorithm. Optional SHA-256 is
     * only for the network directory fingerprint.
     */
    const localBranchSetHash = computeBranchSetHashSync(entry.branchRefs || []);
    let directoryBranchSetHash = localBranchSetHash;
    try {
        const sha = await computeBranchSetHash(entry.branchRefs || []);
        if (sha) directoryBranchSetHash = sha;
    } catch {
        /* keep sync hash for directory too */
    }
    /* Do not call updateTree here: bumping `updated` before a successful publish
     * leaves the dock stuck on Update when the attempt soft-fails. */
    const branchSetHash = localBranchSetHash;

    const reuseRef = reuseNostrTreeUrl ? parseNostrTreeUrl(reuseNostrTreeUrl) : null;
    const publishedUrl = entry.publishedNetworkUrl ? parseNostrTreeUrl(entry.publishedNetworkUrl) : null;
    const effectiveRef = reuseRef || publishedUrl;
    const adminPair = effectiveRef ? store.getNostrPublisherPair(effectiveRef.pub) : null;
    const republish = !!effectiveRef && !!(adminPair && adminPair.priv);
    /* Omitted options (Biblioteca) keep last published listing prefs. */
    const effectiveListInDiscover =
        listInDiscover !== undefined
            ? !!listInDiscover
            : entry.publishedNetworkUrl
              ? entry.publishedListInDiscover !== false
              : true;
    const effectiveIncludeForum =
        includeForum !== undefined
            ? !!includeForum
            : entry.publishedNetworkUrl
              ? entry.publishedForumEnabled === true
              : false;

    /*
     * Existing public tree without owner key: never mint a new publisher identity
     * (would orphan the previous universe and rebind the local link).
     */
    if (effectiveRef && !republish) {
        store.notify(
            ui.publicTreeOwnerKeyMissing ||
                'Missing the owner key for this public tree. Open your local garden copy to update it.',
            true
        );
        return null;
    }

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
    /* Network id is always allocated here — never an author-typed archive/local slug. */
    id = `tre-${randomUUIDSafe()}`;
    let claimed = false;
    for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = generateTreeShareCode();
        const taken = await store.nostr.loadCodeRecordOnce(candidate);
        if (taken) continue;
        await store.nostr.putTreeCodeClaim({
            pair,
            code: candidate,
            universeId: id,
            recommendedRelays: Array.isArray(store.nostr?.peers) ? store.nostr.peers : null,
        });
        const confirmed = await store.nostr.loadCodeRecordOnce(candidate);
        const owner = String(confirmed?.ownerPub || confirmed?.by || '');
        if (
            confirmed &&
            !confirmed.revoked &&
            owner === String(pair.pub) &&
            String(confirmed.universeId) === String(id)
        ) {
            shareCode = candidate;
            claimed = true;
            break;
        }
    }
    if (!claimed || !shareCode) {
        store.notify(ui.publicTreeCodeAllocFailed || 'Could not allocate a share code.', true);
        return null;
    }
    bundle.meta = bundle.meta && typeof bundle.meta === 'object' ? bundle.meta : {};
    bundle.meta.shareCode = shareCode;
    store.saveNostrPublisherPair(pair);
    store.userStore.setTreePublishedNetworkUrl(
        tid,
        formatNostrTreeUrl(pair.pub, id),
        shareCode,
        { bindOnly: true }
    );
    }

    bundle.meta = bundle.meta && typeof bundle.meta === 'object' ? bundle.meta : {};
    bundle.meta.forumEnabled = !!effectiveIncludeForum;
    if (!effectiveIncludeForum) {
        bundle.forum = { version: 1, threads: [], messages: [], moderationLog: [] };
    }
    bundle.meta.inactivityPolicy = republish
        ? bumpInactivityPolicy(getInactivityPolicyFromMeta(bundle.meta))
        : createInitialInactivityPolicy();
    bundle.meta.listInDiscover = !!effectiveListInDiscover;

    if (republish && !effectiveListInDiscover) {
        try {
            await delistPublishedTreeWithRetries(store, { pair, universeId: id });
        } catch (eDelist) {
            console.warn('composed tree directory delist failed', eDelist);
            store.notify(
                ui.publicTreeDiscoverDelistFailed ||
                    'Could not remove the course from forest listing. Check relays and try again.',
                true
            );
            return null;
        }
    }

    const published = await store.nostr.publishBundle({
        pair,
        universeId: id,
        bundle,
        includeForum: !!effectiveIncludeForum,
    });
    const bundleGen = String(published?.gen || '').trim();
    const publicTreeUrl = formatNostrTreeUrl(pair.pub, id);
    store.userStore.setTreePublishedNetworkUrl(tid, publicTreeUrl, shareCode || bundle.meta?.shareCode || '', {
        branchSetHash: branchSetHash || null,
        listInDiscover: !!effectiveListInDiscover,
        forumEnabled: !!effectiveIncludeForum,
        bundleGen: bundleGen || undefined,
    });
    const treeEntry = store.userStore.getTree(tid);
    if (treeEntry) treeEntry.publishedInactivityPolicy = bundle.meta.inactivityPolicy;

    if (effectiveListInDiscover) {
    try {
        const catalogIcon = resolveDirectoryIconForPublish(bundle, entry);
        await store.nostr.putGlobalTreeDirectoryEntry({
            pair,
            universeId: id,
            title: String(entry.name || bundle.meta?.title || 'Tree'),
            shareCode: String(bundle.meta?.shareCode || shareCode || ''),
            description: String(bundle.meta?.description || attribution.description || '').trim(),
            authorName: String(bundle.meta?.authorName || attribution.authorName || '').trim(),
            contentKind: 'composed-tree',
            icon: catalogIcon || undefined,
            branchSetHash: directoryBranchSetHash || branchSetHash || undefined,
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
    }

    if (!quiet) {
        store.notify(ui.publicTreePublishedOk || 'Tree published.', false);
    }
    return {
        publicTreeUrl,
        pub: pair.pub,
        universeId: id,
        shareCode: shareCode || '',
        republish,
        includeForum: !!effectiveIncludeForum,
        listInDiscover: !!effectiveListInDiscover,
        inactivityPolicy: bundle.meta.inactivityPolicy,
        gen: bundleGen || undefined,
    };

}
