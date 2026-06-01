import { store } from '../../../core/store.js';
import { listKnownAliasKeys } from '../tree-aliases.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { calloutHtml } from '../../../shared/ui/callout.js';
import { formatNostrTreeUrl, parseNostrTreeUrl } from '../../nostr/nostr-refs.js';
import { DIRECTORY_CLIENT_FETCH_LIMIT, SOURCES_UNIFIED_DISPLAY_CAP } from '../../p2p-webtorrent/directory-index-config.js';
import {
    loadGlobalDirectoryRowsFromHttp,
    loadGlobalDirectoryRowsFromTorrent,
    mergeNostrAndTorrentDirectoryRows,
    usesGlobalDirectoryPointerForTorrent
} from '../../p2p-webtorrent/global-directory-torrent.js';
import { canonicalNetworkTreeUrlString, escapeHtmlAttr, escapeHtmlText } from './sources-helpers.js';
import { escHtml, escAttr } from '../../../shared/lib/html-escape.js';

export const sourcesUnifiedRenderMethods = {

    getUnifiedContent(ui, state, activeSource) {
        // Unified list (local + saved + internet) with optional tag filter.
        const scope = String(this._sourcesScope || 'all');
        const q = String(this._sourcesQ || '');
        const header = this._renderUnifiedHeader(ui, scope, q);

        const loading = !!this._globalDirLoading;
        const err = String(this._globalDirError || '').trim();
        const showDirHint =
            !loading &&
            !err &&
            !!this._globalDirHitCap &&
            (scope === 'all' || scope === 'internet');
        const dirHintHtml = showDirHint
            ? `<div class="mt-3 p-3 rounded-2xl border border-sky-200/80 dark:border-sky-900/60 bg-sky-50/90 dark:bg-sky-950/25 text-[11px] leading-snug text-sky-950 dark:text-sky-100">
                <p class="m-0 font-black">${this._escText(ui.sourcesGlobalPartialTitle || 'Partial directory listing')}</p>
                <p class="m-0 mt-1 font-semibold opacity-95">${this._escText(
                    ui.sourcesGlobalPartialBody ||
                        'We only load a limited batch per query (the network is huge). Try more specific keywords, use a share code, or check again later.'
                )}</p>
            </div>`
            : '';

        const showTorrentLag =
            usesGlobalDirectoryPointerForTorrent() && (scope === 'all' || scope === 'internet');
        const torrentLagHtml = showTorrentLag
            ? `<div class="mt-3 p-3 rounded-2xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/90 dark:bg-amber-950/20 text-[11px] leading-snug text-amber-950 dark:text-amber-100">
                <p class="m-0 font-semibold">${this._escText(
                    ui.sourcesGlobalTorrentIndexLagHint ||
                        'Optional torrent mirror: the public list updates on a schedule, so very new trees may appear there after a short delay. Live network metadata is usually ahead.'
                )}</p>
            </div>`
            : '';

        const showUiTrunc = !loading && !err && !!this._globalDirUiTruncated;
        const capN = String(SOURCES_UNIFIED_DISPLAY_CAP);
        const truncTitle = (ui.sourcesUnifiedListTruncTitle || 'List shortened ({{n}} rows)').replace(/\{\{n\}\}/g, capN);
        const truncBody = (
            ui.sourcesUnifiedListTruncBody ||
            'This view shows at most {{n}} rows after sorting. Refine the search or use Filters to narrow scope.'
        ).replace(/\{\{n\}\}/g, capN);
        const uiTruncHtml = showUiTrunc
            ? `<div class="mt-2 p-3 rounded-2xl border border-violet-200/80 dark:border-violet-900/50 bg-violet-50/90 dark:bg-violet-950/20 text-[11px] leading-snug text-violet-950 dark:text-violet-100">
                <p class="m-0 font-black">${this._escText(truncTitle)}</p>
                <p class="m-0 mt-1 font-semibold opacity-95">${this._escText(truncBody)}</p>
            </div>`
            : '';

        const items = this._collectUnifiedItems(ui, state, activeSource, { scope, q });
        const listEmpty = items.length === 0 && !loading && !err;

        /* Pagination.
         *
         * We don't need true page navigation (the list is capped at
         * `SOURCES_UNIFIED_DISPLAY_CAP` rows so scroll height is bounded);
         * what users actually need is for the create/import CTAs to stay
         * reachable on a long list. "Load more" keeps the initial visible
         * batch small (≈ a few screen-heights), so the sticky bottom CTA
         * is always visible without endless scrolling.
         *
         * Page sizes tuned per viewport:
         *  - Mobile: 12 (compact rows feel right at ~1.5 screen-heights)
         *  - Desktop: 24 (matches the wider modal's vertical capacity)
         *
         * The scope/query are part of the pagination key so changing
         * filters resets the visible count. */
        const isMobile = shouldShowMobileUI();
        const pageSize = isMobile ? 12 : 24;
        /* Pagination key includes scope, query AND the directory sort: any
         * filter change re-sorts the list, so showing 50 items at the old
         * sort would be misleading. Resetting to one page on filter change
         * also makes the "Load more" count match what the user just asked for. */
        const pagKey = `${scope}|${q}|${this._globalDirFilter || ''}`;
        if (this._unifiedPageKey !== pagKey) {
            this._unifiedPageKey = pagKey;
            this._unifiedShown = pageSize;
        }
        const shownCount = Math.max(pageSize, Number(this._unifiedShown) || pageSize);
        const visible = items.slice(0, shownCount);
        const remaining = Math.max(0, items.length - visible.length);

        const loadMoreHtml = remaining > 0
            ? `<div class="mt-3 flex justify-center">
                  <button type="button" data-action="unified-load-more" class="min-h-11 px-4 py-2 rounded-xl text-xs font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">${this._escText(
                      String(ui.sourcesUnifiedLoadMore || 'Load more ({{n}} more)').replace(/\{\{n\}\}/g, String(remaining))
                  )}</button>
              </div>`
            : '';

        const listHtml = listEmpty
            ? `<div class="arborito-empty arborito-empty--dashed">${this._escText(
                  ui.sourcesUnifiedEmpty || 'No results.'
              )}</div>`
            : `<div class="space-y-3">${visible.map((it) => it.html).join('')}</div>${loadMoreHtml}`;

        // Unified: search is the one entry point. Manual add lives in advanced paths.
        const addLinkHtml = '';

        /* Footer CTA is rendered into a separate sticky-bottom slot
         * (see the wrapping markup below) so the user never has to
         * scroll past the entire list to find "Create tree" / "Import".
         * One unified layout in both empty and non-empty states keeps the
         * footer height predictable across mobile/desktop. */
        const ctaHtml = `<div class="flex flex-wrap items-center justify-between gap-2">
                <p class="m-0 text-[11px] font-bold text-slate-500 dark:text-slate-400">${this._escText(
                    ui.sourcesCtaCompact || 'Create or import'
                )}</p>
                <div class="flex flex-wrap gap-2">
                    <button type="button" data-action="import-tree" class="min-h-11 px-3 py-2 rounded-xl text-xs font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">${this._escText(
                        ui.importBtnShort || ui.importBtn || 'Import'
                    )}</button>
                    <button type="button" data-action="show-plant" class="arborito-cta-emerald min-h-11 px-3 py-2 rounded-xl text-xs font-extrabold tracking-wide shadow-sm">${this._escText(
                        ui.plantTreeShort || ui.plantTree || 'Create tree'
                    )}</button>
                </div>
            </div>`;

        /* Two-bar layout:
         *  - top sticky    → search header (always reachable for refining)
         *  - body          → list + load-more
         *  - bottom sticky → Create / Import CTA (never buried by the list)
         *
         * The `-mx-4 px-4` trick extends the opaque background out to the
         * parent's `px-4` horizontal padding so rows don't bleed through.
         * `mt-auto` + a parent flex column (set below in `pt-2`) push the
         * footer down when the list is short, keeping the bar feeling
         * "docked" rather than floating in the middle of the panel. */
        return `
            <div class="pt-2 flex flex-col min-h-full">
                <div class="sticky top-0 z-20 -mx-4 px-4 pt-2 pb-3 bg-emerald-50 dark:bg-slate-900 arborito-sources-sticky-head">
                    ${header}
                </div>
                ${torrentLagHtml}
                ${dirHintHtml}
                ${uiTruncHtml}
                <div class="mt-4 space-y-3">
                    ${
                        err
                            ? `<div class="p-4 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs font-bold text-amber-900 dark:text-amber-200">${this._escText(
                                  err
                              )}</div>`
                            : ''
                    }
                    ${listHtml}
                </div>
                ${addLinkHtml}
                <div class="mt-auto pt-4 sticky bottom-0 z-20 -mx-4 px-4 pb-3 bg-emerald-50 dark:bg-slate-900 arborito-sources-sticky-foot">
                    <div class="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/40 backdrop-blur-sm">
                        ${ctaHtml}
                    </div>
                </div>
            </div>`;
    },

    _renderUnifiedHeader(ui, scope, qRaw) {
        const qVal = this._escAttr(qRaw || '');
        const qPh = this._escAttr(ui.sourcesUnifiedSearchPlaceholder || ui.sourcesGlobalSearchPlaceholder || 'Search…');
        const scopeBtn = (id, label) => {
            const active = scope === id;
            return `<button type="button" data-action="set-scope" data-scope="${this._escAttr(
                id
            )}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide border transition-colors ${
                active
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }">${this._escText(label)}</button>`;
        };
        const advancedOpen = !!this._sourcesAdvancedOpen;
        const advancedLabel = this._escText(
            advancedOpen ? (ui.sourcesFiltersHide || 'Hide filters') : (ui.sourcesFiltersShow || 'Filters')
        );
        const dirFilter = String(this._globalDirFilter || 'discover');
        const internetRankBtn = (id, label) => {
            const active = dirFilter === id;
            return `<button type="button" data-action="global-filter" data-filter="${this._escAttr(
                id
            )}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide border transition-colors ${
                active
                    ? 'bg-purple-700 dark:bg-purple-400 text-white dark:text-slate-950 border-purple-700 dark:border-purple-400'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }">${this._escText(label)}</button>`;
        };
        const internetRankRow =
            advancedOpen && (scope === 'all' || scope === 'internet')
                ? `<div class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                        <p class="arborito-eyebrow m-0 mb-2">${this._escText(
                            ui.sourcesUnifiedInternetSortTitle || 'Internet sort'
                        )}</p>
                        <div class="flex flex-wrap gap-2 items-center" role="group" aria-label="${this._escAttr(
                            ui.sourcesUnifiedInternetSortAria || 'How to sort Internet trees'
                        )}">
                            ${internetRankBtn('discover', ui.sourcesGlobalFilterDiscover || 'Discover')}
                            ${internetRankBtn('recent', ui.sourcesGlobalFilterRecent || 'Recent')}
                            ${internetRankBtn('voted', ui.sourcesGlobalFilterVoted || 'Most voted')}
                        </div>
                   </div>`
                : '';

        /* Language filter: Global (default) vs the current UI language. Applies to every
         * scope (local, saved, internet) so users can narrow the picker to trees that
         * declare their UI language. Trees without language metadata (typical for older
         * directory rows) are treated as language-agnostic and stay visible. */
        const langFilter = String(this._sourcesLangFilter || '*');
        const uiLangRaw = String(store.state?.lang || '').toUpperCase();
        const uiLangCode = uiLangRaw && uiLangRaw !== '*' ? uiLangRaw : '';
        const langPillBtn = (id, label) => {
            const active = langFilter === id;
            return `<button type="button" data-action="lang-filter" data-lang="${this._escAttr(id)}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide border transition-colors ${
                active
                    ? 'bg-emerald-700 dark:bg-emerald-400 text-white dark:text-slate-950 border-emerald-700 dark:border-emerald-400'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }">${this._escText(label)}</button>`;
        };
        const langFilterRow = advancedOpen
            ? `<div class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <p class="arborito-eyebrow m-0 mb-2">${this._escText(
                        ui.sourcesLangFilterTitle || 'Content language'
                    )}</p>
                    <div class="flex flex-wrap gap-2 items-center" role="group" aria-label="${this._escAttr(
                        ui.sourcesLangFilterAria || 'Filter by content language'
                    )}">
                        ${langPillBtn('*', `🌍 ${ui.sourcesLangFilterGlobal || 'Global'}`)}
                        ${uiLangCode ? langPillBtn(uiLangCode, `🗣 ${ui.sourcesLangFilterMyLang || 'My language'} (${uiLangCode})`) : ''}
                    </div>
               </div>`
            : '';
        /* Spinner uses `invisible` (visibility:hidden, keeps layout box) instead of `hidden`
         * (display:none, collapses box). Otherwise the `Filters` button would jump to fill
         * the freed space and the whole header would visibly "shake" on every keystroke. */
        const dirLoadingSlot = `<span id="arborito-sources-dir-loading" class="invisible inline-flex items-center gap-2 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-[11px] font-bold text-slate-600 dark:text-slate-300 shrink-0 max-w-full" role="status" aria-live="polite" aria-hidden="true"><span class="h-3.5 w-3.5 rounded-full border-2 border-slate-400 dark:border-slate-500 border-t-transparent animate-spin shrink-0" aria-hidden="true"></span><span class="leading-tight">${this._escText(
            ui.sourcesGlobalSearching || 'Searching…'
        )}</span></span>`;
        return `
            <div class="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/30" data-arbor-tour="sources-pick-tree">
                <div class="flex flex-col gap-3">
                    <p class="m-0 text-sm font-black text-slate-800 dark:text-slate-100">${this._escText(
                        ui.sourcesUnifiedAsk || 'What do you want to learn?'
                    )}</p>
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2 min-w-0">
                        <input id="inp-sources-search" type="search" autocomplete="off" value="${qVal}" placeholder="${qPh}" class="arborito-input min-w-0 sm:flex-1 min-h-[44px]" />
                        <div class="flex flex-wrap gap-2 items-center sm:items-stretch sm:shrink-0">
                            <button type="button" data-action="toggle-sources-advanced" class="min-h-[44px] flex-1 sm:flex-initial px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap">${advancedLabel}</button>
                            ${dirLoadingSlot}
                        </div>
                    </div>
                    ${
                        advancedOpen
                            ? `<div class="mt-1 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/20">
                                <div class="flex flex-wrap gap-2 items-center" role="group" aria-label="${this._escAttr(
                                    ui.sourcesUnifiedScopeAria || 'Filter trees'
                                )}">
                                    ${scopeBtn('all', ui.sourcesUnifiedScopeAll || 'All')}
                                    ${scopeBtn('local', ui.sourcesUnifiedScopeLocal || 'Local')}
                                    ${scopeBtn('saved', ui.sourcesUnifiedScopeSaved || ui.sourcesPillSaved || 'Saved')}
                                    ${scopeBtn('internet', ui.sourcesUnifiedScopeInternet || 'Internet')}
                                </div>
                                ${langFilterRow}
                                ${internetRankRow}
                            </div>`
                            : ''
                    }
                </div>
            </div>`;
    },

    _collectUnifiedItems(ui, state, activeSource, { scope, q }) {
        this._globalDirUiTruncated = false;
        const q2 = String(q || '');
        /** @type {{ score: number, html: string }[]} */
        const items = [];

        /* Language filter — '*' means show everything. A specific code (e.g. 'EN') skips trees
         * whose available languages are known and DON'T include the chosen code. Trees with no
         * declared language metadata (most internet directory rows today) pass through so the
         * filter never accidentally hides good content. */
        const langF = String(this._sourcesLangFilter || '*').toUpperCase();
        const passesLangFilter = (langKeys) => {
            if (langF === '*') return true;
            if (!Array.isArray(langKeys) || !langKeys.length) return true;
            return langKeys.some((k) => String(k || '').toUpperCase() === langF);
        };
        /* Implicit ranking boost: even when the user hasn't picked an explicit language filter,
         * trees that match their UI language float to the top of the merged list. The boost is
         * small (so explicit filters / votes still dominate) but visible — typical local rows
         * sit around 5-20 in score so +6 reshuffles peers without overpowering Discover. */
        const uiLang = String(store.state?.lang || '').toUpperCase();
        const langMatchBoost = (langKeys) => {
            if (!uiLang) return 0;
            if (!Array.isArray(langKeys) || !langKeys.length) return 0;
            return langKeys.some((k) => String(k || '').toUpperCase() === uiLang) ? 6 : 0;
        };

        // De-dup public tree sources: the same tree can exist as Local (published), Saved (community),
        // and Internet (directory). Prefer Local > Saved > Internet to avoid "3 copies".
        const seenPublishedTreeUrls = new Set();
        const ownPublishedTreeUrls = new Set();

        const localTreesAll = store.userStore.state.localTrees || [];
        /** Canonical nostr:// URLs for any local garden linked to a public universe (hide duplicate "Guardado"). */
        const ownPublishedCanonUrls = new Set();
        for (const t of localTreesAll) {
            const c = canonicalNetworkTreeUrlString(String(t?.publishedNetworkUrl || '').trim());
            if (c) ownPublishedCanonUrls.add(c);
        }
        /** @type {Map<string, { id: string, name: string }>} public tree URL -> local tree */
        const localPublished = new Map();
        if (scope !== 'internet' && scope !== 'saved') {
            /* Data-resilience: previously, when a local tree had `publishedNetworkUrl`
               set, this loop did `continue` — i.e. the local row was hidden and only
               the "Internet" row was shown. That row depends on a successful fetch
               from a Nostr relay. If the relay was flaky, blocked, or just hadn't
               propagated the bundle yet, the tree appeared to "disappear" from the
               list (even though the local copy was still safely on disk). Users
               legitimately got scared they had lost data.
               We now ALWAYS render the local row for every local tree. Published
               ones get a small badge so the user knows it is also on the network.
               De-duplication against the Saved / Internet sections is unchanged
               (see `seenPublishedTreeUrls` / `ownPublishedCanonUrls` below). */
            for (const t of localTreesAll) {
                const pubUrlRaw = String(t?.publishedNetworkUrl || '').trim();
                if (pubUrlRaw) {
                    const canon = canonicalNetworkTreeUrlString(pubUrlRaw) || pubUrlRaw;
                    localPublished.set(canon, { id: String(t?.id || ''), name: String(t?.name || '') });
                    try {
                        seenPublishedTreeUrls.add(pubUrlRaw);
                        if (canon !== pubUrlRaw) seenPublishedTreeUrls.add(canon);
                        ownPublishedTreeUrls.add(pubUrlRaw);
                        if (canon !== pubUrlRaw) ownPublishedTreeUrls.add(canon);
                    } catch {
                        /* ignore */
                    }
                }
                const s = this._scoreMatch(q2, t?.name, String(t?.id || ''));
                if (q2 && s <= 0) continue;
                const localLangKeys = t?.data?.languages ? Object.keys(t.data.languages) : null;
                if (!passesLangFilter(localLangKeys)) continue;
                const isActive = !!(activeSource && activeSource.id === t.id);
                const score =
                    (isActive ? 5 : 0) +
                    s +
                    (t?.updated ? Math.min(15, Math.floor(Number(t.updated) / 1e13)) : 0) +
                    langMatchBoost(localLangKeys);
                items.push({ score, html: this._renderItemLocal(ui, t, { activeSource }) });
            }
        }

        const communityAll = state.communitySources || [];
        if (scope !== 'local' && scope !== 'internet') {
            for (const s0 of communityAll) {
                try {
                    const u = String(s0?.url || '').trim();
                    const uCanon = canonicalNetworkTreeUrlString(u);
                    if (uCanon && ownPublishedCanonUrls.has(uCanon)) continue;
                    if (u && (seenPublishedTreeUrls.has(u) || (uCanon && seenPublishedTreeUrls.has(uCanon)))) {
                        continue;
                    }
                } catch {
                    /* ignore */
                }
                const s = this._scoreMatch(q2, s0?.name, s0?.url, String(s0?.id || ''));
                if (q2 && s <= 0) continue;
                /* Saved row languages may live on the row (when synced from the directory) or be
                 * absent. When absent, we let it through so users don't lose access to a tree
                 * they intentionally saved. */
                const savedLangKeys = Array.isArray(s0?.languages) ? s0.languages : null;
                if (!passesLangFilter(savedLangKeys)) continue;
                items.push({ score: 10 + s + langMatchBoost(savedLangKeys), html: this._renderItemSaved(ui, s0) });
                try {
                    const u = String(s0?.url || '').trim();
                    const uCanon = canonicalNetworkTreeUrlString(u);
                    if (u) seenPublishedTreeUrls.add(u);
                    if (uCanon) seenPublishedTreeUrls.add(uCanon);
                } catch {
                    /* ignore */
                }
            }
        }

        let rows = scope === 'local' ? [] : (Array.isArray(this._globalDirRows) ? this._globalDirRows : []);
        /* Ensure every published local tree appears as an Internet row (even if the
           directory fetch hasn't returned it yet — common right after publishing).
           In the unified "All" view we'd just duplicate the editable Local row, so
           we limit this synthetic injection to the Internet scope. */
        if (scope === 'internet' && localPublished.size) {
            const existing = new Set(rows.map((r) => formatNostrTreeUrl(r?.ownerPub, r?.universeId)));
            for (const [u, lt] of localPublished.entries()) {
                if (existing.has(u)) continue;
                const ref = parseNostrTreeUrl(u);
                if (!ref?.pub || !ref?.universeId) continue;
                rows = [
                    {
                        ownerPub: String(ref.pub),
                        universeId: String(ref.universeId),
                        title: lt.name || 'Published tree',
                        shareCode: '',
                        updatedAt: ''
                    },
                    ...rows
                ];
            }
        }
        if (scope !== 'local' && scope !== 'saved') {
            for (let ri = 0; ri < rows.length; ri++) {
                const r = rows[ri];
                try {
                    const u = formatNostrTreeUrl(r?.ownerPub, r?.universeId);
                    const uCanon = canonicalNetworkTreeUrlString(String(u || '').trim());
                    const installedInCommunity = (state.communitySources || []).some((cs) => {
                        const c = canonicalNetworkTreeUrlString(String(cs?.url || '').trim());
                        return !!c && !!uCanon && c === uCanon;
                    });
                    // In “All”: single card (Saved). In “Internet” keep directory listing.
                    if (installedInCommunity && scope === 'all') continue;
                    /* In "All": a local tree the user has just published is already shown
                       as a "Local · Published" row above; hiding the duplicate directory
                       echo avoids the row "jumping" between the local and internet
                       sections after a fresh publish. The Internet tab still shows it
                       for sharing/discovery. */
                    if (scope === 'all' && uCanon && ownPublishedCanonUrls.has(uCanon)) continue;
                    // Tree only published locally (no saved link): still show Internet row.
                    if (u && seenPublishedTreeUrls.has(String(u)) && !ownPublishedTreeUrls.has(String(u))) continue;
                } catch {
                    /* ignore */
                }
                if (store.isNostrTreeMaintainerBlocked(r?.ownerPub, r?.universeId)) continue;
                const stRow = this._computeDirectoryRowState(r);
                const hideFromViewer = this._shouldHideRowFromDirectory(r);
                if (hideFromViewer) continue;
                const s = this._scoreMatch(q2, r?.title, r?.shareCode, r?.ownerPub, r?.description, r?.authorName);
                if (q2 && s <= 0) continue;
                const dirLangKeys = Array.isArray(r?.languages) ? r.languages : null;
                if (!passesLangFilter(dirLangKeys)) continue;
                const hiddenPenalty = stRow.isReported || stRow.legalPendingDefense ? -150 : 0;
                const publicTreeUrl = (() => {
                    try {
                        return formatNostrTreeUrl(r?.ownerPub, r?.universeId);
                    } catch {
                        return '';
                    }
                })();
                const localInfo =
                    publicTreeUrl && localPublished.has(publicTreeUrl)
                        ? localPublished.get(publicTreeUrl)
                        : null;
                const orderPreserve = (rows.length - ri) * 0.09;
                items.push({
                    score: 20 + orderPreserve + s + hiddenPenalty + langMatchBoost(dirLangKeys),
                    html: this._renderItemInternet(ui, r, { localInfo })
                });
            }
        }

        // Sort by score desc; keep stable-ish by secondary key inside score.
        items.sort((a, b) => b.score - a.score);
        const cap = SOURCES_UNIFIED_DISPLAY_CAP;
        if (items.length > cap) this._globalDirUiTruncated = true;
        return items.slice(0, cap);
    },

    getLocalContent(ui, state, activeSource) {
        const localTrees = store.userStore.state.localTrees || [];
        const isLocalActive =
            activeSource?.type === 'local' || (activeSource?.url && activeSource.url.startsWith('local://'));
        return `
            <div class="flex flex-col h-full pt-4">
                <div class="mb-6 p-4 rounded-2xl border border-green-200/80 dark:border-green-800/60 bg-green-50/50 dark:bg-green-950/20 text-center">
                    <p class="text-[11px] text-slate-600 dark:text-slate-400 leading-snug m-0">
                        ${escHtml(
                            ui.welcomeEnterGardenLicenseReminder ||
                                ui.treesCcLicenseShort ||
                                'All shared trees are free to reuse (CC BY-SA 4.0).'
                        )}
                    </p>
                </div>
                <!-- Action Buttons -->
                <div class="grid grid-cols-1 gap-4 mb-6">
                    <button type="button" data-action="show-plant" class="py-4 px-5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 font-bold rounded-2xl active:scale-95 transition-all flex flex-col items-center gap-2 group shadow-sm hover:shadow-md">
                        <span class="text-3xl group-hover:-translate-y-1 transition-transform pointer-events-none">🌱</span> 
                        <span class="text-xs uppercase tracking-wide pointer-events-none font-black">${ui.plantTree || 'Create tree'}</span>
                        <span class="text-[10px] opacity-70 pointer-events-none font-normal">${ui.plantTreeDesc || 'Create a new local knowledge tree.'}</span>
                    </button>
                </div>

                <button data-action="import-tree" class="w-full py-4 px-4 mb-8 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-bold rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-3 group hover:border-sky-500 hover:text-sky-500 dark:hover:border-sky-400 dark:hover:text-sky-400">
                    <span class="text-2xl pointer-events-none group-hover:scale-110 transition-transform">📥</span> 
                    <span class="text-sm pointer-events-none uppercase tracking-wider">${ui.importBtn || 'Import'} (.arborito / .json)</span>
                </button>

                <!-- Local Trees List -->
                <div class="flex-1 space-y-4 pb-4">
                    ${localTrees.length === 0 
                        ? `<div class="arborito-empty arborito-empty--dashed">${escHtml(ui.sourcesLocalEmpty || 'Your garden is empty. Plant your first tree.')}</div>` 
                        : localTrees.map(t => {
                            const isActive = !!(activeSource && activeSource.id === t.id);
                            const signedIn = !!(store.isSignedIn && store.isSignedIn());
                            const isPrivateSynced = !!t.privateSyncedFromAccount;
                            const privateBadge = isPrivateSynced
                                ? `<span class="arborito-pill arborito-pill--chip arborito-pill--violet arborito-pill--bordered">🔒 ${escHtml(ui.privateTreeSyncedBadge || 'Account-synced')}</span>`
                                : '';
                            const privateActionBtn = signedIn
                                ? (isPrivateSynced
                                    ? `<button type="button" data-action="unpublish-private" data-id="${escAttr(t.id)}" class="px-3 py-2 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-xs font-bold rounded-xl border border-violet-200 dark:border-violet-800 transition-colors flex items-center gap-1.5" title="${escAttr(ui.privateTreesStopSync || 'Stop syncing to your account')}"><span>🔓</span><span>${escHtml(ui.privateTreesStopSyncShort || 'Stop sync')}</span></button>`
                                    : `<button type="button" data-action="publish-private" data-id="${escAttr(t.id)}" class="px-3 py-2 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-xs font-bold rounded-xl border border-violet-200 dark:border-violet-800 transition-colors flex items-center gap-1.5" title="${escAttr(ui.privateTreesPublishCta || 'Sync this tree privately to your account')}"><span>🔒</span><span>${escHtml(ui.privateTreesPublishCtaShort || 'Sync private')}</span></button>`)
                                : '';
                            return `
                            <div class="bg-white dark:bg-slate-900 border ${isActive ? 'border-green-500 ring-1 ring-green-500 shadow-md' : 'border-slate-200 dark:border-slate-700'} rounded-2xl p-4 flex items-center justify-between group hover:border-green-300 dark:hover:border-green-700 transition-all">
                                <div class="flex items-center gap-4 min-w-0">
                                    <div class="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center text-xl shadow-sm">🌳</div>
                                    <div class="min-w-0">
                                        <div class="flex items-center gap-2 flex-wrap">
                                            <h4 class="font-bold text-slate-800 dark:text-white truncate text-sm m-0">${escHtml(t.name)}</h4>
                                            ${privateBadge}
                                        </div>
                                        <p class="text-[11px] text-slate-400 font-mono mt-0.5">${escHtml(ui.sourcesUpdated || 'Updated')}: ${new Date(t.updated).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div class="flex gap-2 shrink-0 items-center flex-wrap justify-end">
                                    <button type="button" data-action="tree-info" data-id="${escAttr(t.id)}" data-name="${escAttr(t.name)}" class="arborito-icon-btn arborito-icon-btn--sm" title="${escAttr(ui.treesViewTreeInfoButton || ui.treeInfoModalTitle || 'Tree information')}" aria-label="${escAttr(ui.treesViewTreeInfoButton || ui.treeInfoModalTitle || 'Tree information')}">ℹ️</button>
                                    <button data-action="export-local" data-id="${escAttr(t.id)}" data-name="${escAttr(t.name)}" class="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-600 dark:text-blue-300 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-2 hover:border-blue-300" title="${escAttr(ui.sourceExport)}">
                                        <span>📤</span>
                                    </button>
                                    ${privateActionBtn}
                                    
                                    ${isActive 
                                        ? `<span class="arborito-pill arborito-pill--lg arborito-pill--green border border-green-200 cursor-default">${escHtml(ui.sourceActive)}</span>`
                                        : `<button data-action="load-local" data-id="${escAttr(t.id)}" data-name="${escAttr(t.name)}" class="px-6 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow hover:opacity-90 transition-opacity uppercase tracking-wider">${escHtml(ui.sourceLoad)}</button>`
                                    }
                                    <button type="button" data-action="show-delete" data-id="${escAttr(t.id)}" class="arborito-icon-btn arborito-icon-btn--sm arborito-icon-btn--danger ml-1" title="${escAttr(ui.sourceRemove)}" aria-label="${escAttr(ui.sourceRemove)}">🗑️</button>
                                </div>
                            </div>
                            `;
                        }).join('')
                    }
                </div>
            </div>`;
    },

};
