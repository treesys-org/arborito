import { getArboritoStore } from '../core/store-singleton.js';
import { isNostrNetworkAvailable, parseNostrTreeUrl, formatNostrTreeUrl, createNostrPair } from '../features/nostr/api/nostr-refs.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { generateTreeShareCode } from '../features/sources/api/share-code.js';
import { randomUUIDSafe } from '../shared/lib/secure-web-crypto.js';
import { ensureConnectedNostr } from '../shared/lib/connected-services/index.js';
import { yieldToPaint } from '../shared/lib/yield-to-paint.js';
import { usesGlobalDirectoryPointerForTorrent } from '../features/p2p-webtorrent/api/global-directory-torrent-runtime.js';
import { escHtml as esc } from '../shared/lib/html-escape.js';
import { buildPublicShareAppUrl } from '../shared/lib/public-app-url.js';
import { branchIdFromBranchUrl } from '../shared/lib/branch-id.js';
import { resolvePublishSuccessTitle } from '../features/publishing/api/resolve-publish-content-copy.js';
import { getActivePublishContext } from '../features/editor/api/construction-scope-publish.js';
import { shell, classifyPublishNetworkError, publishDialogLinkSectionHtml, showInteractivePublishFailureDialog } from './publishing-publish-revoke-helpers.js';
import { openPublishHub, requireSignInForPublish } from '../features/publishing/api/account-hub-gate.js';
import { isArboritoDemoTree } from '../features/publishing/api/demo-tree-guard.js';
import { DEMO_BRANCH_ID } from '../core/demo/arborito-demo-ids.js';
import {
    curriculumHasLocalMedia,
} from '../features/tree-graph/api/tree-import-sanitize.js';
import { collectLocalMediaLessonTitles } from '../features/learning/api/lesson-local-media-store.js';

