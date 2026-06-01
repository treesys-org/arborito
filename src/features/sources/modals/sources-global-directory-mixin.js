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
import { resolveDirectoryAuthorLabel } from '../../tree-graph/tree-owner-display.js';

export const sourcesGlobalDirectoryMethods = {

    _computeReportSignalsFromRows(rows, { daysWindow = 14 } = {}) {
        const list = Array.isArray(rows) ? rows : [];
        const ms = Math.max(1, Math.min(90, Number(daysWindow) || 14)) * 24 * 60 * 60 * 1000;
        const cutoff = Date.now() - ms;
        const uniq = new Set();
        let score = 0;
        for (const rec of list) {
            if (!rec || typeof rec !== 'object') continue;
            const by = String(rec.by || '').trim();
            if (!by) continue;
            const t = Date.parse(String(rec.at || ''));
            if (!t || t < cutoff) continue;
            if (uniq.has(by)) continue;
            uniq.add(by);

            const reason = String(rec.reason || '').trim().toLowerCase();
            const reasonW = reason === 'phishing' ? 1.35 : reason === 'copyright' ? 1.25 : 1;
            score += reasonW;
        }
        return { unique: uniq.size, score: Math.round(score * 100) / 100 };
    },

    _computeDirectoryRowState(r) {
        const ownerPub = String(r?.ownerPub || '').trim();
        const universeId = String(r?.universeId || '').trim();
        const m = this._getRowMetrics(r);
        const reports14 = Number.isFinite(Number(m.reports14Unique)) ? Number(m.reports14Unique) : null;
        const reportScore = Number.isFinite(Number(m.reportScore)) ? Number(m.reportScore) : null;
        const legal90Unique = Number.isFinite(Number(m.legal90Unique)) ? Number(m.legal90Unique) : null;
        const thr = this._reportHideThreshold();
        const isReported = reportScore != null && reportScore >= thr;
        const hidden = !!isReported;
        const legalLatestAt = String(m.legalLatestAt || '').trim();
        const legalOwnerDefenseLatestAt = String(m.legalOwnerDefenseLatestAt || '').trim();
        const ms48 = 48 * 60 * 60 * 1000;
        const legalT = legalLatestAt ? Date.parse(legalLatestAt) : NaN;
        const covered = !!(legalLatestAt && legalOwnerDefenseLatestAt && legalOwnerDefenseLatestAt >= legalLatestAt);
        /** Legal claim without signed owner reply: public listing must not show it to third parties (DSA / diligence). */
        const legalPendingDefense =
            (Number(legal90Unique) || 0) > 0 && !!legalLatestAt && !covered && Number.isFinite(legalT);
        const legalWithin48h = !!(legalPendingDefense && Date.now() - legalT < ms48);
        const legalAfter48h = !!(legalPendingDefense && Date.now() - legalT >= ms48);
        const legalDisputeWindowOpen = legalWithin48h;
        return {
            ownerPub,
            universeId,
            reports14,
            reportScore,
            legal90Unique,
            legalLatestAt,
            legalOwnerDefenseLatestAt,
            threshold: thr,
            isReported,
            hidden,
            legalPendingDefense,
            legalWithin48h,
            legalAfter48h,
            legalDisputeWindowOpen
        };
    },

    /**
     * If global listing is loaded, return directory row for this link (title, author, description).
     * @param {{ url?: string }} s
     */
    _directoryRowForCommunitySource(s) {
        const rows = Array.isArray(this._globalDirRows) ? this._globalDirRows : [];
        if (!rows.length || !s?.url) return null;
        const ref = parseNostrTreeUrl(String(s.url).trim());
        if (ref?.pub && ref?.universeId) {
            const pub = String(ref.pub);
            const uid = String(ref.universeId);
            return rows.find((r) => String(r?.ownerPub || '') === pub && String(r?.universeId || '') === uid) || null;
        }
        return null;
    },

    _wireGlobalDirectoryControls(container) {
        if (!container) return;
        const inp = container.querySelector('#inp-sources-search');
        if (inp) {
            inp.oninput = () => {
                this._sourcesQ = inp.value || '';
                this._globalDirQ = this._sourcesQ;
                this._scheduleGlobalDirectoryFetch({ reason: 'input' });
            };
        }
    },

    _scheduleGlobalDirectoryFetch({ reason = 'input' } = {}) {
        if (this._globalDirTimer) clearTimeout(this._globalDirTimer);
        const delay = reason === 'render' ? 0 : 260;
        this._globalDirTimer = setTimeout(() => {
            void this._runGlobalDirectoryFetch();
        }, delay);
    },

    async _runGlobalDirectoryFetch() {
        const net = store.nostr;
        const now = Date.now();
        if (now - (this._globalDirLastFetchAt || 0) < 800 && this._globalDirLoading) return;
        this._globalDirLastFetchAt = now;
        this._globalDirLoading = true;
        this._globalDirError = '';
        this._syncSourcesDirLoadingVisibility();
        try {
            const q = String(this._globalDirQ || '').trim();
            const qNorm = q.replace(/^#/, '').trim();
            /** @type {{ ownerPub: string, universeId: string, title: string, shareCode: string, updatedAt: string, description?: string, authorName?: string }[]} */
            let rows = [];
            let directoryHitCap = false;
            let directoryFetchError = '';

            if (net && typeof net.listGlobalTreeDirectoryEntriesOnce === 'function') {
                try {
                    rows = await net.listGlobalTreeDirectoryEntriesOnce({ limit: DIRECTORY_CLIENT_FETCH_LIMIT, query: q });
                    rows = Array.isArray(rows) ? rows : [];
                    rows = rows.filter((r) => !store.isNostrTreeMaintainerBlocked(r?.ownerPub, r?.universeId));
                    directoryHitCap = rows.length >= DIRECTORY_CLIENT_FETCH_LIMIT;

                    // Allow searching by share code directly in the unified search box.
                    if (qNorm && /^[a-z0-9]{4,14}$/i.test(qNorm) && typeof net.resolveTreeShareCode === 'function') {
                        try {
                            const ref = await net.resolveTreeShareCode(qNorm);
                            if (ref?.pub && ref?.universeId) {
                                const canonPub = String(ref.pub);
                                const canonUid = String(ref.universeId);
                                if (store.isNostrTreeMaintainerBlocked(canonPub, canonUid)) {
                                    /* no-op */
                                } else {
                                    const exists = rows.some((r) => String(r.ownerPub) === canonPub && String(r.universeId) === canonUid);
                                    if (!exists) {
                                        const codeRow = {
                                            ownerPub: canonPub,
                                            universeId: canonUid,
                                            title: `Code #${qNorm}`,
                                            shareCode: qNorm,
                                            updatedAt: ''
                                        };
                                        if (Array.isArray(ref.recommendedRelays) && ref.recommendedRelays.length) {
                                            codeRow.recommendedRelays = ref.recommendedRelays;
                                        }
                                        rows = [codeRow, ...rows];
                                    }
                                }
                            }
                        } catch {
                            /* ignore */
                        }
                    }
                } catch (e) {
                    directoryFetchError = String(e?.message || e);
                    rows = [];
                }
            } else {
                directoryFetchError = String(store.ui.nostrNotLoadedHint || 'Nostr is not available.').trim();
            }

            let torrentRows = [];
            try {
                torrentRows = await loadGlobalDirectoryRowsFromTorrent(store, { query: q });
            } catch (e) {
                console.warn('[Arborito] global directory torrent', e);
            }

            let httpRows = [];
            try {
                httpRows = await loadGlobalDirectoryRowsFromHttp({ query: q });
            } catch (e) {
                console.warn('[Arborito] global directory http', e);
            }

            rows = mergeNostrAndTorrentDirectoryRows(mergeNostrAndTorrentDirectoryRows(rows, torrentRows), httpRows);
            rows = rows.filter((r) => !store.isNostrTreeMaintainerBlocked(r?.ownerPub, r?.universeId));
            if (rows.length > DIRECTORY_CLIENT_FETCH_LIMIT) {
                rows = rows.slice(0, DIRECTORY_CLIENT_FETCH_LIMIT);
                this._globalDirHitCap = true;
            } else {
                this._globalDirHitCap = directoryHitCap;
            }

            this._globalDirRows = rows;
            this._globalDirLoading = false;
            if (!rows.length && directoryFetchError) {
                this._globalDirError = directoryFetchError;
            } else {
                this._globalDirError = '';
            }
            void this._applyGlobalDirectorySortAndMetrics();
        } catch (e) {
            this._globalDirHitCap = false;
            this._globalDirLoading = false;
            this._globalDirRows = [];
            this._globalDirError = String(e?.message || e);
            this.updateContent();
        }
    },

    _rerankGlobalDirectoryRowsOnly() {
        const filter = String(this._globalDirFilter || 'discover');
        const rows = Array.isArray(this._globalDirRows) ? [...this._globalDirRows] : [];
        if (!rows.length) return;
        const tieBreak = (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        const m2 = this._globalDirMetrics && typeof this._globalDirMetrics === 'object' ? this._globalDirMetrics : {};
        const dirScore = (r) => {
            const k = `${r.ownerPub}/${r.universeId}`;
            const mm = m2[k] || {};
            if (filter === 'discover') return this._discoverListingScore(r, mm);
            if (filter === 'voted') return Number(mm.votes) || 0;
            if (filter === 'used7') return Number(mm.used7) || 0;
            if (filter === 'active') return Number(mm.used1) || 0;
            return 0;
        };
        if (filter === 'recent') rows.sort((a, b) => tieBreak(a, b));
        else if (filter === 'discover' || filter === 'voted' || filter === 'used7' || filter === 'active') {
            rows.sort((a, b) => dirScore(b) - dirScore(a) || tieBreak(a, b));
        }
        this._globalDirRows = rows;
    },

    async _applyGlobalDirectorySortAndMetrics() {
        const filter = String(this._globalDirFilter || 'discover');
        const rows = Array.isArray(this._globalDirRows) ? [...this._globalDirRows] : [];
        const tieBreak = (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        if (filter === 'recent') {
            rows.sort((a, b) => tieBreak(a, b));
            this._globalDirRows = rows;
            this.updateContent();
            return;
        }
        await this._ensureGlobalMetricsForRows(rows, filter);
        const m2 = this._globalDirMetrics && typeof this._globalDirMetrics === 'object' ? this._globalDirMetrics : {};
        const dirScore = (r) => {
            const k = `${r.ownerPub}/${r.universeId}`;
            const mm = m2[k] || {};
            if (filter === 'discover') return this._discoverListingScore(r, mm);
            if (filter === 'voted') return Number(mm.votes) || 0;
            if (filter === 'used7') return Number(mm.used7) || 0;
            if (filter === 'active') return Number(mm.used1) || 0;
            return 0;
        };
        if (filter === 'discover' || filter === 'voted' || filter === 'used7' || filter === 'active') {
            rows.sort((a, b) => dirScore(b) - dirScore(a) || tieBreak(a, b));
        }
        this._globalDirRows = rows;
        this.updateContent();
    },

    async _ensureGlobalMetricsForRows(rows, filter) {
        const net = store.nostr;
        if (!net) return;
        if (!Array.isArray(rows) || !rows.length) return;
        if (!this._globalDirMetrics || typeof this._globalDirMetrics !== 'object') this._globalDirMetrics = {};
        const needVotes = filter === 'voted' || filter === 'discover';
        const needUsed7 = filter === 'used7' || filter === 'discover';
        const needUsed1 = filter === 'active' || filter === 'discover';
        const needReports = true; // always useful for hiding/pills
        const needLegal = true;

        const queue = [];
        for (const r of rows.slice(0, DIRECTORY_CLIENT_FETCH_LIMIT)) {
            const k = `${r.ownerPub}/${r.universeId}`;
            const cur = this._globalDirMetrics[k] || {};
                const missing =
                (needVotes && cur.votes == null) ||
                (needUsed7 && cur.used7 == null) ||
                (needUsed1 && cur.used1 == null) ||
                (needReports && (cur.reportScore == null || cur.reports14Unique == null)) ||
                (needLegal && cur.legal90Unique == null) ||
                (needLegal &&
                    Number(cur.legal90Unique) > 0 &&
                    (cur.legalLatestAt === undefined || cur.legalOwnerDefenseLatestAt === undefined));
            if (!missing) continue;
            if (cur.loading) continue;
            this._globalDirMetrics[k] = { ...cur, loading: true };
            queue.push({ r, k });
        }
        if (!queue.length) return;

        const runOne = async ({ r, k }) => {
            try {
                const next = { ...(this._globalDirMetrics[k] || {}) };
                if (needVotes) next.votes = await net.countTreeVotesOnce({ ownerPub: r.ownerPub, universeId: r.universeId });
                if (needUsed7) next.used7 = await net.countTreeUsageUniqueLastNDaysOnce({ ownerPub: r.ownerPub, universeId: r.universeId, days: 7 });
                if (needUsed1) next.used1 = await net.countTreeUsageUniqueLastNDaysOnce({ ownerPub: r.ownerPub, universeId: r.universeId, days: 1 });
                if (needReports && typeof net.listTreeReportsOnce === 'function') {
                    const rows = await net.listTreeReportsOnce({ ownerPub: r.ownerPub, universeId: r.universeId, max: 900 });
                    const sig = this._computeReportSignalsFromRows(rows, { daysWindow: 14 });
                    next.reports14Unique = sig.unique;
                    next.reportScore = sig.score;
                }
                if (needLegal && typeof net.countTreeLegalReportsOnce === 'function') {
                    next.legal90Unique = await net.countTreeLegalReportsOnce({ ownerPub: r.ownerPub, universeId: r.universeId, daysWindow: 90 });
                    if (Number(next.legal90Unique) > 0) {
                        if (typeof net.listTreeLegalReportsOnce === 'function') {
                            const lr = await net.listTreeLegalReportsOnce({ ownerPub: r.ownerPub, universeId: r.universeId, max: 1 });
                            next.legalLatestAt = String(lr?.[0]?.at || '');
                        } else {
                            next.legalLatestAt = '';
                        }
                        if (typeof net.loadTreeLegalOwnerDefenseOnce === 'function') {
                            const def = await net.loadTreeLegalOwnerDefenseOnce({ ownerPub: r.ownerPub, universeId: r.universeId });
                            next.legalOwnerDefenseLatestAt = String(def?.latestLegalReportAt || '');
                        } else {
                            next.legalOwnerDefenseLatestAt = '';
                        }
                    } else {
                        next.legalLatestAt = '';
                        next.legalOwnerDefenseLatestAt = '';
                    }
                }
                next.loading = false;
                this._globalDirMetrics[k] = next;
            } catch {
                this._globalDirMetrics[k] = { ...(this._globalDirMetrics[k] || {}), loading: false };
            }
        };

        const concurrency = 6;
        let idx = 0;
        const workers = Array.from({ length: concurrency }, async () => {
            while (idx < queue.length) {
                const item = queue[idx++];
                await runOne(item);
            }
        });
        await Promise.all(workers);
    },

    getGlobalContent(ui, state, activeSource, opts = {}) {
        const { includeActiveTreeSection = true } = opts || {};

        const isLocalActive =
            !!activeSource &&
            (activeSource.type === 'local' || (activeSource.url && activeSource.url.startsWith('local://')));
        const releases = state.availableReleases || [];
        const normalize = (u) => {
            try {
                return new URL(u, window.location.href).href;
            } catch (e) {
                return u;
            }
        };

        const otherSources = (state.communitySources || []).filter((s) => !activeSource || s.id !== activeSource.id);

        let activeTreeSection = '';
        if (!activeSource) {
            activeTreeSection = `
                <div class="p-6 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-600 text-center mb-8 block">
                    <span class="text-4xl block mb-3" aria-hidden="true">🌳</span>
                    <p class="font-bold text-slate-800 dark:text-white text-base">${escHtml(ui.sourcesGlobalEmptyTitle || ui.noTreesTitle)}</p>
                    <p class="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">${escHtml(ui.sourcesGlobalEmptyLead || ui.noTreesLead)}</p>
                </div>`;
        } else if (isLocalActive) {
            // In the unified single-view layout this banner is redundant/noisy.
            activeTreeSection = '';
        } else {
            const activeUrl = normalize(activeSource.url);
            const effectiveReleases =
                releases.length > 0
                    ? releases
                    : [
                          {
                              id: 'current-unknown',
                              name: 'Current Version',
                              url: activeSource.url,
                              type: 'manual'
                          }
                      ];
            const selectedUrl = this.selectedVersionUrl || activeSource.url;
            const isDifferent = normalize(selectedUrl) !== activeUrl;
            const treeInfoBtnGlobal = this.treeInfoIconButtonHtml(ui, state);
            activeTreeSection = `
                <div class="bg-slate-50 dark:bg-slate-950/50 p-6 rounded-2xl border-2 border-purple-500/30 relative shadow-sm mb-8 block">
                    <div class="arborito-pill arborito-pill--solid-purple absolute top-0 right-0 rounded-bl-xl rounded-none shadow-sm" style="padding:0.25rem 0.75rem">
                        ${escHtml(ui.sourceActive)}
                    </div>
                    <h3 class="font-black text-xl text-slate-800 dark:text-white mb-1 flex items-center gap-2">
                        <span>🌳</span> ${escHtml(activeSource.name)}
                    </h3>
                    <p class="text-xs text-slate-400 font-mono truncate mb-6 opacity-70 border-b border-slate-200 dark:border-slate-800 pb-4">${escHtml(activeSource.url)}</p>
                    
                    <div class="flex gap-3 items-end">
                        <div class="flex-1 min-w-0 arborito-sources-version-wrap relative z-[120]">
                            <label class="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">${escHtml(ui.releasesSnapshot || 'Version')}</label>
                            <div class="relative z-10">
                                <select id="version-select" 
                                    class="arborito-select font-bold appearance-none transition-shadow hover:shadow-sm cursor-pointer pr-10"
                                    style="-webkit-appearance: none; -moz-appearance: none; appearance: none;">
                                    ${effectiveReleases.map((r) => `
                                        <option value="${escAttr(r.url)}" ${normalize(r.url) === normalize(selectedUrl) ? 'selected' : ''}>
                                            ${r.type === 'rolling' ? '🌊 ' : r.type === 'archive' ? '🏛️ ' : '📄 '} 
                                            ${escHtml(r.name || r.year || 'Unknown Version')}
                                        </option>
                                    `).join('')}
                                </select>
                                <div class="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-400 text-sm leading-none" aria-hidden="true">▼</div>
                            </div>
                        </div>
                        <button data-action="share-tree" class="bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 px-4 py-3.5 rounded-xl font-bold text-lg border border-slate-200 dark:border-slate-700 transition-colors shadow-sm" title="Copy Share Link">
                           🔗
                        </button>
                    </div>
                    ${
                        treeInfoBtnGlobal
                            ? `<div class="flex flex-wrap justify-end gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">${treeInfoBtnGlobal}</div>`
                            : ''
                    }
                </div>`;
        }
        if (!includeActiveTreeSection) activeTreeSection = '';

        const aliasKeys = listKnownAliasKeys();
        const quickPickHtml =
            aliasKeys.length > 0
                ? `<p class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-2">${escHtml(ui.sourcesAliasQuickPick || 'Quick add (official names)')}</p>
                    <div class="flex flex-wrap gap-2 mb-3" role="group" aria-label="${escAttr(ui.sourcesAliasQuickPick || 'Quick add')}">
                        ${aliasKeys
                            .map(
                                (k) => `
                        <button type="button" data-action="quick-alias" data-alias="${escAttr(k)}" class="px-3 py-2 rounded-xl text-xs font-bold bg-purple-100 dark:bg-purple-900/35 text-purple-900 dark:text-purple-100 border border-purple-200/80 dark:border-purple-700/80 hover:bg-purple-200/80 dark:hover:bg-purple-800/50 transition-colors">${escHtml(k)}</button>`
                            )
                            .join('')}
                    </div>`
                : '';

        const globalSearchTitle = escHtml(ui.sourcesGlobalSearchTitle || 'Internet trees');
        const globalSearchHint = escHtml(
            ui.sourcesGlobalSearchHint ||
                'Search title, description, or public author name. Results are always partial—refine your query or use a code.'
        );
        const qVal = escAttr(this._globalDirQ || '');
        const qPh = escAttr(ui.sourcesGlobalSearchPlaceholder || 'Search by name…');
        const filter = String(this._globalDirFilter || 'discover');
        const filterBtn = (id, label) => {
            const active = filter === id;
            return `<button type="button" data-action="global-filter" data-filter="${escAttr(id)}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide border transition-colors ${
                active
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }">${escHtml(label)}</button>`;
        };
        const filterRow = `<div class="flex flex-wrap gap-2 mt-3 items-center" role="group" aria-label="${escAttr(ui.sourcesGlobalSearchFiltersAria || 'Global tree filters')}">
            ${filterBtn('discover', ui.sourcesGlobalFilterDiscover || 'Discover')}
            ${filterBtn('recent', ui.sourcesGlobalFilterRecent || 'Recent')}
            ${filterBtn('voted', ui.sourcesGlobalFilterVoted || 'Most voted')}
        </div>`;

        const rows = Array.isArray(this._globalDirRows) ? this._globalDirRows : [];
        const metrics = this._globalDirMetrics && typeof this._globalDirMetrics === 'object' ? this._globalDirMetrics : {};
        const loading = !!this._globalDirLoading;
        const err = String(this._globalDirError || '').trim();
        const fmtAgo = (iso) => {
            try {
                const then = new Date(iso).getTime();
                if (!then) return '';
                const diff = Date.now() - then;
                const h = Math.floor(diff / 3600000);
                if (h < 1) return ui.sourcesJustNow || 'just now';
                if (h < 48) return (ui.sourcesHoursAgo || '{n}h ago').replace('{n}', String(h));
                const d = Math.floor(h / 24);
                return (ui.sourcesDaysAgo || '{n}d ago').replace('{n}', String(d));
            } catch {
                return '';
            }
        };
        const authorLabel = (row) => resolveDirectoryAuthorLabel(row);
        const rowHtml = (r) => {
            const k = `${r.ownerPub}/${r.universeId}`;
            const m = metrics[k] || {};
            const votes = Number.isFinite(Number(m.votes)) ? Number(m.votes) : null;
            const used7 = Number.isFinite(Number(m.used7)) ? Number(m.used7) : null;
            const used1 = Number.isFinite(Number(m.used1)) ? Number(m.used1) : null;
            const meta =
                filter === 'discover'
                    ? `${fmtAgo(r.updatedAt) || '—'} · ${votes == null ? '…' : `${votes} 👍`} · ${used7 == null ? '…' : String(used7)}`
                    : filter === 'voted'
                      ? (votes == null ? '—' : `${votes} 👍`)
                      : filter === 'used7'
                        ? (used7 == null ? '—' : `${used7} ${escHtml(ui.sourcesGlobalUsedLabel || 'users')}`)
                        : filter === 'active'
                          ? (used1 == null ? '—' : `${used1} ${escHtml(ui.sourcesGlobalActiveLabel || 'active')}`)
                          : (fmtAgo(r.updatedAt) || '—');
            const metaLbl =
                filter === 'discover'
                    ? (ui.sourcesGlobalDiscoverMetaLabel || 'Discover')
                    : filter === 'recent'
                      ? (ui.sourcesGlobalUpdatedAgo || 'Updated')
                      : filter === 'voted'
                        ? (ui.sourcesGlobalVotesLabel || 'Votes')
                        : filter === 'used7'
                          ? (ui.sourcesGlobalUsed7Label || 'Used (7d)')
                          : (ui.sourcesGlobalActiveNowLabel || ui.sourcesGlobalActiveNow || 'Active now');
            const metaPill = `<span class="arborito-pill arborito-pill--chip arborito-pill--slate arborito-pill--bordered">${escHtml(metaLbl)}: ${escHtml(meta)}</span>`;
            const voteUpLbl = escAttr(ui.sourcesGlobalVoteUp || ui.sourcesGlobalVote);
            const voteDownLbl = escAttr(ui.sourcesGlobalVoteDown);
            const reportLbl = escAttr(ui.sourcesGlobalReport);
            const by = authorLabel(r);
            const score = Number.isFinite(Number(m.reportScore)) ? Number(m.reportScore) : null;
            const thr = this._reportHideThreshold();
            const isReported = score != null && score >= thr;
            const reportedPill = isReported
                ? `<span class="arborito-pill arborito-pill--chip arborito-pill--amber arborito-pill--bordered">${escHtml(ui.sourcesGlobalReportedPill || 'Reported')}</span>`
                : '';
            let rowIsOwner = false;
            try {
                rowIsOwner = !!(r?.ownerPub && store.getNostrPublisherPair?.(r.ownerPub)?.priv);
            } catch {
                rowIsOwner = false;
            }
            const primaryOpenText = escHtml(
                rowIsOwner ? ui.sourcesGlobalEditOwnTree || ui.navConstruct || 'Edit' : ui.sourcesGlobalOpenTree || ui.sourceLoad
            );
            const primaryOpenEditOwn = rowIsOwner ? ' data-edit-own="1"' : '';
            const reportRow = rowIsOwner
                ? ''
                : `<button type="button" data-action="global-report" data-owner-pub="${escAttr(r.ownerPub)}" data-universe-id="${escAttr(r.universeId)}" class="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-amber-50 dark:bg-amber-950/25 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-950 dark:text-amber-100 border border-amber-200 dark:border-amber-800">${escHtml(reportLbl)} ⚠</button>`;
            return `<div class="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <p class="m-0 text-sm font-black text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">${escHtml(r.title || 'Untitled')}</p>
                        <p class="m-0 mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-semibold">${escHtml(ui.sourcesGlobalBy || 'by')} ${escHtml(by)}</p>
                        <div class="mt-2 flex flex-wrap gap-2 items-center">${metaPill}${r.shareCode ? `<span class="arborito-pill arborito-pill--chip arborito-pill--purple arborito-pill--bordered">#${escHtml(r.shareCode)}</span>` : ''}${reportedPill}</div>
                    </div>
                    <div class="flex flex-col gap-2 shrink-0">
                        <button type="button" data-action="global-open" data-owner-pub="${escAttr(r.ownerPub)}" data-universe-id="${escAttr(r.universeId)}" data-share-code="${escAttr(r.shareCode || '')}"${primaryOpenEditOwn} class="arborito-cta-emerald min-h-10 px-3 py-2 rounded-xl text-xs font-black shadow-sm">${primaryOpenText}</button>
                        <div class="flex gap-2">
                            <button type="button" data-action="global-vote" data-vote="up" data-owner-pub="${escAttr(r.ownerPub)}" data-universe-id="${escAttr(r.universeId)}" class="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 flex-1">${escHtml(voteUpLbl)}</button>
                            <button type="button" data-action="global-vote" data-vote="down" data-owner-pub="${escAttr(r.ownerPub)}" data-universe-id="${escAttr(r.universeId)}" class="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 flex-1">${escHtml(voteDownLbl)}</button>
                        </div>
                        ${reportRow}
                    </div>
                </div>
            </div>`;
        };
        const filteredRows = rows.filter(
            (r) => !store.isNostrTreeMaintainerBlocked(r?.ownerPub, r?.universeId) && !this._shouldHideRowFromDirectory(r)
        );

        const resultsHtml = loading
            ? calloutHtml({ tone: 'slate', size: 'sm', extraClass: 'text-xs font-bold', body: escHtml(ui.sourcesGlobalSearching || 'Searching…') })
            : err
            ? calloutHtml({ tone: 'amber', size: 'sm', extraClass: 'text-xs font-bold', body: escHtml(err) })
            : filteredRows.length
            ? `<div class="space-y-3">${filteredRows.map(rowHtml).join('')}</div>`
            : `<div class="arborito-empty arborito-empty--dashed">${escHtml(ui.sourcesGlobalNoMatches || 'No matches yet. Try a different search.')}</div>`;

        const partialListingBanner =
            !loading && !err && this._globalDirHitCap
                ? calloutHtml({
                    tone: 'sky', layout: 'stack', size: 'sm', extraClass: 'mt-3',
                    htmlBody: `<p class="m-0 font-black">${escHtml(ui.sourcesGlobalPartialTitle || 'Partial directory listing')}</p>
                        <p class="m-0 mt-1 font-semibold">${escHtml(ui.sourcesGlobalPartialBody || 'We only load a limited batch per query (the network is huge). Try more specific keywords, use a share code, or check again later.')}</p>`,
                })
                : '';

        const torrentIndexLagBanner = usesGlobalDirectoryPointerForTorrent()
            ? calloutHtml({ tone: 'amber', size: 'sm', inline: true, extraClass: 'm-0 mt-2 leading-snug', body: escHtml(ui.sourcesGlobalTorrentIndexLagHint || 'Optional torrent mirror: the public list updates on a schedule, so very new trees may appear there after a short delay. Live network metadata is usually ahead.') })
            : '';

        return `
            <div class="pt-2">
                ${activeTreeSection}

                <!-- GLOBAL DIRECTORY SEARCH (Nostr; metadata only) -->
                <div class="block mb-8">
                    <div class="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/30">
                        <h3 class="m-0 text-sm font-black text-slate-800 dark:text-white">${globalSearchTitle}</h3>
                        <p class="m-0 mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">${globalSearchHint}</p>
                        ${torrentIndexLagBanner}
                        <div class="mt-4 flex gap-2 items-stretch">
                            <input id="inp-global-tree-search" type="search" autocomplete="off" value="${qVal}" placeholder="${qPh}" class="arborito-input flex-1 min-h-[44px]" />
                            <button type="button" data-action="global-refresh" class="min-h-[44px] px-4 py-3 rounded-xl font-black text-sm bg-slate-900 dark:bg-white text-white dark:text-slate-900">↻</button>
                        </div>
                        ${filterRow}
                        ${partialListingBanner}
                        <div class="mt-4">${resultsHtml}</div>
                    </div>
                </div>

                <!-- SAVED TREES LIST -->
                <div class="block">
                    
                    ${otherSources.length === 0 
                        ? `<div class="arborito-empty arborito-empty--dashed">${ui.sourcesNoCommunity || 'No other trees yet.'}</div>`
                        : `<div class="space-y-3">
                            ${otherSources.map(s => `
                                <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl group hover:border-slate-300 dark:hover:border-slate-600 transition-colors shadow-sm">
                                    <div class="flex items-center gap-4 overflow-hidden">
                                        <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl" title="${s.origin === 'nostr' ? 'Public' : 'HTTPS'}">${s.origin === 'nostr' ? '🕸️' : '🌐'}</div>
                                        <div class="min-w-0">
                                            <h4 class="font-bold text-sm text-slate-700 dark:text-slate-200 truncate">${escHtml(s.name)}</h4>
                                            <p class="text-[10px] text-slate-400 truncate font-mono">${escHtml(s.url)}</p>
                                        </div>
                                    </div>
                                    <div class="flex gap-2">
                                        <button data-action="load-source" data-id="${escAttr(s.id)}" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-bold rounded-xl border border-amber-600/40 shadow-sm ring-1 ring-amber-600/30 dark:ring-amber-400/40 transition-colors">${escHtml(ui.sourceLoad)}</button>
                                        <button type="button" data-action="remove-source" data-id="${escAttr(s.id)}" class="arborito-icon-btn arborito-icon-btn--sm arborito-icon-btn--danger" aria-label="${escAttr(ui.sourcesGlobalRemove || ui.sourceRemove || 'Uninstall')}">🗑️</button>
                                    </div>
                                </div>
                            `).join('')}
                           </div>`
                    }
                </div>

                <!-- One field: Arborito detects share codes, public links, and HTTPS automatically -->
                <div class="pt-6 border-t border-slate-100 dark:border-slate-800 mt-4">
                    <label class="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">${escHtml(ui.sourcesOneLinkLabel || 'Add a tree')}</label>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-snug">${escHtml(ui.sourcesOneLinkHint || 'Type an 8-character share code or paste the full link—the app figures it out. Official names are resolved on this device only.')}</p>
                    ${quickPickHtml}
                    ${ui.sourcesAliasPrivacyNote ? `<p class="text-[10px] text-slate-400 dark:text-slate-500 mb-2 leading-snug">${escHtml(ui.sourcesAliasPrivacyNote)}</p>` : ''}
                    <div class="flex gap-2">
                        <input id="inp-tree-link" type="text" autocomplete="off" placeholder="${escAttr(ui.sourcesOneLinkPlaceholder || 'Tree name or share code')}" class="arborito-input flex-1">
                        <button type="button" data-action="add-tree-link" class="arborito-cta-purple px-6 py-2 rounded-xl font-bold shadow-md active:scale-95 transition-transform text-lg shrink-0" title="${escAttr(ui.sourceAdd || 'Add')}">+</button>
                    </div>
                </div>
            </div>`;
    },

};
