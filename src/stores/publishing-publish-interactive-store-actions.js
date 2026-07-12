import { getArboritoStore } from '../core/store-singleton.js';
import { isNostrNetworkAvailable, parseNostrTreeUrl, formatNostrTreeUrl, createNostrPair } from '../features/nostr/api/nostr-refs.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { generateTreeShareCode } from '../features/sources/api/share-code.js';
import { randomUUIDSafe } from '../shared/lib/secure-web-crypto.js';
import { ensureConnectedNostr } from '../shared/lib/connected-services/index.js';
import { yieldToPaint, scheduleIdle } from '../shared/lib/yield-to-paint.js';
import { usesGlobalDirectoryPointerForTorrent } from '../features/p2p-webtorrent/api/global-directory-torrent-runtime.js';
import { escHtml as esc } from '../shared/lib/html-escape.js';
import { buildPublicShareAppUrl } from '../shared/lib/public-app-url.js';
import { shell, classifyPublishNetworkError, publishDialogLinkSectionHtml, showInteractivePublishFailureDialog } from './publishing-publish-revoke-helpers.js';
import { isRepublishForActiveSource } from '../features/publishing/api/publish-hub-confirm.js';
import { openPublishHub, requireSignInForPublish } from '../features/publishing/api/account-hub-gate.js';
import { isArboritoDemoTree } from '../features/publishing/api/demo-tree-guard.js';
import { DEMO_BRANCH_ID } from '../core/demo/arborito-demo-ids.js';

