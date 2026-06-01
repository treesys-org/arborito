import { isNostrNetworkAvailable, parseNostrTreeUrl, formatNostrTreeUrl, createNostrPair } from '../../nostr/nostr-refs.js';
import { fileSystem } from '../../backup-export/filesystem.js';
import { generateTreeShareCode } from '../../sources/share-code.js';
import { randomUUIDSafe } from '../../../shared/lib/secure-web-crypto.js';
import { usesGlobalDirectoryPointerForTorrent } from '../../p2p-webtorrent/global-directory-torrent-runtime.js';
import { escHtml as esc, escHtml as escAttr } from '../../../shared/lib/html-escape.js';

/**
 * Scrollable monospace preview + open / copy actions for publish-success dialog HTML.
 * @param {Record<string, string>} ui
 * @param {string} url
 * @param {string} sectionLabelEsc
 * @param {'emerald' | 'slate'} tone
 * @param {string} [firstLineExtraClass]
 */
function publishDialogLinkSectionHtml(ui, url, sectionLabelEsc, tone, firstLineExtraClass = '') {
    const href = escAttr(url);
    const openL = esc(ui.publicTreeSuccessOpenLink || 'Open link');
    const copyL = esc(ui.publicTreeSuccessCopyLink || 'Copy');
    const box =
        tone === 'emerald'
            ? 'border-emerald-200/90 dark:border-emerald-800/50 bg-emerald-50/95 dark:bg-emerald-950/35'
            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60';
    const aTone =
        tone === 'emerald'
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-slate-600 dark:text-slate-300';
    const extra = firstLineExtraClass ? ` ${firstLineExtraClass}` : '';
    return `<p class="arborito-eyebrow m-0 mb-1${extra}">${sectionLabelEsc}</p><div class="max-h-28 w-full max-w-full overflow-auto overscroll-contain rounded-lg border ${box} p-2 text-left"><code class="block m-0 text-[11px] font-mono text-slate-700 dark:text-slate-200 break-all whitespace-pre-wrap leading-snug">${esc(url)}</code></div><p class="flex flex-wrap gap-3 justify-center items-center m-0 mt-2"><a href="${href}" target="_blank" rel="noopener noreferrer" class="text-sm font-semibold ${aTone} underline">${openL}</a><button type="button" data-copy="${escAttr(url)}" class="text-sm font-semibold px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:opacity-90 active:scale-[0.98]">${copyL}</button></p>`;
}

/**
 * @param {unknown} err
 * @returns {{ kind: 'timeout' | 'event-package' | 'forbidden' | 'relay' | 'generic', detail: string }}
 */
function classifyPublishNetworkError(err) {
    if (err && err.code === 'pub-timeout') return { kind: 'timeout', detail: '' };
    const raw = String((err && err.message) || err || '').trim();
    const low = raw.toLowerCase();
    /* nostr-tools: validateEvent / JSON.stringify before send — suele ser datos del paquete, no “el Wi‑Fi”. */
    if (low.includes("can't serialize event") || low.includes('serialize event with wrong')) {
        return { kind: 'event-package', detail: raw };
    }
    /* NIP-20 OK:false rejections from the relay. The browser reached the relay
     * fine — the relay just refuses our key. Telling the user "check your Wi‑Fi"
     * here is misleading; the actionable fix is to change the relay list. */
    if (
        low.includes('blocked:') ||
        low.includes('blocked ') ||
        low.includes('restricted:') ||
        low.includes('auth-required') ||
        low.includes('not authorized') ||
        low.includes('not allowed') ||
        low.includes('does not have permission') ||
        low.includes('only notes signed by') ||
        low.includes('paid relay') ||
        low.includes('invalid pow')
    ) {
        return { kind: 'forbidden', detail: raw };
    }
    if (
        low.includes('publish failed on all relays') ||
        low.includes('websocket') ||
        low.includes('wss://') ||
        /econnrefused|enotfound|enetunreach|econnreset|echostunreach/.test(low) ||
        /failed to fetch|networkerror|network request failed|load failed|socket hang up/.test(low) ||
        /timed out|op_closed|closed unexpectedly/.test(low)
    ) {
        return { kind: 'relay', detail: raw };
    }
    return { kind: 'generic', detail: raw };
}