/** Confirm omit-local-media before locking the UI with publishingTree. */
async function confirmLocalMediaBeforePublishLock(store) {
    const ui = store.ui || {};
    if (store.state.activeSource?.type === 'composed-tree') {
        const tid = String(store.state.activeSource.treeId || '').trim();
        const entry = tid ? store.userStore?.getTree?.(tid) : null;
        const titles = [];
        for (const ref of entry?.branchRefs || []) {
            const bid = String(ref?.branchId || ref?.id || '').trim();
            const data = bid ? store.userStore?.getBranchData?.(bid) : null;
            if (data && curriculumHasLocalMedia(data)) {
                for (const t of collectLocalMediaLessonTitles(data)) titles.push(t);
            }
        }
        if (!titles.length) return true;
        const unique = [...new Set(titles)];
        const list = `\n\n• ${unique.slice(0, 12).join('\n• ')}${unique.length > 12 ? '\n• …' : ''}`;
        const intro =
            ui.publishLocalMediaOmitBody ||
            'These lessons still use Local media (./media/). Replace with moderated links, or publish omitting Local media (those blocks will be empty online).';
        return !!(await store.confirm(
            `${intro}${list}`,
            ui.publishLocalMediaOmitTitle || 'Local media found',
            false,
            ui.publishLocalMediaOmitConfirm || 'Publish without Local media'
        ));
    }

    try {
        if (typeof store.graphLogic?.materializeAllLazyLessonBodiesIntoRaw === 'function') {
            await store.graphLogic.materializeAllLazyLessonBodiesIntoRaw();
        }
    } catch (e) {
        console.warn('[Arborito] materialize before local-media check', e);
    }
    const bundle = store.buildArboritoBundleObject?.();
    const tree = bundle?.tree || store.state.rawGraphData;
    if (!curriculumHasLocalMedia(tree)) return true;
    const lessons = collectLocalMediaLessonTitles(tree);
    const list =
        lessons.length > 0
            ? `\n\n• ${lessons.slice(0, 12).join('\n• ')}${lessons.length > 12 ? '\n• …' : ''}`
            : '';
    const intro =
        ui.publishLocalMediaOmitBody ||
        'These lessons still use Local media (./media/). Replace with moderated links, or publish omitting Local media (those blocks will be empty online).';
    return !!(await store.confirm(
        `${intro}${list}`,
        ui.publishLocalMediaOmitTitle || 'Local media found',
        false,
        ui.publishLocalMediaOmitConfirm || 'Publish without Local media'
    ));
}

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

    /* Bundled demo / other read-only trees: never attempt a live publish. */
    if (isArboritoDemoTree(store) || !fileSystem.features.canWrite) {
        await offerLocalCopyFromNetworkTreeForEditingAction({ enterConstruction: true });
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

    const reuse = (() => {
        const ref = (store.getPublishedTreeRefForActiveLocalSource && store.getPublishedTreeRefForActiveLocalSource());
        if (!ref) return null;
        const pair = store.getNostrPublisherPair(ref.pub);
        if (!(pair && pair.priv)) return null;
        return formatNostrTreeUrl(ref.pub, ref.universeId);
    })();

    /* Ask about Local media before locking construction / showing “Publishing…”. */
    if (!(await confirmLocalMediaBeforePublishLock(store))) return;

    // Optional WebTorrent magnets — only after media confirm so cancel does not dirty the draft.
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
    let publishSoftExit = false;
    const publishPromise = store.publishActiveTreeToNostrUniverse({
        reuseNostrTreeUrl: reuse,
        includeForum,
        listInDiscover,
        skipLocalMediaConfirm: true,
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
            /* Cancel / already-notified soft exits return null — do not show “no-result”. */
            publishSoftExit = true;
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

        /*
         * Freeze the published baseline *now* (while still locked). Cloning only inside
         * scheduleIdle races with edits and marks later drafts as already published.
         */
        const srcUrl = (store.state.activeSource && store.state.activeSource.url);
        const localId = branchIdFromBranchUrl(srcUrl);
        if (localId) {
            let frozenSnapshot = null;
            try {
                frozenSnapshot = JSON.parse(JSON.stringify(store.state.rawGraphData));
            } catch {
                frozenSnapshot = store.state.rawGraphData;
            }
            store.userStore.setBranchPublishedNetworkUrl(
                localId,
                pubRes.publicTreeUrl,
                pubRes.shareCode || '',
                { bundleGen: pubRes.gen || undefined }
            );
            try {
                const entry = store.userStore.state.branches.find((t) => t.id === localId);
                if (entry && pubRes.shareCode) {
                    entry.data = entry.data && typeof entry.data === 'object' ? entry.data : {};
                    entry.data.meta = entry.data.meta && typeof entry.data.meta === 'object' ? entry.data.meta : {};
                    entry.data.meta.shareCode = pubRes.shareCode;
                }
                if (entry && pubRes.inactivityPolicy) entry.publishedInactivityPolicy = pubRes.inactivityPolicy;
                if (entry && frozenSnapshot) {
                    try {
                        entry.data = JSON.parse(JSON.stringify(frozenSnapshot));
                    } catch {
                        entry.data = frozenSnapshot;
                    }
                }
                store.userStore.markBranchDirty(localId);
                store.userStore.persist();
            } catch {
                /* ignore */
            }
            if (frozenSnapshot) {
                store.userStore.setBranchPublishedSnapshot(localId, frozenSnapshot);
            }
            /*
             * Public mirror ≠ editable account draft. Keep a silent encrypted copy on the
             * account so the author can continue from other devices (no extra prompt).
             */
            try {
                if (typeof store.publishBranchAsPrivate === 'function') {
                    void store.publishBranchAsPrivate(localId, { silent: true }).catch((e) => {
                        console.warn('[arborito] post-publish account draft sync failed', e);
                    });
                }
            } catch (e) {
                console.warn('[arborito] post-publish account draft sync failed', e);
            }
        }
    } finally {
        store.update({ publishingTree: false, treeGrowingOverlay: false });
    }
    if (publishSoftExit || !(pubRes && pubRes.publicTreeUrl)) return;

    try {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('arborito-construction-scope-changed'));
        }
    } catch {
        /* ignore */
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

    /* Success dialog must show: showDialog no-ops while another resolver is live. */
    const dialogWaitStarted = Date.now();
    while (store._dialogResolver && Date.now() - dialogWaitStarted < 2500) {
        await yieldToPaint();
    }
    if (store._dialogResolver) {
        console.warn('[Arborito] publish success dialog skipped: another dialog still open');
    } else {
        await store.acknowledge({
            title: pubRes.republish
                ? ui.publicTreeRepublishSuccessTitle || 'Changes published'
                : resolvePublishSuccessTitle(ui, publishKind),
            body,
            bodyHtml: true,
            confirmText: ui.dialogOkButton || 'OK',
            dialogIcon: '✅',
        });
    }

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
    let entry = null;
    try {
        await store.userStore?.ensureBranchesHydrated?.();
        if (typeof store.graphLogic?.materializeAllLazyLessonBodiesIntoRaw === 'function') {
            await store.graphLogic.materializeAllLazyLessonBodiesIntoRaw();
        }
        entry = store.userStore.plantBranchFromCurriculumClone(name, store.state.rawGraphData, {
            sourceUrl: isDemo
                ? `branch://${DEMO_BRANCH_ID}`
                : String(store.state.activeSource?.url || '').trim(),
        });
        /* Await durable catalog write — fire-and-forget persist can lose the fork. */
        if (typeof store.userStore?.flushBranchEntry === 'function') {
            await store.userStore.flushBranchEntry(entry.id);
        } else {
            const { persistBranchEntry } = await import('../shared/lib/arborito-catalog-store.js');
            await persistBranchEntry(entry);
        }
        if (isDemo) {
            void import('../core/demo/import-demo-media.js')
                .then((m) => m.importBundledDemoMedia(entry.id))
                .catch((e) => console.warn('[Arborito] demo media copy for fork failed', e));
        }
        const mounted = await store.loadData(
            { id: entry.id, name: entry.name, url: `branch://${entry.id}`, type: 'branch', isTrusted: true },
            true,
            { skipConstructionLoadConfirm: true, freshBranchId: entry.id }
        );
        const activeUrl = String(store.state.activeSource?.url || '');
        const activeId = activeUrl.startsWith('branch://')
            ? activeUrl.slice('branch://'.length).split('/')[0]
            : '';
        const onCopy =
            mounted !== false &&
            activeId === entry.id &&
            !!store.state.rawGraphData &&
            !!fileSystem.features.canWrite;

        if (enterConstruction && onCopy) {
            if (!store.state.constructionMode) {
                store.update({ constructionMode: true });
            }
            /* Same path as toggleConstructionMode — copy used to skip the tour event. */
            queueMicrotask(async () => {
                const { requestConstructionTourOnce } = await import(
                    '../features/tour/api/product-tour-start-bridge.js'
                );
                requestConstructionTourOnce({ source: 'fork-local-copy' });
            });
        } else if (!onCopy) {
            /* Never leave construction mode on the read-only demo after a failed switch. */
            if (store.state.constructionMode) {
                store.update({ constructionMode: false });
            }
            store.notify(
                ui.forkNetworkTreeLoadFailed ||
                    ui.forkNetworkTreeError ||
                    'Could not open your copy. Find it in My garden (Bosque) or try again.',
                true
            );
        }
    } catch (e) {
        console.warn('offerLocalCopyFromNetworkTreeForEditing', e);
        if (store.state.constructionMode) {
            store.update({ constructionMode: false });
        }
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
