import { getArboritoStore } from '../core/store-singleton.js';
import { isNostrNetworkAvailable, parseNostrTreeUrl, formatNostrTreeUrl, createNostrPair } from '../features/nostr/api/nostr-refs.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { generateTreeShareCode } from '../features/sources/api/share-code.js';
import { randomUUIDSafe } from '../shared/lib/secure-web-crypto.js';
import { ensureConnectedNostr } from '../shared/lib/connected-services/index.js';
import { yieldToPaint } from '../shared/lib/yield-to-paint.js';
import { usesGlobalDirectoryPointerForTorrent } from '../features/p2p-webtorrent/api/global-directory-torrent-runtime.js';
import { escHtml as esc, escHtml as escAttr } from '../shared/lib/html-escape.js';

import { shell, classifyPublishNetworkError, publishDialogLinkSectionHtml, showInteractivePublishFailureDialog } from './publishing-publish-revoke-helpers.js';

export async function publishTreePublicInteractiveAction() {
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
    if (typeof store.isSignedIn === 'function' && !store.isSignedIn()) {
        await store.showDialog({
            type: 'alert',
            title: ui.publishNeedLoginTitle || 'Sign in required',
            body:
            ui.publishNeedLoginBody ||
            'To publish a tree to the network, open Profile and sign in with your sync code first (from the More menu on mobile, or your account entry on desktop).',
            bodyHtml: false,
            confirmText: ui.dialogOkButton || 'OK'
        });
        if (typeof store.setModal === 'function') {
            queueMicrotask(() => store.setModal({ type: 'profile' }));
        }
        return;
    }
    const metaCheck = store.validatePublicationMetadata();
    if (!metaCheck.ok) {
        await store.showDialog({
            type: 'alert',
            title: ui.publishMetaRequiredTitle || 'Course details required',
            body: metaCheck.message,
            confirmText: ui.dialogOkButton || 'OK'
        });
        return;
    }
    // "Republish" is allowed even if we're still on a local editor, as long as store local tree
    // has an associated published public tree URL and we still have the publisher key.
    const republish =
    store.canRetractActivePublicUniverse() ||
    (() => {
        const ref = (store.getPublishedTreeRefForActiveLocalSource && store.getPublishedTreeRefForActiveLocalSource());
        return !!(ref && (store.getNostrPublisherPair(ref.pub) ? store.getNostrPublisherPair(ref.pub).priv : undefined));
    })();
    /* Appends to publish/republish confirm; copy in locales: publicTreeLicenseReminder */
    const ccRem = String(ui.publicTreeLicenseReminder || '').trim();
    let pubBody = republish
    ? ui.publicTreeRepublishBody ||
    'This updates the public copy of store course on the network (same links and share code). Learner progress in the bundle is still minimized. Continue?'
    : ui.publicTreeConfirmBody ||
    'This will publish a copy of the tree, forum, and progress data for others to open. You can retract it later from store device if you still have the publisher key (Construction → Retract). Honest peers will stop showing the tree; malicious mirrors might retain copies. Do not include confidential information.';
    if (ccRem) {
        pubBody = republish
        ? `${pubBody}\n\n${ccRem}`
        : `${pubBody}<br /><br /><p class="text-xs m-0 text-slate-600 dark:text-slate-300">${esc(ccRem)}</p>`;
    }
    const ok = await store.showDialog({
        type: 'confirm',
        title: republish
        ? ui.publicTreeRepublishTitle || 'Publish changes online'
        : ui.publicTreeTitle || 'Make store tree public',
        body: pubBody,
        bodyHtml: !republish,
        danger: true,
        confirmText: republish
        ? ui.publicTreeRepublishButton || 'Publish changes'
        : ui.publicTreeConfirmButton || 'Publish',
        cancelText: ui.cancel || 'Cancel'
    });
    if (ok !== true) {
        if (ok === false || ok === null) return;
        store.notify(
        ui.publishConfirmUnexpected ||
        'The publish dialog closed without confirming. If the button did not respond, try again after the page settles.',
        true
        );
        return;
    }

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
            store.publishActiveTreeToNostrUniverse({ reuseNostrTreeUrl: reuse }),
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
    } finally {
    store.update({ publishingTree: false, treeGrowingOverlay: false });
    }
    const srcUrl = (store.state.activeSource && store.state.activeSource.url);
    if (srcUrl && String(srcUrl).startsWith('branch://')) {
        const localId = String(srcUrl).slice('branch://'.length);
        store.userStore.setBranchPublishedNetworkUrl(localId, pubRes.publicTreeUrl);
        // Snapshot the published baseline so the UI can show a Draft + diff vs published.
        try {
            store.userStore.setBranchPublishedSnapshot(localId, store.state.rawGraphData);
            const entry = store.userStore.state.branches.find((t) => t.id === localId);
            if (entry) entry.draftHash = store.userStore.hashJson(entry.data);
        } catch {
        /* ignore */
    }
    }
    const shareCode = pubRes.shareCode || '';
    const treeName = (store.state.activeSource && store.state.activeSource.name) || 'tree';
    const locationCode = pubRes.publicTreeUrl ? pubRes.publicTreeUrl.split('/').pop().slice(0, 8) : '';

    const shortLink = shareCode
    ? `${window.location.origin}${window.location.pathname}?code=${encodeURIComponent(shareCode)}/tree=${encodeURIComponent(treeName)}/location=${encodeURIComponent(locationCode)}`
    : '';
    const leadText = pubRes.republish
    ? ui.publicTreeRepublishSuccessLead ||
    'Your public course was updated. Existing links still work.'
    : ui.publicTreeSuccessLead || 'Your tree is now online. Share the link below so others can open the same course.';
    const codeBlock = shareCode
    ? `<p class="text-sm font-bold text-slate-700 dark:text-slate-200 m-0 mb-2">${esc(ui.publicTreeSuccessCodeLabel || 'Share code')}: <span class="font-mono tracking-wide text-emerald-600 dark:text-emerald-400">${esc(shareCode)}</span></p><p class="text-xs text-slate-500 dark:text-slate-400 m-0 mb-3">${esc(ui.publicTreeSuccessCodeHint || 'Others can type store code in Trees → Add a tree (no account needed).')}</p>`
    : '';
    const note = ui.publicTreeSuccessNote || 'Anyone with the link can read the tree, forum, and the progress snapshots in store bundle. Use Retract in construction mode to signal the network to drop store tree (store device must keep the publisher key). Malicious peers might still retain data—never publish secrets.';
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
    const noteBlock = `<p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed m-0 mt-4">${esc(
    note
    )}</p>`;
    const body = `${lead}${torrentLagBlock}${codeBlock}${shortBlock}${noteBlock}`;

    await store.showDialog({
        type: 'alert',
        title: pubRes.republish
        ? ui.publicTreeRepublishSuccessTitle || 'Changes published'
        : ui.publicTreeSuccessTitle || 'Published',
        body,
        bodyHtml: true,
        confirmText: ui.dialogOkButton || 'OK'
    });

    /* Data-resilience fix (was: "auto-switch to the new public tree source").
    *
    * The old code did two destructive things while the relay was still finalising
    * the publish:
    *   1. eagerly `removeCommunitySource(...)` on any "Saved/Code …" bookmark
    *      that pointed to the just-published URL — even if the next step failed,
    *   2. called `loadData(target, true)` to switch the active source from
    *      `branch://…` to the public `nostr://…` copy.
    *
    * If the immediate post-publish fetch failed (relay still propagating,
    * Firefox blocked the host, transient network blip…) the user was left with:
    *   • a blank canvas for a few seconds (active source swap),
    *   • a "couldn't load public tree" error,
    *   • bookmark rows silently gone from `communitySources`,
    *   • and — because the local garden row gets hidden as soon as
    *     `publishedNetworkUrl` is set — the tree apparently "vanished" from
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
    if (fileSystem.isLocal) return;
    if (!store.state.rawGraphData) {
        store.notify(ui.forumNoTree || 'No tree loaded.', true);
        return;
    }
    const ok = await store.showDialog({
        type: 'confirm',
        title: ui.forkNetworkTreeConfirmTitle || 'Create a local copy?',
        body:
        ui.forkNetworkTreeConfirmBody ||
        'This online tree is from another author (or you only have read-only access). Create an editable copy in My garden?',
        bodyHtml: false,
        confirmText: ui.forkNetworkTreeConfirmButton || ui.dialogOkButton || 'Continue',
        cancelText: ui.cancel || 'Cancel'
    });
    if (ok !== true) return;
    const defaultName = String(
    (store.state.activeSource && store.state.activeSource.name) ||
    (store.state.rawGraphData && store.state.rawGraphData.universeName) ||
    ''
    ).trim();
    const typed = await store.showDialog({
        type: 'prompt',
        title: ui.forkNetworkTreePromptTitle || 'Name your copy',
        body: ui.forkNetworkTreePromptBody || 'Choose a name for the new tree in My garden.',
        bodyHtml: false,
        placeholder: defaultName || (ui.forkNetworkTreePromptPlaceholder || 'My copy'),
        confirmText: ui.forkNetworkTreeCreateButton || ui.plantBranchShort || 'Create'
    });
    if (typed === null || typed === false) return;
    const name = String(typed || '').trim();
    if (!name) {
        store.notify(ui.forkNetworkTreeEmptyName || 'Please enter a name.', true);
        return;
    }
    try {
        const entry = store.userStore.plantBranchFromCurriculumClone(name, store.state.rawGraphData, {
            sourceUrl: String(store.state.activeSource?.url || '').trim(),
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