/**
 * Modal notice (not just toast): above the map and more visible than `notify` if another scrim was open.
 * @param {{ showDialog: (o: object) => Promise<unknown> }} store
 * @param {Record<string, string>} ui
 * @param {'timeout' | 'event-package' | 'forbidden' | 'relay' | 'generic' | 'no-result'} kind
 * @param {string} [detail]
 */
async function showInteractivePublishFailureDialog(store, ui, kind, detail = '') {
    const d = String(detail || '').trim();
    const detailLine = d ? `\n\n${d}` : '';
    let title;
    let body;
    if (kind === 'timeout') {
        title = ui.publicTreePublishTimeoutTitle || ui.publicTreePublishFailedTitle || 'Publish timed out';
        body = (ui.publicTreePublishTimeout || 'Publishing took too long.') + detailLine;
    } else if (kind === 'event-package') {
        title = ui.publicTreePublishEventPackageTitle || ui.publicTreePublishFailedTitle || 'Could not prepare upload';
        const tmpl = String(ui.publicTreePublishEventPackageBody || '').trim();
        const rep = d || String(ui.publicTreePublishRelayNoDetail || '—');
        body = (tmpl.includes('{detail}') ? tmpl.replace(/\{detail\}/g, rep) : `${tmpl}${detailLine}`).trim();
    } else if (kind === 'forbidden') {
        title = ui.publicTreePublishForbiddenTitle || ui.publicTreePublishFailedTitle || 'Relays refused your key';
        const tmpl = String(ui.publicTreePublishForbiddenBody || '').trim();
        const rep = d || String(ui.publicTreePublishRelayNoDetail || '—');
        body = (tmpl.includes('{detail}') ? tmpl.replace(/\{detail\}/g, rep) : `${tmpl}${detailLine}`).trim();
    } else if (kind === 'relay') {
        title = ui.publicTreePublishRelayTitle || ui.publicTreePublishFailedTitle || 'Relay connection failed';
        const tmpl = String(ui.publicTreePublishRelayBody || '').trim();
        const rep = d || String(ui.publicTreePublishRelayNoDetail || '—');
        body = (tmpl.includes('{detail}') ? tmpl.replace(/\{detail\}/g, rep) : `${tmpl}${detailLine}`).trim();
    } else if (kind === 'no-result') {
        title = ui.publicTreePublishNoResultTitle || ui.publicTreePublishFailedTitle || 'Publish did not finish';
        const lead = String(ui.publicTreePublishNoResult || '').trim();
        const hint = String(ui.publicTreePublishNoResultHint || '').trim();
        body = hint ? `${lead}\n\n${hint}` : lead;
    } else {
        title = ui.publicTreePublishFailedTitle || 'Could not publish';
        const tmpl = String(ui.publicTreePublishFailedBody || '').trim();
        const rep = d || String(ui.publicTreePublishRelayNoDetail || '—');
        body = (tmpl.includes('{detail}') ? tmpl.replace(/\{detail\}/g, rep) : `${tmpl}${detailLine}`).trim();
    }
    await store.showDialog({
        type: 'alert',
        title,
        body,
        bodyHtml: false,
        confirmText: ui.dialogOkButton || 'OK'
    });
}

