import { store } from '../../../core/store.js';
import { formatNostrTreeUrl } from '../../nostr/nostr-refs.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import {
    handleSwitch,
    importTreeFromFile,
    loadLocalTree,
    exportLocalTree,
    shareActiveTree,
} from './sources-logic.js';
import { promptTreeLegalReportEvidence } from '../../publishing/tree-legal-report-evidence-prompts.js';

/**
 * Sources modal — button action dispatch.
 *
 * Mixed into `ArboritoModalSources.prototype` via `Object.assign` (same pattern as
 * `forum-modal-render-mixin.js`). Lives in its own file because the dispatch table
 * is the single largest method in the component (~515 lines on a 2.8k-line modal)
 * and grouping it here keeps `sources.js` focused on lifecycle / state / wiring.
 *
 * Every action arrives through `#tab-content`'s delegated click handler and is
 * matched on `btn.dataset.action`. Methods use `this.*` (state) plus the local
 * imports above for the network / local-tree side-effects.
 */
export const sourcesActionDispatchMethods = {

    /** Button actions on `#tab-content` (fallback when target is already the button). */
    async handleActionFromElement(btn) {
        if (!btn?.dataset) return;

        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const name = btn.dataset.name;

        if (action === 'toggle-sources-advanced') {
            this._sourcesAdvancedOpen = !this._sourcesAdvancedOpen;
            this.updateContent();
            return;
        }

        if (action === 'toggle-row-actions') {
            const k = String(btn.dataset.key || '').trim();
            if (!k) return;
            if (this._rowActionsOpen && typeof this._rowActionsOpen.has === 'function') {
                if (this._rowActionsOpen.has(k)) this._rowActionsOpen.delete(k);
                else this._rowActionsOpen.add(k);
            }
            this.updateContent();
            return;
        }

        if (action === 'install-source') {
            const ownerPub = String(btn.dataset.ownerPub || '').trim();
            const universeId = String(btn.dataset.universeId || '').trim();
            if (!ownerPub || !universeId) {
                /* Defensive surface: silent early-returns made "Install" feel broken when a
                 * directory row was missing one of the data-* attrs (no toast, no log).
                 * Now the user sees something AND we log a hint to inspect the row. */
                try {
                    console.warn('[Arborito] install-source missing data', { ownerPub, universeId, dataset: { ...btn.dataset } });
                } catch { /* ignore */ }
                store.notify(store.ui.sourcesInstallFailed || 'No se pudo instalar.', true);
                return;
            }
            const url = formatNostrTreeUrl(ownerPub, universeId);
            const dir = this._directoryRowForCommunitySource({ url });
            const relayFromDir =
                Array.isArray(dir?.recommendedRelays) && dir.recommendedRelays.length
                    ? { recommendedRelays: dir.recommendedRelays }
                    : {};
            const hasListMeta = !!(dir && (dir.title || dir.authorName || dir.description || dir.shareCode));
            const installOpts = hasListMeta
                ? {
                      resolvedNostrTreeUrl: url,
                      listMeta: {
                          title: String(dir.title || '').trim(),
                          authorName: String(dir.authorName || '').trim(),
                          description: String(dir.description || '').trim()
                      },
                      codeLabel: String(dir.shareCode || '').trim() || undefined,
                      ...relayFromDir
                  }
                : Object.keys(relayFromDir).length
                  ? { resolvedNostrTreeUrl: url, ...relayFromDir }
                  : null;
            const out = installOpts ? store.addCommunitySource(url, installOpts) : store.addCommunitySource(url);
            const ok = out && typeof out === 'object' ? out.ok !== false : !!out;
            if (!ok) {
                store.notify(store.ui.sourcesInstallFailed || 'No se pudo instalar.', true);
                return;
            }
            store.notify(store.ui.sourcesInstalledToast || 'Instalado.', false);
            /* Show the fullscreen "El árbol está creciendo…" overlay while the
             * just-installed tree is being mounted in the background — without
             * this the user stays on the Sources picker with no feedback while
             * `mountCurriculum` fetches + parses. The flag is cleared in
             * `mountCurriculum`'s `finally`, so success and error paths both
             * dismiss it cleanly. See `components/tree-growing-overlay.js`. */
            store.update({ treeGrowingOverlay: true });
            await store.maybeAutoLoadSoleCommunityAfterAdd(out);
            const m = store.state.modal;
            if (
                this.isConnected &&
                m &&
                (m === 'sources' || (typeof m === 'object' && m.type === 'sources'))
            ) {
                this.updateContent();
            }
            return;
        }

        if (action === 'set-scope') {
            const next = String(btn.dataset.scope || 'all');
            if (next === 'all' || next === 'local' || next === 'internet' || next === 'saved') {
                this._sourcesScope = next;
                this.updateContent();
                return;
            }
        }

        if (action === 'cancel-overlay') {
            this.overlay = null;
            this.targetId = null;
            this.updateContent();
        }
        if (action === 'show-plant') {
            await this._promptForTreeNameAndPlant();
            return;
        }
        if (action === 'show-delete') {
            this.overlay = 'delete';
            this.targetId = id;
            this.updateContent();
        }

        if (action === 'confirm-delete') {
            if (this.targetId) {
                const tid = this.targetId;
                const active = store.state.activeSource;
                const wasActive =
                    active &&
                    (active.id === tid || String(active.url || '') === `local://${tid}`);
                store.userStore.deleteLocalTree(tid);
                this.overlay = null;
                this.targetId = null;
                if (wasActive) {
                    void store.clearCanvasAndShowLoadTreeWelcome();
                } else {
                    this.updateContent();
                    queueMicrotask(() => store.maybePromptNoTree());
                }
            }
        }

        if (action === 'switch-version') handleSwitch(this);
        if (action === 'share-tree') shareActiveTree();
        if (action === 'load-source') {
            const cid = String(id || '').trim();
            if (!cid) return;
            /* Fullscreen "El árbol está creciendo…" overlay during mount; see
             * `components/tree-growing-overlay.js`. Cleared in
             * `mountCurriculum`'s `finally`. */
            store.update({ treeGrowingOverlay: true });
            const ok = await store.loadAndSmartMerge(cid);
            if (ok) this.close({ returnToMore: false });
            return;
        }
        if (action === 'remove-source') {
            const ui = store.ui;
            /* Online/community trees aren't deleted — only the local install reference
             * is removed. Wording stays consistent with the button label
             * (`sourcesGlobalRemove` → "Desinstalar" / "Uninstall"). */
            if (await store.confirm(ui.sourcesDeleteTreeLinkConfirm || 'Uninstall this tree? It stays online — you can install it again any time.')) {
                const wasActive = store.state.activeSource?.id === id;
                store.removeCommunitySource(id);
                if (!wasActive) this.updateContent();
            }
        }
        if (action === 'add-tree-link') {
            const v = this.querySelector('#inp-tree-link')?.value?.trim();
            if (v) {
                void store.requestAddCommunitySource(v);
                const inp = this.querySelector('#inp-tree-link');
                if (inp) inp.value = '';
            }
        }
        if (action === 'tree-info') {
            // If the user clicked ℹ️ next to a specific tree, load it first so the modal has data.
            const targetId = String(btn.dataset.id || '').trim();
            const targetName = String(btn.dataset.name || '').trim();
            if (targetId) {
                const active = store.value.activeSource;
                const alreadyActive = !!(active && (String(active.id) === targetId || String(active.url || '') === `local://${targetId}`));
                if (!alreadyActive) {
                    await store.loadData({ id: targetId, name: targetName || targetId, url: `local://${targetId}`, type: 'local', isTrusted: true });
                }
            }
            const cur = store.value.modal;
            const payload = {
                type: 'tree-info',
                fromSources: true,
                sourcesFocusTab: this.activeTab
            };
            if (cur && typeof cur === 'object' && cur.fromConstructionMore) payload.fromConstructionMore = true;
            if (cur && typeof cur === 'object' && cur.fromMobileMore) payload.fromMobileMore = true;
            store.setModal(payload);
        }
        if (action === 'open-author-license') {
            const cur = store.value.modal;
            const payload = {
                fromSources: true,
                sourcesFocusTab: this.activeTab
            };
            if (cur && typeof cur === 'object' && cur.fromConstructionMore) payload.fromConstructionMore = true;
            if (cur && typeof cur === 'object' && cur.fromMobileMore) payload.fromMobileMore = true;
            store.openAuthorLicenseOverlay(payload);
        }
        if (action === 'quick-alias' && btn.dataset.alias) {
            const a = String(btn.dataset.alias);
            void store.requestAddCommunitySource(a);
            this.updateContent();
        }
        if (action === 'global-filter') {
            const allowed = new Set(['discover', 'recent', 'voted']);
            const next = String(btn.dataset.filter || '').trim();
            this._globalDirFilter = allowed.has(next) ? next : 'discover';
            void this._applyGlobalDirectorySortAndMetrics();
        }
        if (action === 'lang-filter') {
            const raw = String(btn.dataset.lang || '*').trim().toUpperCase();
            this._sourcesLangFilter = raw === '*' || !raw ? '*' : raw;
            this.updateContent();
            return;
        }
        if (action === 'global-refresh') {
            void this._runGlobalDirectoryFetch();
        }
        if (action === 'global-open') {
            const ownerPub = String(btn.dataset.ownerPub || '');
            const universeId = String(btn.dataset.universeId || '');
            const shareCode = String(btn.dataset.shareCode || '').trim();
            const editOwn = String(btn.dataset.editOwn || '') === '1';
            if (!ownerPub || !universeId) return;
            if (editOwn) {
                const ap = store.getNostrPublisherPair?.(ownerPub);
                if (!(ap && ap.priv)) {
                    store.notify(store.ui.sourcesGlobalEditOwnDenied || 'Only this device with the publisher key can edit this tree.', true);
                    return;
                }
            }
            if (store.isNostrTreeMaintainerBlocked(ownerPub, universeId)) {
                store.notify(
                    store.ui.maintainerBlocklistLoadRefused ||
                        'This tree is blocked in this app build (maintainer list).',
                    true
                );
                return;
            }
            const url = formatNostrTreeUrl(ownerPub, universeId);
            const dirRow = this._directoryRowForCommunitySource({ url });
            const addOpts = {
                resolvedNostrTreeUrl: url,
                codeLabel: shareCode || (dirRow?.shareCode ? String(dirRow.shareCode).trim() : null) || null
            };
            if (
                dirRow &&
                (dirRow.title || dirRow.authorName || dirRow.description || dirRow.shareCode)
            ) {
                addOpts.listMeta = {
                    title: String(dirRow.title || '').trim(),
                    authorName: String(dirRow.authorName || '').trim(),
                    description: String(dirRow.description || '').trim()
                };
            }
            if (Array.isArray(dirRow?.recommendedRelays) && dirRow.recommendedRelays.length) {
                addOpts.recommendedRelays = dirRow.recommendedRelays;
            }
            // Persist as community source (so it appears in the list), then load it.
            try {
                const added = store.addCommunitySource(url, addOpts);
                if (added && added.ok === false && added.reason === 'maintainer_blocklist') {
                    store.notify(
                        store.ui.maintainerBlocklistAddRefused ||
                            store.ui.maintainerBlocklistLoadRefused ||
                            'This tree is blocked in this app build (maintainer list).',
                        true
                    );
                    return;
                }
            } catch { /* ignore */ }
            // Best-effort: usage ping (1/day per pub per tree, client-throttled).
            try {
                const net = store.nostr;
                if (net && typeof net.putTreeUsagePing === 'function') {
                    const pair = await store.ensureNetworkUserPair?.();
                    if (pair?.pub) {
                        const ok = this._cooldownOk(this._usageKey(ownerPub, universeId, pair.pub), 22 * 60 * 60 * 1000);
                        if (ok) await net.putTreeUsagePing({ pair, ownerPub, universeId });
                    }
                }
            } catch { /* ignore */ }
            const src = (store.value.communitySources || []).find((s) => String(s.url) === String(url));
            const ephemeralRelays =
                Array.isArray(dirRow?.recommendedRelays) && dirRow.recommendedRelays.length
                    ? { recommendedRelays: dirRow.recommendedRelays }
                    : {};
            /* Fullscreen "El árbol está creciendo…" overlay during mount; see
             * `components/tree-growing-overlay.js`. Cleared in
             * `mountCurriculum`'s `finally`. */
            store.update({ treeGrowingOverlay: true });
            const loadedOk = src
                ? await store.loadData(src, true)
                : await store.loadData({
                      id: `nostr-open-${Date.now()}`,
                      name: `Public · ${ownerPub.slice(0, 10)}…`,
                      url,
                      type: 'community',
                      origin: 'nostr',
                      ...ephemeralRelays
                  });
            if (loadedOk) {
                if (editOwn && store.canOpenConstruction?.()) {
                    if (!store.hasAcceptedAuthorLicense?.()) store.acceptAuthorLicense?.();
                    store.update({ constructionMode: true });
                }
                this.close({ returnToMore: false });
            }
        }
        if (action === 'global-vote') {
            const ownerPub = String(btn.dataset.ownerPub || '');
            const universeId = String(btn.dataset.universeId || '');
            const dir = String(btn.dataset.vote || 'up'); // 'up' | 'down'
            if (!ownerPub || !universeId) return;
            const net = store.nostr;
            const canNetworkVote = !!(net && typeof net.putTreeVote === 'function');
            const pair = canNetworkVote ? await store.ensureNetworkUserPair?.() : null;
            const pub = String(pair?.pub || '').trim();
            const lsKey = pub ? this._voteKey(ownerPub, universeId, pub) : this._voteKeyFallback(ownerPub, universeId);
            const prev = this._lsGet(lsKey) === '1';
            // If user clicks 👍 repeatedly, toggle. (Downvotes removed from primary UI; keep compatibility.)
            const finalVote = dir === 'up' ? !prev : false;

            if (canNetworkVote && pub) {
                const firstSeen = this._ensureNostrUserFirstSeen();
                const ageMs = Date.now() - firstSeen;
                const ageOk = ageMs >= 5 * 60 * 1000;
                const cdOk = this._cooldownOk(`arborito-tree-vote-cooldown:${pub}`, 6000);
                if (ageOk && cdOk) {
                    store.notify(store.ui.sourcesGlobalPowWorking, false);
                    try {
                        await net.putTreeVote({ pair, ownerPub, universeId, vote: finalVote });
                    } catch (e) {
                        console.warn('putTreeVote', e);
                    }
                }
                /* Always update local count and UI (even if network identity is new or on cooldown). */
            }
            if (finalVote) this._lsSet(lsKey, '1');
            else this._lsDel(lsKey);

            const k = `${ownerPub}/${universeId}`;
            if (!this._globalDirMetrics || typeof this._globalDirMetrics !== 'object') this._globalDirMetrics = {};
            const cur = this._globalDirMetrics[k] || {};
            const base = Number(cur.votes) || 0;
            const delta = (finalVote ? 1 : 0) - (prev ? 1 : 0);
            this._globalDirMetrics[k] = { ...cur, votes: Math.max(0, base + delta) };
            this._rerankGlobalDirectoryRowsOnly();
            this.updateContent();
        }
        if (action === 'global-report') {
            const ownerPub = String(btn.dataset.ownerPub || '');
            const universeId = String(btn.dataset.universeId || '');
            if (!ownerPub || !universeId) return;
            if (store.getNostrPublisherPair?.(ownerPub)?.priv) return;
            const net = store.nostr;
            if (!net || typeof net.putTreeReport !== 'function') return;
            const pair = await store.ensureNetworkUserPair?.();
            if (!pair?.pub) return;
            this._ensureNostrUserFirstSeen();
            // Simple client rate limits
            const okGlobal = this._cooldownOk(`arborito-tree-report-cd:${pair.pub}`, 9000);
            if (!okGlobal) return;
            const okTree = this._cooldownOk(`arborito-tree-report-tree:${ownerPub}/${universeId}:${pair.pub}`, 22 * 60 * 60 * 1000);
            if (!okTree) {
                store.notify(store.ui.sourcesGlobalReportTooSoon || 'You already reported this tree recently.', true);
                return;
            }
            const ui = store.ui;
            const policy = String(ui.treeReportPolicyBody || '').trim();
            const sheetHint = String(ui.treeReportSheetHint || '').trim();
            const reportDialogBody = [policy, sheetHint].filter(Boolean).join('\n\n') || sheetHint;
            const choice = await store.showDialog({
                type: 'choice',
                title: ui.treeReportSheetTitle || ui.sourcesGlobalReport || 'Report',
                body: reportDialogBody,
                confirmText: ui.dialogOkButton || 'OK',
                cancelText: ui.cancel || 'Cancel',
                choices: [
                    { id: 'spam', label: ui.treeReportReasonSpam || 'Spam' },
                    { id: 'phishing', label: ui.treeReportReasonPhishing || 'Phishing' },
                    { id: 'copyright', label: ui.treeReportReasonCopyright || 'Copyright' },
                    { id: 'other', label: ui.treeReportReasonOther || 'Other' }
                ]
            });
            if (!choice) return;
            const reason = String(choice);
            let note = '';
            if (reason === 'other') {
                const txt = await store.prompt(ui.treeReportOtherPlaceholder || 'Short note (optional)', '', ui.treeReportReasonOther || 'Other');
                note = String(txt || '').trim();
            }
            store.notify(ui.sourcesGlobalPowWorking || 'Verifying…', false);
            if (reason === 'copyright' && typeof net.putTreeLegalReport === 'function') {
                const ev = await promptTreeLegalReportEvidence(store);
                if (!ev) return;
                store.notify(ui.sourcesGlobalPowWorking || 'Verifying…', false);
                await net.putTreeLegalReport({
                    pair,
                    ownerPub,
                    universeId,
                    entityName: '',
                    euAddress: '',
                    vatId: '',
                    whereInTree: ev.whereInTree,
                    whatWork: ev.whatWork,
                    description: ev.description,
                    declaration: true,
                    links: ev.links
                });
                // Optimistic: mark dispute present.
                const k2 = `${ownerPub}/${universeId}`;
                const cur2 = this._globalDirMetrics?.[k2] || {};
                const baseL = Number(cur2.legal90Unique) || 0;
                const approxAt = new Date().toISOString();
                this._globalDirMetrics[k2] = {
                    ...cur2,
                    legal90Unique: baseL + 1,
                    legalLatestAt: approxAt,
                    legalOwnerDefenseLatestAt: String(cur2.legalOwnerDefenseLatestAt || '')
                };
                store.notify(ui.legalReportSent || 'Legal report sent.', false);
                this.updateContent();
                return;
            }
            await net.putTreeReport({ pair, ownerPub, universeId, reason, note });
            const k = `${ownerPub}/${universeId}`;
            if (!this._globalDirMetrics || typeof this._globalDirMetrics !== 'object') this._globalDirMetrics = {};
            const cur = this._globalDirMetrics[k] || {};
            // Optimistic update; full recompute will happen on next metrics refresh.
            const baseU = Number(cur.reports14Unique) || 0;
            const baseS = Number(cur.reportScore) || 0;
            // Reporter is this device pub; we assume non-trusted weight here (1x).
            const rw = reason === 'phishing' ? 1.35 : reason === 'copyright' ? 1.25 : 1;
            this._globalDirMetrics[k] = { ...cur, reports14Unique: baseU + 1, reportScore: Math.round((baseS + rw) * 100) / 100 };
            this.updateContent();
        }

        if (action === 'global-legal-defense') {
            const ownerPub = String(btn.dataset.ownerPub || '').trim();
            const universeId = String(btn.dataset.universeId || '').trim();
            if (!ownerPub || !universeId) return;
            const net = store.nostr;
            if (!net || typeof net.putTreeLegalOwnerDefense !== 'function') return;
            const pair = store.getNostrPublisherPair?.(ownerPub);
            if (!pair?.priv) {
                store.notify(store.ui.sourcesGlobalLegalDefenseNotOwner || 'Only the tree owner on this device can sign a response.', true);
                return;
            }
            let latestLegalReportAt = '';
            const kM = `${ownerPub}/${universeId}`;
            const curM = this._globalDirMetrics?.[kM] || {};
            latestLegalReportAt = String(curM.legalLatestAt || '').trim();
            if (!latestLegalReportAt && typeof net.listTreeLegalReportsOnce === 'function') {
                const lr = await net.listTreeLegalReportsOnce({ ownerPub, universeId, max: 1 });
                latestLegalReportAt = String(lr?.[0]?.at || '').trim();
            }
            if (!latestLegalReportAt) {
                store.notify(store.ui.sourcesGlobalLegalDefenseNoReport || 'Could not load the latest legal timestamp. Try again in a moment.', true);
                return;
            }
            const ui = store.ui;
            const consentJudicialShare = await store.confirm(
                ui.legalOwnerDefenseConfirmBody ||
                    'Your signed response links to the latest legal report timestamp. If required by law, this device may share minimal metadata with competent authorities. Continue?',
                ui.legalOwnerDefenseConfirmTitle || ui.sourcesGlobalDisputePill || 'Legal dispute',
                true
            );
            if (!consentJudicialShare) return;
            store.notify(ui.sourcesGlobalPowWorking || 'Verifying…', false);
            const rec = await net.putTreeLegalOwnerDefense({
                pair,
                ownerPub,
                universeId,
                latestLegalReportAt,
                consentJudicialShare: true
            });
            if (!rec) {
                store.notify(store.ui.sourcesGlobalLegalDefenseFailed || 'Could not publish owner response.', true);
                return;
            }
            if (!this._globalDirMetrics || typeof this._globalDirMetrics !== 'object') this._globalDirMetrics = {};
            this._globalDirMetrics[kM] = {
                ...(this._globalDirMetrics[kM] || {}),
                legalOwnerDefenseLatestAt: String(rec.latestLegalReportAt || latestLegalReportAt)
            };
            store.notify(ui.legalOwnerDefenseSuccessToast || 'Owner response published.', false);
            this.updateContent();
            return;
        }

        if (action === 'import-tree') importTreeFromFile(this);
        if (action === 'load-local') loadLocalTree(this, id, name);
        if (action === 'unified-load-more') {
            const cur = Number(this._unifiedShown) || 0;
            const bump = shouldShowMobileUI() ? 12 : 24;
            this._unifiedShown = cur + bump;
            if (typeof this.updateContent === 'function') this.updateContent();
            return;
        }
        if (action === 'publish-private') {
            const ui = store.ui;
            if (!store.isSignedIn?.()) {
                store.notify(ui.syncLoginNoAccount || 'Sign in with your account first.', true);
                return;
            }
            // We can only publish the *active* local tree — its data lives in
            // `localTrees` already; pick it first if not active so we publish
            // the right one.
            const activeUrl = String(store.state.activeSource?.url || '');
            const targetUrl = `local://${id}`;
            if (activeUrl !== targetUrl) {
                await loadLocalTree(this, id, '');
            }
            try {
                await store.publishActiveLocalTreeAsPrivate();
                this.updateContent();
            } catch (e) {
                store.alert(String((e && e.message) || e));
            }
            return;
        }
        if (action === 'unpublish-private') {
            const ui = store.ui;
            const ok = await store.confirm(
                ui.privateTreesStopSyncBody || 'Stop syncing this tree to your account? The local copy on this device stays.',
                ui.privateTreesStopSyncTitle || 'Stop syncing?',
                true
            );
            if (!ok) return;
            try {
                await store.unpublishPrivateLocalTree(id);
                this.updateContent();
            } catch (e) {
                store.alert(String((e && e.message) || e));
            }
            return;
        }
        if (action === 'export-local') {
            const ui = store.ui;
            const originalContent = btn.innerHTML;
            btn.innerHTML = `<span class="animate-spin text-lg">⏳</span> ${ui.sourcesPacking || 'Packing…'}`;
            btn.disabled = true;
            btn.classList.add('opacity-75', 'cursor-not-allowed');

            setTimeout(() => {
                void (async () => {
                    try {
                        await exportLocalTree(id, name);
                    } catch (err) {
                        console.error(err);
                        store.notify(ui.sourcesExportFailed || 'Export failed.', true);
                    } finally {
                        btn.innerHTML = originalContent;
                        btn.disabled = false;
                        btn.classList.remove('opacity-75', 'cursor-not-allowed');
                    }
                })();
            }, 50);
        }
    },

};