export async function publishTreePublicInteractiveAction(opts = {}) {
    const { includeForum = false, listInDiscover = true, hubConfirm = false } = opts || {};
    const store = shell();
    if (!store) return undefined;
    const ui = store.ui;
    if (!store.hasAcceptedAuthorLicense()) {
        store.acceptAuthorLicense();
    }
    if (!store.state.rawGraphData || !store.state.activeSource) {
        store.notify(ui.forumNoTree || 'No tree loaded.', true);
        return;
    }

    if (!hubConfirm) {
        if (!(await requireSignInForPublish(store))) return;
        await openPublishHub(store);
        return;
    }

    if (typeof store.isSignedIn === 'function' && !store.isSignedIn()) {
        await requireSignInForPublish(store);
        return;
    }
    const metaCheck = store.validatePublicationMetadata();
    if (!metaCheck.ok) {
        store.notify(metaCheck.message, true);
        return;
    }

    const republish = isRepublishForActiveSource(store);

    // Optional: attach WebTorrent magnets (course bytes) while keeping the share-code UX unchanged.
    // Stored in `bundle.meta.webtorrent` so clients can lazy-load nodes/content via WebTorrent.
    const wtBudgetMs = 50000;
    try {
        if ((store.webtorrent && store.webtorrent.available ? store.webtorrent.available() : false) && store.state.rawGraphData) {
            const wtMeta = await Promise.race([
            store.prepareWebTorrentBucketsForActiveTree(),
            new Promise((_, reject) =>
            setTimeout(() => reject(Object.assign(new Error('wt-timeout'), { code: 'wt-timeout' })), wtBudgetMs)
            )
            ]);
            if (wtMeta) {
                const raw = store.state.rawGraphData;
                raw.meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
                raw.meta.webtorrent = wtMeta;
            }
        }
    } catch (e) {
    if (e && e.code === 'wt-timeout') {
        store.notify(ui.publicTreePublishWtTimeout || 'Optional packaging timed out; publishing without it.', false);
    } else {
    console.warn('WebTorrent bucket publish preparation failed', e);
    }
    }

    const reuse = (() => {
        const ref = (store.getPublishedTreeRefForActiveLocalSource && store.getPublishedTreeRefForActiveLocalSource());
        if (!ref) return null;
        const pair = store.getNostrPublisherPair(ref.pub);
        if (!(pair && pair.priv)) return null;
        return formatNostrTreeUrl(ref.pub, ref.universeId);
    })();
    const publishBudgetMs = 240000;
    /* Publishing a course can take several seconds (chunk uploads to every
    * relay, directory bump, code claim). Without a visible "publishing"
    * cue the user previously saw nothing happen, sometimes hit Publish
    * again, and the construction panel stayed editable mid-flight (the
    * worst version: tweaking the tree while half its chunks are already
    * on the network). The `publishingTree` flag drives:
    *   • the existing tree-growing toast (text overrides to "Publicando…")
    *   • a CSS-only edit lock on the construction panel
    *   • prevents double-clicks on Publish buttons elsewhere.
    * Cleared in the `finally` so every error path also unlocks the UI. */
    store.update({ publishingTree: true, treeGrowingOverlay: true });
    let pubRes;
    try {
        try {
            pubRes = await Promise.race([
            store.publishActiveTreeToNostrUniverse({ reuseNostrTreeUrl: reuse, includeForum, listInDiscover }),
            new Promise((_, reject) =>
            setTimeout(
            () => reject(Object.assign(new Error('pub-timeout'), { code: 'pub-timeout' })),
            publishBudgetMs
            )
            )
            ]);
        } catch (e) {
        const c = classifyPublishNetworkError(e);
        if (c.kind === 'timeout') {
            await showInteractivePublishFailureDialog(store, ui, 'timeout', '');
        } else if (c.kind === 'forbidden') {
        await showInteractivePublishFailureDialog(store, ui, 'forbidden', c.detail);
    } else if (c.kind === 'relay') {
    await showInteractivePublishFailureDialog(store, ui, 'relay', c.detail);
    } else if (c.kind === 'event-package') {
    await showInteractivePublishFailureDialog(store, ui, 'event-package', c.detail);
    } else {
    await showInteractivePublishFailureDialog(store, ui, 'generic', c.detail);
    }
    return;
    }
    if (!(pubRes && pubRes.publicTreeUrl)) {
        await showInteractivePublishFailureDialog(store, ui, 'no-result', '');
        return;
    }
    try {
        const raw = store.state.rawGraphData;
        if (raw && typeof raw === 'object') {
            raw.meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
            raw.meta.forumEnabled = !!includeForum;
            raw.meta.listInDiscover = !!listInDiscover;
            if (pubRes.shareCode) raw.meta.shareCode = pubRes.shareCode;
        }
    } catch {
        /* ignore */
    }
    } finally {
    store.update({ publishingTree: false, treeGrowingOverlay: false });
    }
    const srcUrl = (store.state.activeSource && store.state.activeSource.url);
    if (srcUrl && String(srcUrl).startsWith('branch://')) {
        const localId = String(srcUrl).slice('branch://'.length);
        store.userStore.setBranchPublishedNetworkUrl(localId, pubRes.publicTreeUrl, pubRes.shareCode || '');
        try {
            const entry = store.userStore.state.branches.find((t) => t.id === localId);
            if (entry && pubRes.shareCode) {
                entry.data = entry.data && typeof entry.data === 'object' ? entry.data : {};
                entry.data.meta = entry.data.meta && typeof entry.data.meta === 'object' ? entry.data.meta : {};
                entry.data.meta.shareCode = pubRes.shareCode;
                store.userStore.markBranchDirty(localId);
                store.userStore.persist();
            }
            if (entry && pubRes.inactivityPolicy) entry.publishedInactivityPolicy = pubRes.inactivityPolicy;
        } catch {
            /* ignore */
        }
        // Snapshot the published baseline so the UI can show a Draft + diff vs published.
        // Deferred so the success dialog opens immediately (large trees block the main thread).
        const snapshotLocalId = localId;
        const snapshotData = store.state.rawGraphData;
        scheduleIdle(() => {
            try {
                store.userStore.setBranchPublishedSnapshot(snapshotLocalId, snapshotData);
                const entry = store.userStore.state.branches.find((t) => t.id === snapshotLocalId);
                if (entry) entry.draftHash = store.userStore.hashJson(entry.data);
            } catch {
                /* ignore */
            }
        });
    }
    const shareCode = pubRes.shareCode || '';

    const shortLink = shareCode ? buildPublicShareAppUrl(`?code=${encodeURIComponent(shareCode)}`) : '';
    const leadText = pubRes.republish
    ? ui.publicTreeRepublishSuccessLead ||
    'Your public course was updated. Existing links still work.'
    : ui.publicTreeSuccessLead || 'Your tree is now online. Share the link below so others can open the same course.';
    const codeBlock = shareCode
    ? `<p class="text-sm font-bold text-slate-700 dark:text-slate-200 m-0 mb-2">${esc(ui.publicTreeSuccessCodeLabel || 'Share code')}: <span class="font-mono tracking-wide text-emerald-600 dark:text-emerald-400">${esc(shareCode)}</span></p><p class="text-xs text-slate-500 dark:text-slate-400 m-0 mb-3">${esc(ui.publicTreeSuccessCodeHint || 'Others can type store code in Trees → Add a tree (no account needed).')}</p>`
    : '';
    const note = includeForum
        ? ui.publicTreeSuccessNote ||
          'Anyone with the link can read the tree, forum, and the progress snapshots in this bundle. Use Retract in construction mode to signal the network to drop this tree (this device must keep the publisher key). Malicious peers might still retain data—never publish secrets.'
        : ui.publicTreeSuccessNoteNoForum ||
          'Anyone with the link can read the lessons. Forum is off for this tree. Use Retract in construction mode to signal the network to drop this tree (this device must keep the publisher key). Malicious peers might still retain data—never publish secrets.';
    const shortBlock = shareCode
    ? publishDialogLinkSectionHtml(
    ui,
    shortLink,
    esc(ui.publicTreeSuccessShortLinkLabel || 'Short link (code)'),
    'emerald'
    )
    : '';
    const lead = `<p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed m-0 mb-3">${esc(leadText)}</p>`;
    const torrentLagBlock = usesGlobalDirectoryPointerForTorrent()
    ? `<p class="text-xs text-amber-800 dark:text-amber-100/90 leading-relaxed m-0 mb-3 rounded-lg border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/90 dark:bg-amber-950/25 px-3 py-2">${esc(
    ui.publicTreeSuccessTorrentIndexLag ||
    'If you use the optional torrent browse mirror, it refreshes in batches: your tree can take a few minutes to show up there. Share code and links work right away; Nostr search is usually faster.'
    )}</p>`
    : '';
    const moderationBlock = '';
    const noteBlock = `<p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed m-0 mt-4">${esc(
    note
    )}</p>`;
    const body = `${lead}${torrentLagBlock}${moderationBlock}${codeBlock}${shortBlock}${noteBlock}`;

    const modalNow = store.state.modal;
    const hubOpen =
        modalNow &&
        typeof modalNow === 'object' &&
        modalNow.type === 'construction-about';
    if (hubOpen) {
        store.setModal(null);
    }

    await yieldToPaint();

    await store.acknowledge({
        title: pubRes.republish
            ? ui.publicTreeRepublishSuccessTitle || 'Changes published'
            : ui.publicTreeSuccessTitle || 'Published',
        body,
        bodyHtml: true,
        confirmText: ui.dialogOkButton || 'OK',
        dialogIcon: '✅',
    });

    /* Data-resilience fix (was: "auto-switch to the new public tree source").
    *
    * The old code did two destructive things while the relay was still finalising
    * the publish:
    *   1. eagerly `removeCommunitySource(...)` on any "Saved/Code …" bookmark
    *      that pointed to the just-published URL, even if the next step failed,
    *   2. called `loadData(target, true)` to switch the active source from
    *      `branch://…` to the public `nostr://…` copy.
    *
    * If the immediate post-publish fetch failed (relay still propagating,
    * Firefox blocked the host, transient network blip…) the user was left with:
    *   • a blank canvas for a few seconds (active source swap),
    *   • a "couldn't load public tree" error,
    *   • bookmark rows silently gone from `communitySources`,
    *   • and, because the local garden row gets hidden as soon as
    *     `publishedNetworkUrl` is set, the tree apparently "vanished" from
    *     the unified list. The data was still on disk (local tree + bundle on
    *     the relay), but every UI affordance to reach it had been removed.
    *
    * We now do nothing here on success: the local tree stays active and the
    * unified renderer keeps its row visible (now badged "Published"). The
    * Internet/Saved rows are still de-duplicated against `publishedNetworkUrl`
    * by the renderer, so nothing leaks duplicates. Users open the public
    * mirror manually from the Sources modal when they want to; until then,
    * their editable copy is always reachable, regardless of relay health. */

}
export async function offerLocalCopyFromNetworkTreeForEditingAction({ enterConstruction = true } = {}) {
    const store = shell();
    if (!store) return undefined;
    const ui = store.ui;
    const isDemo = isArboritoDemoTree(store);
    if (fileSystem.isLocal && !isDemo) return;
    if (!store.state.rawGraphData) {
        store.notify(ui.forkNetworkTreeInvalidData || ui.forumNoTree || 'No tree loaded.', true);
        return;
    }
    if (!store.state.rawGraphData) {
        store.notify(ui.forkNetworkTreeInvalidData || ui.forumNoTree || 'No tree loaded.', true);
        return;
    }
    const defaultName = String(
        isDemo
            ? ui.forkDemoTreeDefaultName || 'My Arborito copy'
            : (store.state.activeSource && store.state.activeSource.name) ||
                  (store.state.rawGraphData && store.state.rawGraphData.universeName) ||
                  ''
    ).trim();
    const typed = await store.showDialog({
        type: 'prompt',
        title: isDemo
            ? ui.forkDemoTreePromptTitle || ui.forkDemoTreeConfirmTitle || 'Copy demo to My garden'
            : ui.forkNetworkTreePromptTitle || 'Create a local copy to edit',
        body: isDemo
            ? ui.forkDemoTreeConfirmBody ||
              'The Arborito demo is read-only. Choose a name for your editable copy in My garden.'
            : ui.forkNetworkTreeConfirmBody ||
              'This tree is read-only. Choose a name for your editable copy in My garden.',
        bodyHtml: false,
        placeholder: defaultName || (ui.forkNetworkTreePromptPlaceholder || 'My copy'),
        confirmText: ui.forkNetworkTreeCreateButton || ui.plantBranchShort || 'Create',
        cancelText: ui.cancel || 'Cancel',
    });
    if (typed === null || typed === false) return;
    const name = String(typed || '').trim();
    if (!name) {
        store.notify(ui.forkNetworkTreeEmptyName || 'Please enter a name.', true);
        return;
    }
    try {
        const entry = store.userStore.plantBranchFromCurriculumClone(name, store.state.rawGraphData, {
            sourceUrl: isDemo
                ? `branch://${DEMO_BRANCH_ID}`
                : String(store.state.activeSource?.url || '').trim(),
        });
        await store.loadData(
        { id: entry.id, name: entry.name, url: `branch://${entry.id}`, type: 'branch', isTrusted: true },
        true
        );
        if (enterConstruction && !store.state.constructionMode) {
            store.update({ constructionMode: true });
        }
    } catch (e) {
    console.warn('offerLocalCopyFromNetworkTreeForEditing', e);
    store.notify(
    String(ui.forkNetworkTreeError || 'Could not create copy: {message}').replace(
    '{message}',
    String((e && e.message) || e)
    ),
    true
    );
    }

}
