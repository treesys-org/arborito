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
import { branchIdFromBranchUrl } from '../shared/lib/branch-id.js';
import { resolvePublishSuccessTitle } from '../features/publishing/api/resolve-publish-content-copy.js';
import { getActivePublishContext } from '../features/editor/api/construction-scope-publish.js';
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
    const publishPromise = store.publishActiveTreeToNostrUniverse({
        reuseNostrTreeUrl: reuse,
        includeForum,
        listInDiscover
    });
    try {
        try {
            pubRes = await Promise.race([
                publishPromise,
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
                /* Budget exceeded: keep the lock and wait for the in-flight publish
                 * so we do not leave a silent orphan on the relays. */
                try {
                    pubRes = await publishPromise;
                } catch (e2) {
                    console.warn('publish after timeout failed', e2);
                    await showInteractivePublishFailureDialog(store, ui, 'timeout', '');
                    return;
                }
            } else {
                if (c.kind === 'forbidden') {
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
    const localId = branchIdFromBranchUrl(srcUrl);
    if (localId) {
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
    const publishKind = getActivePublishContext(store.state.activeSource)?.kind;
    const shortLink = shareCode ? buildPublicShareAppUrl(`?code=${encodeURIComponent(shareCode)}`) : '';
    const leadText = pubRes.republish
        ? publishKind === 'composed-tree'
            ? ui.publicTreeRepublishSuccessLeadComposed ||
              ui.publicTreeRepublishSuccessLead ||
              'Your public tree was updated. Existing links still work.'
            : publishKind === 'branch'
              ? ui.publicTreeRepublishSuccessLeadBranch ||
                ui.publicTreeRepublishSuccessLead ||
                'Your public branch was updated. Existing links still work.'
              : ui.publicTreeRepublishSuccessLead ||
                'Your public copy was updated. Existing links still work.'
        : ui.publicTreeSuccessLead ||
          'Share the code or link so others can open this course in Arborito.';
    const codeBlock = shareCode
        ? `<p class="text-sm font-bold text-slate-700 dark:text-slate-200 m-0 mb-2">${esc(ui.publicTreeSuccessCodeLabel || 'Share code')}: <span class="font-mono tracking-wide text-emerald-600 dark:text-emerald-400">${esc(shareCode)}</span></p><p class="text-xs text-slate-500 dark:text-slate-400 m-0 mb-3">${esc(ui.publicTreeSuccessCodeHint || 'Others can type this code in Trees → Add a tree (no account needed).')}</p>`
        : '';
    const note = includeForum
        ? ui.publicTreeSuccessNote ||
          'Share the code or link. You can unpublish the public copy from Construction → Unpublish.'
        : ui.publicTreeSuccessNoteNoForum ||
          'Share the code or link to open the lessons. You can unpublish the public copy from Construction → Unpublish.';
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
            : resolvePublishSuccessTitle(ui, publishKind),
        body,
        bodyHtml: true,
        confirmText: ui.dialogOkButton || 'OK',
        dialogIcon: '✅',
    });

    /* Keep the local branch active after publish. Users open the public mirror
     * from Sources when they want; do not auto-swap the active source or strip
     * bookmarks here (relay propagation can lag right after publish). */

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
    /* Materialize + clone can take seconds on large network trees — show block overlay. */
    const busyHint = isDemo
        ? ui.forkDemoTreeBusy || ui.forkNetworkTreeBusy || ui.treeGrowingShort || 'Creating your editable copy…'
        : ui.forkNetworkTreeBusy || ui.treeGrowingShort || 'Creating your editable copy…';
    store.update({ treeHydrating: true, treeGrowingOverlay: true, treeGrowingHint: busyHint });
    await yieldToPaint();
    try {
        if (typeof store.graphLogic?.materializeAllLazyLessonBodiesIntoRaw === 'function') {
            await store.graphLogic.materializeAllLazyLessonBodiesIntoRaw();
        }
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
        if (enterConstruction && store.state.constructionMode) {
            /* Same path as toggleConstructionMode — copy used to skip the tour event. */
            queueMicrotask(() => {
                try {
                    if (localStorage.getItem('arborito-ui-tour-done-construction')) return;
                } catch {
                    /* ignore */
                }
                window.dispatchEvent(
                    new CustomEvent('arborito-start-tour', {
                        detail: { source: 'fork-local-copy', mode: 'construction' },
                    })
                );
            });
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
    } finally {
        store.update({ treeHydrating: false, treeGrowingOverlay: false, treeGrowingHint: null });
    }

}