/** Mixin applied to `Store.prototype` — extracted from `store.js` to reduce file size. */
export const publishRevokeMethods = {
    async publishActiveTreeToNostrUniverse({ universeId = null, reuseNostrTreeUrl = null } = {}) {
        const ui = this.ui;
        const bundle = this.buildArboritoBundleObject();
        if (!bundle) {
            this.notify(ui.forumNoTree || 'No tree loaded.', true);
            return null;
        }
        if (!isNostrNetworkAvailable()) {
            this.notify(
                ui.nostrNotLoadedHint ||
                    'Nostr relays unavailable (see index.html). Configure relays and reload to publish.',
                true
            );
            return null;
        }
        // GDPR/minimization: public universes should not ship learner progress or usernames.
        bundle.progress = { completedNodes: [], memory: {}, bookmarks: {}, gamification: {}, gameData: {} };

        const activeTreeRef = this.getActivePublicTreeRef();
        const reuseRef = reuseNostrTreeUrl ? parseNostrTreeUrl(reuseNostrTreeUrl) : null;
        const publishedLocalRef = (this.getPublishedTreeRefForActiveLocalSource && this.getPublishedTreeRefForActiveLocalSource()) || null;
        const effectiveRef = reuseRef || activeTreeRef || publishedLocalRef;
        const adminPair = effectiveRef ? this.getNostrPublisherPair(effectiveRef.pub) : null;
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
        } else {
            try {
                pair = await createNostrPair();
            } catch (e) {
                console.warn(e);
                this.notify(
                    this.ui.nostrIdentityUnavailable || 'Publishing needs HTTPS or localhost for crypto on this browser.',
                    true
                );
                return null;
            }
            id = String(universeId || `arb-${randomUUIDSafe()}`);
            for (let attempt = 0; attempt < 12; attempt++) {
                const candidate = generateTreeShareCode();
                const taken = await this.nostr.loadCodeRecordOnce(candidate);
                if (!taken) {
                    shareCode = candidate;
                    break;
                }
            }
            if (!shareCode) {
                this.notify(ui.publicTreeCodeAllocFailed || 'Could not allocate a share code. Try again.', true);
                return null;
            }
            bundle.meta = bundle.meta && typeof bundle.meta === 'object' ? bundle.meta : {};
            bundle.meta.shareCode = shareCode;
        }

        await this.nostr.publishBundle({ pair, universeId: id, bundle });

        // Global directory (metadata-only): let others discover this tree without indexing content.
        try {
            /* Bundled tree shape is `{ languages: { EN: {...}, ES: {...} } }`. We surface the
             * declared language keys in the directory meta so the Trees picker can show language
             * pills before the user installs the bundle (they were missing previously). Cheap to
             * derive — bundle.tree is already a deep copy at this point. */
            const langKeys =
                bundle && bundle.tree && bundle.tree.languages && typeof bundle.tree.languages === 'object'
                    ? Object.keys(bundle.tree.languages)
                    : [];
            await this.nostr.putGlobalTreeDirectoryEntry({
                pair,
                universeId: id,
                title: String(((bundle && bundle.meta) ? bundle.meta.title : undefined) || ((bundle && bundle.meta) ? bundle.meta.universeName : undefined) || 'Arborito'),
                shareCode: String(((bundle && bundle.meta) ? bundle.meta.shareCode : undefined) || shareCode || ''),
                description: String(((bundle && bundle.meta) ? bundle.meta.description : undefined) || '').trim(),
                authorName: String(((bundle && bundle.meta) ? bundle.meta.authorName : undefined) || '').trim(),
                languages: langKeys,
                recommendedRelays: Array.isArray((this.nostr && this.nostr.peers)) ? this.nostr.peers : null
            });
            // Light signal for the directory aggregator **recent** index (Nostr directory bump).
            try {
                await this.nostr.putDirectoryBumpForPublishedTree(pair, id);
            } catch (e2) {
                console.warn('directory bump failed', e2);
            }
        } catch (e) {
            // Best-effort: publishing the bundle must still succeed even if directory is unavailable.
            console.warn('global directory publish failed', e);
        }

        if (!republish) {
            await this.nostr.putTreeCodeClaim({
                pair,
                code: shareCode,
                universeId: id,
                // Transparent relay bootstrap: publish current peer list as recommendations for this tree.
                recommendedRelays: Array.isArray((this.nostr && this.nostr.peers)) ? this.nostr.peers : null
            });
            this.saveNostrPublisherPair(pair);
        }

        const publicTreeUrl = formatNostrTreeUrl(pair.pub, id);
        return { publicTreeUrl, pub: pair.pub, universeId: id, shareCode: shareCode || '', republish };
    },

    /**
     * Construction-mode flow: warn, then publish bundle to the public network.
     * Friendly copy only — no jargon in the success dialog.
     */
    async publishTreePublicInteractive() {
        const ui = this.ui;
        if (!this.hasAcceptedAuthorLicense()) {
            this.acceptAuthorLicense();
        }
        if (!this.state.rawGraphData || !this.state.activeSource) {
            this.notify(ui.forumNoTree || 'No tree loaded.', true);
            return;
        }
        if (typeof this.isSignedIn === 'function' && !this.isSignedIn()) {
            await this.showDialog({
                type: 'alert',
                title: ui.publishNeedLoginTitle || 'Sign in required',
                body:
                    ui.publishNeedLoginBody ||
                    'To publish a tree to the network, open Profile and sign in with your sync code first (from the More menu on mobile, or your account entry on desktop).',
                bodyHtml: false,
                confirmText: ui.dialogOkButton || 'OK'
            });
            if (typeof this.setModal === 'function') {
                queueMicrotask(() => this.setModal({ type: 'profile' }));
            }
            return;
        }
        const metaCheck = this.validatePublicationMetadata();
        if (!metaCheck.ok) {
            await this.showDialog({
                type: 'alert',
                title: ui.publishMetaRequiredTitle || 'Course details required',
                body: metaCheck.message,
                confirmText: ui.dialogOkButton || 'OK'
            });
            return;
        }
        // "Republish" is allowed even if we're still on a local editor, as long as this local tree
        // has an associated published public tree URL and we still have the publisher key.
        const republish =
            this.canRetractActivePublicUniverse() ||
            (() => {
                const ref = (this.getPublishedTreeRefForActiveLocalSource && this.getPublishedTreeRefForActiveLocalSource());
                return !!(ref && (this.getNostrPublisherPair(ref.pub) ? this.getNostrPublisherPair(ref.pub).priv : undefined));
            })();
        /* Appends to publish/republish confirm; copy in locales: publicTreeLicenseReminder */
        const ccRem = String(ui.publicTreeLicenseReminder || '').trim();
        let pubBody = republish
            ? ui.publicTreeRepublishBody ||
              'This updates the public copy of this course on the network (same links and share code). Learner progress in the bundle is still minimized. Continue?'
            : ui.publicTreeConfirmBody ||
              'This will publish a copy of the tree, forum, and progress data for others to open. You can retract it later from this device if you still have the publisher key (Construction → Retract). Honest peers will stop showing the tree; malicious mirrors might retain copies. Do not include confidential information.';
        if (ccRem) {
            pubBody = republish
                ? `${pubBody}\n\n${ccRem}`
                : `${pubBody}<br /><br /><p class="text-xs m-0 text-slate-600 dark:text-slate-300">${esc(ccRem)}</p>`;
        }
        const ok = await this.showDialog({
            type: 'confirm',
            title: republish
                ? ui.publicTreeRepublishTitle || 'Publish changes online'
                : ui.publicTreeTitle || 'Make this tree public',
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
            this.notify(
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
            if ((this.webtorrent && this.webtorrent.available ? this.webtorrent.available() : false) && this.state.rawGraphData) {
                const wtMeta = await Promise.race([
                    this.prepareWebTorrentBucketsForActiveTree(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(Object.assign(new Error('wt-timeout'), { code: 'wt-timeout' })), wtBudgetMs)
                    )
                ]);
                if (wtMeta) {
                    const raw = this.state.rawGraphData;
                    raw.meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
                    raw.meta.webtorrent = wtMeta;
                }
            }
        } catch (e) {
            if (e && e.code === 'wt-timeout') {
                this.notify(ui.publicTreePublishWtTimeout || 'Optional packaging timed out; publishing without it.', false);
            } else {
                console.warn('WebTorrent bucket publish preparation failed', e);
            }
        }

        const reuse = (() => {
            const ref = (this.getPublishedTreeRefForActiveLocalSource && this.getPublishedTreeRefForActiveLocalSource());
            if (!ref) return null;
            const pair = this.getNostrPublisherPair(ref.pub);
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
        this.update({ publishingTree: true, treeGrowingOverlay: true });
        let pubRes;
        try {
            try {
                pubRes = await Promise.race([
                    this.publishActiveTreeToNostrUniverse({ reuseNostrTreeUrl: reuse }),
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
                    await showInteractivePublishFailureDialog(this, ui, 'timeout', '');
                } else if (c.kind === 'forbidden') {
                    await showInteractivePublishFailureDialog(this, ui, 'forbidden', c.detail);
                } else if (c.kind === 'relay') {
                    await showInteractivePublishFailureDialog(this, ui, 'relay', c.detail);
                } else if (c.kind === 'event-package') {
                    await showInteractivePublishFailureDialog(this, ui, 'event-package', c.detail);
                } else {
                    await showInteractivePublishFailureDialog(this, ui, 'generic', c.detail);
                }
                return;
            }
            if (!(pubRes && pubRes.publicTreeUrl)) {
                await showInteractivePublishFailureDialog(this, ui, 'no-result', '');
                return;
            }
        } finally {
            this.update({ publishingTree: false, treeGrowingOverlay: false });
        }
        const srcUrl = (this.state.activeSource && this.state.activeSource.url);
        if (srcUrl && String(srcUrl).startsWith('local://')) {
            const localId = String(srcUrl).slice('local://'.length);
            this.userStore.setLocalTreePublishedNetworkUrl(localId, pubRes.publicTreeUrl);
            // Snapshot the published baseline so the UI can show a Draft + diff vs published.
            try {
                this.userStore.setLocalTreePublishedSnapshot(localId, this.state.rawGraphData);
                const entry = this.userStore.state.localTrees.find((t) => t.id === localId);
                if (entry) entry.draftHash = this.userStore.hashJson(entry.data);
            } catch {
                /* ignore */
            }
        }
        const shareCode = pubRes.shareCode || '';
        const treeName = (this.state.activeSource && this.state.activeSource.name) || 'tree';
        const locationCode = pubRes.publicTreeUrl ? pubRes.publicTreeUrl.split('/').pop().slice(0, 8) : '';

        const shortLink = shareCode
            ? `${window.location.origin}${window.location.pathname}?code=${encodeURIComponent(shareCode)}/tree=${encodeURIComponent(treeName)}/location=${encodeURIComponent(locationCode)}`
            : '';
        const leadText = pubRes.republish
            ? ui.publicTreeRepublishSuccessLead ||
              'Your public course was updated. Existing links still work.'
            : ui.publicTreeSuccessLead || 'Your tree is now online. Share the link below so others can open the same course.';
        const codeBlock = shareCode
            ? `<p class="text-sm font-bold text-slate-700 dark:text-slate-200 m-0 mb-2">${esc(ui.publicTreeSuccessCodeLabel || 'Share code')}: <span class="font-mono tracking-wide text-emerald-600 dark:text-emerald-400">${esc(shareCode)}</span></p><p class="text-xs text-slate-500 dark:text-slate-400 m-0 mb-3">${esc(ui.publicTreeSuccessCodeHint || 'Others can type this code in Trees → Add a tree (no account needed).')}</p>`
            : '';
        const note = ui.publicTreeSuccessNote || 'Anyone with the link can read the tree, forum, and the progress snapshots in this bundle. Use Retract in construction mode to signal the network to drop this tree (this device must keep the publisher key). Malicious peers might still retain data—never publish secrets.';
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

        await this.showDialog({
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
         *      `local://…` to the public `nostr://…` copy.
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
    },

    /**
     * Retract a public universe by explicit URL (works even if the active editor is local://).
     * @param {{ publicTreeUrl?: string|null, nostrTreeUrl?: string|null, localTreeIdToUnlink?: string|null }} [opts]
     */
    async revokePublicTreeInteractive(opts = {}) {
        const treeUrl = String((opts && (opts.publicTreeUrl || opts.nostrTreeUrl)) || '');
        const treeRef = treeUrl ? parseNostrTreeUrl(treeUrl) : this.getActivePublicTreeRef();
        if (!treeRef) {
            await this.revokeActivePublicTreeInteractive();
            return;
        }
        const ui = this.ui;
        if (!isNostrNetworkAvailable()) {
            this.notify(
                ui.nostrNotLoadedHint ||
                    'Nostr relays unavailable (see index.html). Configure relays and reload to retract.',
                true
            );
            return;
        }
        const pair = this.getNostrPublisherPair(treeRef.pub);
        if (!(pair && pair.priv)) {
            await this.showDialog({
                type: 'alert',
                title: ui.revokePublicTreeNoKeyTitle || 'Publisher key not found',
                body:
                    ui.revokePublicTreeNoKeyBody ||
                    'Retracting requires the same browser profile that published this tree. If you cleared storage or use another device, you cannot sign a retraction from here.',
                confirmText: ui.dialogOkButton || 'OK'
            });
            return;
        }
        const ok = await this.showDialog({
            type: 'confirm',
            title: ui.revokePublicTreeConfirmTitle || 'Retract this public tree?',
            body:
                ui.revokePublicTreeConfirmBody ||
                'This will publish a <strong>retraction</strong> on the network and clear the bundle for cooperating peers. People who already copied data elsewhere might still have it. Continue?',
            bodyHtml: true,
            danger: true,
            confirmText: ui.revokePublicTreeConfirmButton || 'Retract',
            cancelText: ui.cancel || 'Cancel'
        });
        if (!ok) return;
        try {
            await this.nostr.revokeUniverse({ pair, universeId: treeRef.universeId, reason: '' });
            try {
                await this.nostr.putGlobalTreeDirectoryDelist({ pair, universeId: treeRef.universeId });
            } catch (e2) {
                console.warn('global directory delist failed', e2);
            }
            if ((opts && opts.localTreeIdToUnlink) && (this.userStore && this.userStore.clearLocalTreePublishedNetworkUrl)) {
                this.userStore.clearLocalTreePublishedNetworkUrl(opts.localTreeIdToUnlink);
            }
            // Also remove the now-revoked tree from this device's installed
            // sources list so it stops appearing in the Trees picker. Without
            // this, the user sees their own retracted tree as a still-listed
            // source until they manually uninstall it.
            try {
                const revokedUrl = `nostr://${treeRef.pub}/${treeRef.universeId}`;
                const sm = this.sourceManager;
                const list = (sm && sm.state && Array.isArray(sm.state.communitySources)) ? sm.state.communitySources : [];
                for (const s of list) {
                    const u = String(s && s.url || '');
                    if (u === revokedUrl) sm.removeCommunitySource(s.id);
                }
            } catch (e3) {
                console.warn('post-revoke source cleanup failed', e3);
            }
            await this.showDialog({
                type: 'alert',
                title: ui.revokePublicTreeSuccessTitle || 'Tree retracted',
                body:
                    ui.revokePublicTreeSuccessBody ||
                    'The public network was asked to stop serving this tree. You can publish again with a new link anytime.',
                confirmText: ui.dialogOkButton || 'OK'
            });
            this.update({});
        } catch (e) {
            console.warn('revokePublicTreeInteractive', e);
            this.notify(ui.revokePublicTreeError || 'Could not complete retraction.', true);
        }
    },

    /**
     * Retract this public universe: signed tombstone + clear bundle for honest peers.
     * Requires the same device/key used when publishing (stored in localStorage).
     */
    async revokeActivePublicTreeInteractive() {
        const ui = this.ui;
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef) {
            this.notify(ui.revokePublicTreeNoUniverse || 'Switch to a public tree first.', true);
            return;
        }
        if (!isNostrNetworkAvailable()) {
            this.notify(
                ui.nostrNotLoadedHint ||
                    'Nostr relays unavailable (see index.html). Configure relays and reload to retract.',
                true
            );
            return;
        }
        const pair = this.getNostrPublisherPair(treeRef.pub);
        if (!(pair && pair.priv)) {
            await this.showDialog({
                type: 'alert',
                title: ui.revokePublicTreeNoKeyTitle || 'Publisher key not found',
                body:
                    ui.revokePublicTreeNoKeyBody ||
                    'Retracting requires the same browser profile that published this tree. If you cleared storage or use another device, you cannot sign a retraction from here.',
                confirmText: ui.dialogOkButton || 'OK'
            });
            return;
        }
        const ok = await this.showDialog({
            type: 'confirm',
            title: ui.revokePublicTreeConfirmTitle || 'Retract this public tree?',
            body:
                ui.revokePublicTreeConfirmBody ||
                'This will publish a <strong>retraction</strong> on the network and clear the bundle for cooperating peers. People who already copied data elsewhere might still have it. Continue?',
            bodyHtml: true,
            danger: true,
            confirmText: ui.revokePublicTreeConfirmButton || 'Retract',
            cancelText: ui.cancel || 'Cancel'
        });
        if (!ok) return;
        try {
            await this.nostr.revokeUniverse({ pair, universeId: treeRef.universeId, reason: '' });
            try {
                await this.nostr.putGlobalTreeDirectoryDelist({ pair, universeId: treeRef.universeId });
            } catch (e2) {
                console.warn('global directory delist failed', e2);
            }
            // Drop the revoked tree from the installed sources list (if it
            // was added as a community source). Without this, "My trees"
            // keeps showing the tombstone forever.
            try {
                const revokedUrl = `nostr://${treeRef.pub}/${treeRef.universeId}`;
                const sm = this.sourceManager;
                const list = (sm && sm.state && Array.isArray(sm.state.communitySources)) ? sm.state.communitySources : [];
                for (const s of list) {
                    const u = String(s && s.url || '');
                    if (u === revokedUrl) sm.removeCommunitySource(s.id);
                }
            } catch (e3) {
                console.warn('post-revoke source cleanup failed', e3);
            }
            const defaultSrc = await this.sourceManager.getDefaultSource();
            if (defaultSrc) {
                await this.loadData(defaultSrc, true);
            } else {
                this.update({
                    activeSource: null,
                    data: null,
                    rawGraphData: null,
                    loading: false,
                    selectedNode: null,
                    previewNode: null,
                    path: []
                });
                try {
                    localStorage.removeItem('arborito-active-source-id');
                    localStorage.removeItem('arborito-active-source-meta');
                } catch {
                    /* ignore */
                }
            }
            await this.showDialog({
                type: 'alert',
                title: ui.revokePublicTreeSuccessTitle || 'Tree retracted',
                body: ui.revokePublicTreeSuccessBody || 'The public network was asked to stop serving this tree. You can publish again with a new link anytime.',
                confirmText: ui.dialogOkButton || 'OK'
            });
        } catch (e) {
            console.warn('revokeActivePublicTreeInteractive', e);
            this.notify(ui.revokePublicTreeError || 'Could not complete retraction.', true);
        }
    },

    /**
     * Nostr tree without owner/editor write access: copy curriculum into a new local tree, load it, then enter construction.
     */
    async offerLocalCopyFromNetworkTreeForEditing() {
        const ui = this.ui;
        if (!fileSystem.isNostrTreeSource()) return;
        if (!this.state.rawGraphData) {
            this.notify(ui.forumNoTree || 'No tree loaded.', true);
            return;
        }
        const ok = await this.showDialog({
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
            (this.state.activeSource && this.state.activeSource.name) ||
                (this.state.rawGraphData && this.state.rawGraphData.universeName) ||
                ''
        ).trim();
        const typed = await this.showDialog({
            type: 'prompt',
            title: ui.forkNetworkTreePromptTitle || 'Name your copy',
            body: ui.forkNetworkTreePromptBody || 'Choose a name for the new tree in My garden.',
            bodyHtml: false,
            placeholder: defaultName || (ui.forkNetworkTreePromptPlaceholder || 'My copy'),
            confirmText: ui.forkNetworkTreeCreateButton || ui.plantTreeShort || 'Create',
            cancelText: ui.cancel || 'Cancel'
        });
        if (typed === null || typed === false) return;
        const name = String(typed || '').trim();
        if (!name) {
            this.notify(ui.forkNetworkTreeEmptyName || 'Please enter a name.', true);
            return;
        }
        try {
            const entry = this.userStore.plantLocalTreeFromCurriculumClone(name, this.state.rawGraphData);
            await this.loadData(
                { id: entry.id, name: entry.name, url: `local://${entry.id}`, type: 'local', isTrusted: true },
                true
            );
            this.toggleConstructionMode();
        } catch (e) {
            console.warn('offerLocalCopyFromNetworkTreeForEditing', e);
            this.notify(
                String(ui.forkNetworkTreeError || 'Could not create copy: {message}').replace(
                    '{message}',
                    String((e && e.message) || e)
                ),
                true
            );
        }
    }

};
