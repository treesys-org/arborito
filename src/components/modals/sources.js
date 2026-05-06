
import { store } from '../../store.js';
import { listKnownAliasKeys } from '../../config/tree-aliases.js';
import { handleSwitch, plantNewTree, importTreeFromFile, loadLocalTree, exportLocalTree, shareActiveTree } from './sources-logic.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { bindMobileTap } from '../../utils/mobile-tap.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { formatNostrTreeUrl, parseNostrTreeUrl } from '../../services/nostr-refs.js';
import { DIRECTORY_CLIENT_FETCH_LIMIT, SOURCES_UNIFIED_DISPLAY_CAP } from '../../config/directory-index.js';
import { promptTreeLegalReportEvidence } from '../../utils/tree-legal-report-evidence-prompts.js';
import {
    loadGlobalDirectoryRowsFromHttp,
    loadGlobalDirectoryRowsFromTorrent,
    mergeNostrAndTorrentDirectoryRows,
    usesGlobalDirectoryPointerForTorrent
} from '../../utils/global-directory-torrent.js';

/** Normalize `nostr://…` to dedupe rows (local publish vs saved source). */
function canonicalNetworkTreeUrlString(urlStr) {
    const g = parseNostrTreeUrl(String(urlStr || '').trim());
    return g ? formatNostrTreeUrl(g.pub, g.universeId) : '';
}

function escapeHtmlAttr(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeHtmlText(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

class ArboritoModalSources extends HTMLElement {
    constructor() {
        super();
        // Legacy: this modal previously had tabs. Keep state for back-navigation payloads.
        this.activeTab = 'local';
        this.selectedVersionUrl = null;
        this.overlay = null; // 'plant' | 'delete' | 'import'
        this.targetId = null; // ID for delete
        this.isInitialized = false;
        /** Keeps plant overlay name across modal re-renders on each state-change (mobile). */
        this._overlayPlantNameDraft = '';
        /** Batches bursts of `state-change` (less list / overlay flicker). */
        this._sourcesUpdateScheduled = false;
        /** `bindMobileTap` cleanups on `#tab-content` (recreated each update). */
        this._tabContentTapCleanups = [];

        // --- Global directory search (Nostr; metadata-only) ---
        this._globalDirQ = '';
        // Unified sources search (local + internet)
        this._sourcesQ = '';
        /** @type {'all'|'local'|'internet'} */
        this._sourcesScope = 'all';
        /** Header: advanced controls collapsed by default (reduce cognitive load). */
        this._sourcesAdvancedOpen = false;
        /** Row-level secondary actions expanded state (keyed). */
        this._rowActionsOpen = new Set();
        /** @type {'discover'|'active'|'recent'|'used7'|'voted'} */
        this._globalDirFilter = 'discover';
        /** Global directory: last request hit row cap (partial results). */
        this._globalDirHitCap = false;
        /** Unified list: more rows than `SOURCES_UNIFIED_DISPLAY_CAP` after sorting. */
        this._globalDirUiTruncated = false;
        this._globalDirLoading = false;
        this._globalDirError = '';
        /** @type {{ ownerPub: string, universeId: string, title: string, shareCode: string, updatedAt: string }[]} */
        this._globalDirRows = [];
        /** @type {Record<string, { votes?: number, used7?: number, used1?: number, reports14Unique?: number, reportScore?: number, legal90Unique?: number, legalLatestAt?: string, legalOwnerDefenseLatestAt?: string, loading?: boolean }>} */
        this._globalDirMetrics = {};
        this._lastUnifiedHtml = null;
        this._globalDirTimer = null;
        this._globalDirLastFetchAt = 0;
    }

    _lsGet(key) {
        try { return localStorage.getItem(key); } catch { return null; }
    }
    _lsSet(key, value) {
        try { localStorage.setItem(key, value); } catch { /* ignore */ }
    }
    _lsDel(key) {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
    _cooldownOk(key, minMs) {
        const raw = this._lsGet(key);
        const last = raw ? Number(raw) : 0;
        const now = Date.now();
        if (last && Number.isFinite(last) && now - last < minMs) return false;
        this._lsSet(key, String(now));
        return true;
    }
    _voteKey(ownerPub, universeId, voterPub) {
        return `arborito-tree-vote-v1:${ownerPub}/${universeId}:${voterPub}`;
    }
    _voteKeyFallback(ownerPub, universeId) {
        return `arborito-tree-vote-local-v1:${ownerPub}/${universeId}`;
    }
    _usageKey(ownerPub, universeId, userPub) {
        return `arborito-tree-usage-v1:${ownerPub}/${universeId}:${userPub}`;
    }
    _ensureNostrUserFirstSeen() {
        const k = 'arborito-nostr-user-first-seen-v1';
        const legacy = 'arborito-nostr-user-first-seen-v1';
        const raw = this._lsGet(k) || this._lsGet(legacy);
        if (raw && Number(raw) > 0) return Number(raw);
        const now = Date.now();
        this._lsSet(k, String(now));
        return now;
    }

    _reportHideThreshold() {
        // Weighted report score threshold (local policy).
        return 8;
    }

    _rowKey(r) {
        return `${r?.ownerPub || ''}/${r?.universeId || ''}`;
    }

    _getRowMetrics(r) {
        const k = this._rowKey(r);
        const metrics = this._globalDirMetrics && typeof this._globalDirMetrics === 'object' ? this._globalDirMetrics : {};
        return metrics[k] && typeof metrics[k] === 'object' ? metrics[k] : {};
    }

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
    }

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
            /** @deprecated use legalPendingDefense — hidden for non-owners once legal dispute is open */
            legalDelistedPublic: legalPendingDefense,
            legalPendingDefense,
            legalWithin48h,
            legalAfter48h,
            legalDisputeWindowOpen
        };
    }

    _isDirectoryRowOwner(r) {
        try {
            const pub = String(r?.ownerPub || '').trim();
            return !!(pub && store.getNostrPublisherPair?.(pub)?.priv);
        } catch {
            return false;
        }
    }

    /**
     * Hide this directory row for the current viewer?
     * Owner: always sees own entry (community reports or legal dispute) so they can act.
     * Others: hide above report threshold and trees with pending legal dispute (no “report tourism”).
     */
    _shouldHideRowFromDirectory(r) {
        const st = this._computeDirectoryRowState(r);
        if (this._isDirectoryRowOwner(r)) return false;
        if (st.hidden) return true;
        return !!st.legalPendingDefense;
    }

    connectedCallback() {
        const m = store.value.modal;
        if (m && typeof m === 'object' && m.focusTab === 'local') {
            this.activeTab = 'local';
        }
        // Initial Render of the Skeleton
        if (!this.isInitialized) {
            this.renderSkeleton();
            this.isInitialized = true;
        }
        
        // Initial Content Load
        this.updateContent();

        // Bind to store
        this.storeListener = () => this.scheduleUpdateContent();
        store.addEventListener('state-change', this.storeListener);
    }

    scheduleUpdateContent() {
        if (!this.isInitialized) return;
        if (this._sourcesUpdateScheduled) return;
        this._sourcesUpdateScheduled = true;
        queueMicrotask(() => {
            this._sourcesUpdateScheduled = false;
            this.updateContent();
        });
    }
    
    disconnectedCallback() {
        this._disposeTabContentTaps();
        store.removeEventListener('state-change', this.storeListener);
    }

    _disposeTabContentTaps() {
        if (!Array.isArray(this._tabContentTapCleanups) || !this._tabContentTapCleanups.length) return;
        this._tabContentTapCleanups.forEach((fn) => fn());
        this._tabContentTapCleanups.length = 0;
    }

    /**
     * Each panel `button[data-action]` gets its own `bindMobileTap`.
     * Global delegation + elementFromPoint on scroll containers fails on Android (tap ignored).
     */
    _wireTabContentActionButtons(container) {
        this._disposeTabContentTaps();
        if (!container) return;
        container.querySelectorAll('button[data-action]').forEach((btn) => {
            const disposer = bindMobileTap(btn, (ev) => {
                if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                void this.handleActionFromElement(btn);
            });
            this._tabContentTapCleanups.push(disposer);
        });
    }

    /** @param {{ returnToMore?: boolean }} [opts] — false after load tree / plant / import (do not return to More sheet). */
    close(opts = {}) {
        if (this.hasAttribute('embed')) {
            if (opts.returnToMore === false) {
                this.overlay = null;
                this.targetId = null;
                this._overlayPlantNameDraft = '';
                document.querySelector('arborito-sidebar')?.closeMobileMenuIfOpen?.();
            }
            return;
        }
        if (store.isSourcesDismissBlocked()) {
            const ui = store.ui;
            store.notify(ui.sourcesDismissNeedTree || 'Add or load a tree before closing.', true);
            return;
        }
        store.dismissModal({ returnToMore: opts.returnToMore !== false });
    }

    // --- RENDER SKELETON (Run Once) ---
    renderSkeleton() {
        const ui = store.ui;
        const embedded = this.hasAttribute('embed');

        const mobSources = shouldShowMobileUI();
        const heroRow = embedded
            ? ''
            : mobSources
              ? `
                <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-center gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0')}
                    <div class="min-w-0 flex-1">
                        <h2 class="arborito-mmenu-subtitle m-0">${ui.sourceManagerTitle}</h2>
                        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">${ui.sourceManagerDesc}</p>
                    </div>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>`
              : `
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0')}
                    <div class="min-w-0 flex-1">
                        <h2 class="arborito-mmenu-subtitle m-0">${ui.sourceManagerTitle}</h2>
                        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">${ui.sourceManagerDesc}</p>
                    </div>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>`;

        const shellStyle = embedded ? 'height:100%;max-height:100%;min-height:0;' : '';
        const shellClass = embedded
            ? 'arborito-sources-modal-shell arborito-sources-modal-shell--embed bg-white dark:bg-slate-900 w-full relative flex flex-col min-h-0 flex-1 border-0 shadow-none cursor-auto isolation isolate overflow-hidden'
            : mobSources
              ? 'arborito-sources-modal-shell bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-5xl w-full relative flex flex-col min-h-0 border border-slate-200 dark:border-slate-800 cursor-auto isolation isolate'
              : 'arborito-sources-modal-shell arborito-float-modal-card bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto isolation isolate';

        const inner = `
            <div class="${shellClass}" style="${shellStyle || undefined}">
                ${heroRow}

                <div id="tab-content" class="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 pt-3 min-h-0 pr-1 relative z-0">
                </div>
                <div id="overlay-container" class="absolute inset-0 z-[200] hidden pointer-events-none"></div>
            </div>`;

        const m = store.value.modal;
        const instantBackdrop =
            !embedded &&
            m &&
            typeof m === 'object' &&
            m.fromConstructionMore &&
            shouldShowMobileUI();
        const fadeCls = instantBackdrop ? '' : ' animate-in fade-in';
        const instantCls = instantBackdrop ? ' arborito-modal-backdrop--instant' : '';

        const backdropLayout =
            mobSources && !embedded
                ? 'items-start justify-center overflow-y-auto pt-5 pb-10 sm:pt-6 sm:pb-12'
                : 'items-center justify-center';
        this.innerHTML = embedded
            ? `<div class="arborito-sources-embed-root flex flex-col flex-1 min-h-0 w-full h-full min-w-0 overflow-hidden">${inner}</div>`
            : `<div id="modal-backdrop" class="fixed inset-0 z-[70] flex ${backdropLayout} bg-slate-950 p-4${fadeCls} arborito-modal-root${instantCls}">${inner}</div>`;

        this.querySelectorAll('.btn-close').forEach((b) => bindMobileTap(b, () => this.close()));

        this.addEventListener('change', (e) => this.handleDelegatedChange(e));
    }

    // --- DYNAMIC CONTENT UPDATE ---
    updateContent() {
        if (!this.isInitialized) return;

        const ui = store.ui;
        const state = store.value;
        const activeSource = state.activeSource;

        const container = this.querySelector('#tab-content');
        const prevScrollTop = container?.scrollTop ?? 0;
        const activeEl = document.activeElement;
        const prevSearch =
            activeEl &&
            activeEl instanceof HTMLInputElement &&
            activeEl.id === 'inp-sources-search'
                ? {
                      value: activeEl.value,
                      selectionStart: activeEl.selectionStart,
                      selectionEnd: activeEl.selectionEnd
                  }
                : null;

        // 1. Render Overlay (if any)
        this.renderOverlay(ui);

        // 2. Render Single View (no tabs)
        const nextHtml = this.getUnifiedContent(ui, state, activeSource);
        if (this._lastUnifiedHtml !== nextHtml) {
            container.innerHTML = nextHtml;
            this._lastUnifiedHtml = nextHtml;
        }
        this._wireTabContentActionButtons(container);
        this._wireGlobalDirectoryControls(container);
        // Avoid re-fetch loops that cause flicker: only fetch when we have no rows yet.
        if (!this._globalDirRows?.length) this._scheduleGlobalDirectoryFetch({ reason: 'render' });
        this._syncSourcesDismissChrome();

        // Prevent perceived "flicker" while typing by keeping focus + caret stable.
        if (prevSearch && container) {
            const inp = container.querySelector('#inp-sources-search');
            if (inp && inp instanceof HTMLInputElement) {
                const v = String(prevSearch.value ?? '');
                if (inp.value !== v) inp.value = v;
                try {
                    inp.focus({ preventScroll: true });
                } catch {
                    inp.focus();
                }
                const ss = prevSearch.selectionStart;
                const se = prevSearch.selectionEnd;
                if (typeof ss === 'number' && typeof se === 'number') {
                    try {
                        inp.setSelectionRange(ss, se);
                    } catch {
                        /* ignore */
                    }
                }
            }
        }
        if (container) container.scrollTop = prevScrollTop;
        this._syncSourcesDirLoadingVisibility();
    }

    /** Directory fetch spinner: toggles without rewriting `#tab-content` (avoids mobile modal jump). */
    _syncSourcesDirLoadingVisibility() {
        const el = this.querySelector('#arborito-sources-dir-loading');
        if (!el) return;
        const on = !!this._globalDirLoading;
        el.classList.toggle('hidden', !on);
        el.setAttribute('aria-hidden', on ? 'false' : 'true');
    }

    _escText(s) { return escapeHtmlText(s); }
    _escAttr(s) { return escapeHtmlAttr(s); }
    _normQ(s) { return String(s || '').trim().toLowerCase(); }
    _scoreMatch(query, ...haystacks) {
        const q = this._normQ(query);
        if (!q) return 0;
        const hs = haystacks.map((h) => this._normQ(h)).filter(Boolean);
        let best = 0;
        for (const h of hs) {
            if (!h) continue;
            if (h === q) best = Math.max(best, 100);
            else if (h.startsWith(q)) best = Math.max(best, 70);
            else if (h.includes(q)) best = Math.max(best, 40);
        }
        return best;
    }

    /**
     * “Discover” style ranking: recency + 👍 + recent use; down-weights old content with no signals (does not hide).
     * @param {{ updatedAt?: string }} r
     * @param {{ votes?: number, used7?: number, used1?: number }} [m]
     */
    _discoverListingScore(r, m = {}) {
        const votes = Number.isFinite(Number(m.votes)) ? Number(m.votes) : 0;
        const used7 = Number.isFinite(Number(m.used7)) ? Number(m.used7) : 0;
        const used1 = Number.isFinite(Number(m.used1)) ? Number(m.used1) : 0;
        const ts = Date.parse(String(r?.updatedAt || '')) || 0;
        const ageDays = ts > 0 ? Math.max(0, (Date.now() - ts) / 86400000) : 365;
        const novelty = Math.exp(-ageDays / 14) * 150;
        const engagement = Math.log1p(votes) * 72 + Math.log1p(used7) * 58 + Math.log1p(used1) * 24;
        let score = novelty + engagement;
        if (ageDays >= 12 && votes < 2 && used7 < 3 && used1 < 2) score *= 0.18;
        if (ageDays < 8 && votes === 0 && used7 === 0 && used1 === 0) score += 44;
        return score;
    }

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

        const listHtml = listEmpty
            ? `<div class="p-6 rounded-2xl border-2 border-dashed border-slate-100 dark:border-slate-800 text-center text-slate-400 text-sm">${this._escText(
                  ui.sourcesUnifiedEmpty || 'No results.'
              )}</div>`
            : `<div class="space-y-3">${items.map((it) => it.html).join('')}</div>`;

        // Unified: search is the one entry point. Manual add lives in advanced paths.
        const addLinkHtml = '';

        const ctaHtml = listEmpty
            ? `
                <div class="mt-5 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/30">
                    <p class="m-0 text-xs font-black text-slate-800 dark:text-slate-100">${this._escText(
                        ui.sourcesCtaTitle || 'Looking for a tree, or creating one?'
                    )}</p>
                    <p class="m-0 mt-1 text-xs text-slate-500 dark:text-slate-400 leading-snug">${this._escText(
                        ui.sourcesCtaBody ||
                            'This screen is for searching and loading trees. If you want to create a new one (author mode), tap “Create tree”.'
                    )}</p>
                    <div class="mt-3 flex flex-wrap gap-2">
                        <button type="button" data-action="import-tree" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">${this._escText(
                            ui.importBtnShort || ui.importBtn || 'Import'
                        )}</button>
                        <button type="button" data-action="show-plant" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm">${this._escText(
                            ui.plantTreeShort || ui.plantTree || 'Create tree'
                        )}</button>
                    </div>
                </div>`
            : `
                <div class="mt-5 flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/30">
                    <p class="m-0 text-[11px] font-bold text-slate-500 dark:text-slate-400">${this._escText(
                        ui.sourcesCtaCompact || 'Create or import'
                    )}</p>
                    <div class="flex flex-wrap gap-2">
                        <button type="button" data-action="import-tree" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">${this._escText(
                            ui.importBtnShort || ui.importBtn || 'Import'
                        )}</button>
                        <button type="button" data-action="show-plant" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm">${this._escText(
                            ui.plantTreeShort || ui.plantTree || 'Create tree'
                        )}</button>
                    </div>
                </div>`;

        return `
            <div class="pt-2">
                ${header}
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
                ${ctaHtml}
            </div>`;
    }

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
                        <p class="m-0 mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">${this._escText(
                            ui.sourcesUnifiedInternetSortTitle || 'Internet sort'
                        )}</p>
                        <div class="flex flex-wrap gap-2 items-center" role="group" aria-label="${this._escAttr(
                            ui.sourcesUnifiedInternetSortAria || 'How to sort Internet trees'
                        )}">
                            ${internetRankBtn('discover', ui.sourcesGlobalFilterDiscover || 'Discover')}
                            ${internetRankBtn('used7', ui.sourcesGlobalFilterUsed7d || 'Most used (7 days)')}
                            ${internetRankBtn('recent', ui.sourcesGlobalFilterRecent || 'Recent')}
                            ${internetRankBtn('voted', ui.sourcesGlobalFilterVoted || 'Most voted')}
                            ${internetRankBtn('active', ui.sourcesGlobalFilterActiveNow || 'Trees active now')}
                        </div>
                        <p class="m-0 mt-2 text-[10px] leading-snug text-slate-500 dark:text-slate-400">${this._escText(
                            ui.sourcesUnifiedInternetSortHint ||
                                'Discover blends freshness and engagement (likes & usage). With no signals, older listings sink; Recent and Most used are straight sorts.'
                        )}</p>
                   </div>`
                : '';
        const dirLoadingSlot = `<span id="arborito-sources-dir-loading" class="hidden inline-flex items-center gap-2 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-[11px] font-bold text-slate-600 dark:text-slate-300 shrink-0 max-w-full" role="status" aria-live="polite" aria-hidden="true"><span class="h-3.5 w-3.5 rounded-full border-2 border-slate-400 dark:border-slate-500 border-t-transparent animate-spin shrink-0" aria-hidden="true"></span><span class="leading-tight">${this._escText(
            ui.sourcesGlobalSearching || 'Searching…'
        )}</span></span>`;
        return `
            <div class="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/30" data-arbor-tour="sources-pick-tree">
                <div class="flex flex-col gap-3">
                    <p class="m-0 text-sm font-black text-slate-800 dark:text-slate-100">${this._escText(
                        ui.sourcesUnifiedAsk || 'What do you want to learn?'
                    )}</p>
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2 min-w-0">
                        <input id="inp-sources-search" type="search" autocomplete="off" value="${qVal}" placeholder="${qPh}" class="w-full min-w-0 sm:flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-500 dark:text-white min-h-[44px]" />
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
                                ${internetRankRow}
                            </div>`
                            : ''
                    }
                </div>
            </div>`;
    }

    _renderPill(txt, cls) {
        return `<span class="text-[10px] font-black tracking-wide rounded-full px-2.5 py-1 border ${cls}">${this._escText(
            txt
        )}</span>`;
    }

    _collectUnifiedItems(ui, state, activeSource, { scope, q }) {
        this._globalDirUiTruncated = false;
        const q2 = String(q || '');
        /** @type {{ score: number, html: string }[]} */
        const items = [];

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
            for (const t of localTreesAll) {
                const pubUrlRaw = String(t?.publishedNetworkUrl || '').trim();
                if (pubUrlRaw) {
                    // Published local trees should be represented by the Internet row (single, unified UI).
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
                    continue;
                }
                const s = this._scoreMatch(q2, t?.name, String(t?.id || ''));
                if (q2 && s <= 0) continue;
                const isActive = !!(activeSource && activeSource.id === t.id);
                const score = (isActive ? 5 : 0) + s + (t?.updated ? Math.min(15, Math.floor(Number(t.updated) / 1e13)) : 0);
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
                items.push({ score: 10 + s, html: this._renderItemSaved(ui, s0) });
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
        // Ensure every published local tree appears as an Internet row (even if directory fetch didn't return it yet).
        if (scope !== 'local' && scope !== 'saved' && localPublished.size) {
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
                    score: 20 + orderPreserve + s + hiddenPenalty,
                    html: this._renderItemInternet(ui, r, { localInfo })
                });
            }
        }

        // Sort by score desc; keep stable-ish by secondary key inside score.
        items.sort((a, b) => b.score - a.score);
        const cap = SOURCES_UNIFIED_DISPLAY_CAP;
        if (items.length > cap) this._globalDirUiTruncated = true;
        return items.slice(0, cap);
    }

    _renderItemLocal(ui, t, { activeSource }) {
        const isActive = !!(activeSource && activeSource.id === t.id);
        const key = `local:${String(t?.id || '')}`;
        const open = !!(key && this._rowActionsOpen && this._rowActionsOpen.has(key));
        return `<div class="p-4 bg-white dark:bg-slate-900 border ${
            isActive ? 'border-emerald-500/70 dark:border-emerald-500/50' : 'border-slate-200 dark:border-slate-800'
        } rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex flex-wrap gap-2 items-center">
                        <p class="m-0 text-sm font-black text-slate-800 dark:text-slate-100 truncate">🌳 ${this._escText(
                            t?.name
                        )}</p>
                        ${this._renderPill(
                            ui.sourcesPillLocal || 'Local',
                            'bg-emerald-50 dark:bg-emerald-950/25 text-emerald-900 dark:text-emerald-200 border-emerald-200/70 dark:border-emerald-800/60'
                        )}
                        ${
                            isActive
                                ? this._renderPill(
                                      ui.sourceActive || 'Active',
                                      'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                                  )
                                : ''
                        }
                    </div>
                    <p class="m-0 mt-1 text-[10px] text-slate-400 font-mono">${this._escText(
                        ui.sourcesUpdated || 'Updated'
                    )}: ${this._escText(new Date(t?.updated).toLocaleDateString())}</p>
                </div>
                <div class="flex gap-2 shrink-0 items-center">
                    ${
                        isActive
                            ? ''
                            : `<button data-action="load-local" data-id="${this._escAttr(
                                  t?.id
                              )}" data-name="${this._escAttr(
                                  t?.name
                              )}" class="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm hover:opacity-90 transition-opacity">${this._escText(
                                  ui.sourceLoad
                              )}</button>`
                    }
                    <button type="button" data-action="toggle-row-actions" data-key="${this._escAttr(
                        key
                    )}" class="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors text-sm font-black" aria-expanded="${open ? 'true' : 'false'}" aria-label="${this._escAttr(
                        ui.more || ui.navMore || 'More'
                    )}">⋯</button>
                    <button type="button" data-action="show-delete" data-id="${this._escAttr(
                        t?.id
                    )}" class="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white shadow-sm" aria-label="${this._escAttr(
                        ui.sourceRemove
                    )}">${this._escText(ui.sourceRemove)}</button>
                </div>
            </div>
            ${
                open
                    ? `<div class="mt-3 flex flex-wrap gap-2">
                        <button type="button" data-action="tree-info" data-id="${this._escAttr(
                            t?.id
                        )}" data-name="${this._escAttr(t?.name)}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">${this._escText(
                            ui.treesViewTreeInfoButton || ui.treeInfoModalTitle || 'Tree information'
                        )}</button>
                        <button type="button" data-action="export-local" data-id="${this._escAttr(
                            t?.id
                        )}" data-name="${this._escAttr(t?.name)}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/30">${this._escText(
                            ui.sourceExport || 'Export'
                        )}</button>
                    </div>`
                    : ''
            }
        </div>`;
    }

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
    }

    _renderItemSaved(ui, s) {
        const key = `saved:${String(s?.id || '')}`;
        const open = !!(key && this._rowActionsOpen && this._rowActionsOpen.has(key));
        const dir = this._directoryRowForCommunitySource(s);
        let treeRef = null;
        try {
            treeRef = parseNostrTreeUrl(String(s?.url || '').trim());
        } catch {
            treeRef = null;
        }
        const titleRaw = String(dir?.title || s?.name || '').trim();
        const title =
            titleRaw ||
            (s?.origin === 'nostr'
                ? ui.graphUntitledDefault || 'Untitled'
                : (() => {
                      try {
                          return new URL(String(s.url).trim(), window.location.href).hostname;
                      } catch {
                          return ui.graphUntitledDefault || 'Untitled';
                      }
                  })());
        const desc = String(dir?.description || s?.listDescription || '').trim();
        const codeForPill = String(s?.shareCode || dir?.shareCode || '').trim();

        /* HTTPS or other links without Nostr ref: same layout as Internet (title + description), no “by” row. */
        if (!treeRef) {
            const originIcon = s.origin === 'nostr' ? '🕸️' : '🌐';
            return `<div class="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex flex-wrap gap-2 items-center">
                        <p class="m-0 text-sm font-black text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">${originIcon} ${this._escText(
                title
            )}</p>
                        ${this._renderPill(
                            ui.sourcesPillSaved || 'Guardado',
                            'bg-purple-50 dark:bg-purple-900/25 text-purple-900 dark:text-purple-200 border-purple-200/70 dark:border-purple-800/60'
                        )}
                        ${
                            codeForPill
                                ? this._renderPill(
                                      `#${codeForPill}`,
                                      'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                                  )
                                : ''
                        }
                    </div>
                    ${
                        desc
                            ? `<p class="m-0 mt-2 text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-3">${this._escText(
                                  desc
                              )}</p>`
                            : ''
                    }
                </div>
                <div class="flex gap-2 shrink-0 items-center">
                    <button data-action="load-source" data-id="${this._escAttr(
                        s?.id
                    )}" class="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-sm ring-1 ring-amber-600/40 dark:ring-amber-400/50">${this._escText(
                ui.sourceLoad
            )}</button>
                    <button type="button" data-action="toggle-row-actions" data-key="${this._escAttr(
                        key
                    )}" class="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors text-sm font-black" aria-expanded="${open ? 'true' : 'false'}" aria-label="${this._escAttr(
                ui.more || ui.navMore || 'More'
            )}">⋯</button>
                </div>
            </div>
            ${
                open
                    ? `<div class="mt-3 flex flex-wrap gap-2">
                        <button type="button" data-action="remove-source" data-id="${this._escAttr(
                            s?.id
                        )}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60 hover:bg-rose-50 dark:hover:bg-rose-900/20">${this._escText(
                            ui.sourceRemove || 'Remove'
                        )}</button>
                    </div>`
                    : ''
            }
        </div>`;
        }

        const r = {
            ownerPub: String(treeRef.pub),
            universeId: String(treeRef.universeId),
            title,
            shareCode: codeForPill,
            description: desc,
            authorName: String(dir?.authorName || s?.listAuthorName || '').trim()
        };
        const st = this._computeDirectoryRowState(r);
        const ownerPub = st.ownerPub;
        const isReported = st.isReported;
        const m = this._getRowMetrics(r);
        const votes = Number.isFinite(Number(m?.votes)) ? Number(m.votes) : null;
        const voteUpLbl = this._escAttr(ui.sourcesGlobalVoteUp || ui.sourcesGlobalVote);
        const reportLbl = this._escAttr(ui.sourcesGlobalReport || ui.sourcesGlobalReport);
        const liked = (() => {
            try {
                const pair = store.getNetworkUserPair?.();
                const pub = String(pair?.pub || '').trim();
                if (pub) {
                    const lsKey = this._voteKey(st.ownerPub, st.universeId, pub);
                    return this._lsGet(lsKey) === '1';
                }
                const fallback = this._voteKeyFallback(st.ownerPub, st.universeId);
                return this._lsGet(fallback) === '1';
            } catch {
                return false;
            }
        })();
        const isOwner = (() => {
            try {
                return !!(ownerPub && store.getNostrPublisherPair?.(ownerPub)?.priv);
            } catch {
                return false;
            }
        })();
        const latestLegalAt = String(st.legalLatestAt || '').trim();
        const defenseAt = String(st.legalOwnerDefenseLatestAt || '').trim();
        const hasLegal = (Number(st.legal90Unique) || 0) > 0;
        const legalDefensePending =
            isOwner && hasLegal && latestLegalAt && (!defenseAt || defenseAt < latestLegalAt);
        const ms48 = 48 * 60 * 60 * 1000;
        const legalDeadlineMs = (() => {
            const t = Date.parse(latestLegalAt);
            return Number.isFinite(t) ? t + ms48 : NaN;
        })();
        const legalHoursLeft = (() => {
            if (!Number.isFinite(legalDeadlineMs)) return null;
            const msLeft = Math.max(0, legalDeadlineMs - Date.now());
            return Math.max(1, Math.ceil(msLeft / 3600000));
        })();
        const ownerPill = isOwner
            ? this._renderPill(
                  ui.sourcesPillOwner,
                  'bg-emerald-50 dark:bg-emerald-950/25 text-emerald-900 dark:text-emerald-200 border-emerald-200/70 dark:border-emerald-800/60'
              )
            : '';
        const statusPills = [
            isReported
                ? this._renderPill(
                      ui.sourcesGlobalReportedPill || 'Reported',
                      'bg-amber-50 dark:bg-amber-950/25 text-amber-950 dark:text-amber-100 border-amber-200 dark:border-amber-800'
                  )
                : '',
            (Number(st.legal90Unique) || 0) > 0
                ? this._renderPill(
                      ui.sourcesGlobalDisputePill || 'Dispute',
                      'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                  )
                : '',
            (() => {
                try {
                    const ref = store.getActivePublicTreeRef?.();
                    if (!ref) return '';
                    if (String(ref.pub) !== String(st.ownerPub) || String(ref.universeId) !== String(st.universeId)) return '';
                    const seeds = store.state.nostrLiveSeeds;
                    const lbl = ui.treeNetworkHealthSeedsLabel || 'Seeds';
                    return this._renderPill(
                        `${lbl}: ${seeds == null ? '—' : String(seeds)}`,
                        'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                    );
                } catch {
                    return '';
                }
            })()
        ]
            .filter(Boolean)
            .join('');

        const descHtml = desc
            ? `<p class="m-0 mt-2 text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-3">${this._escText(desc)}</p>`
            : '';
        const sharePillHtml = r.shareCode
            ? this._renderPill(
                  `#${r.shareCode}`,
                  'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              )
            : '';

        return `<div class="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex flex-wrap gap-2 items-center">
                        <button type="button" data-action="global-open" data-owner-pub="${this._escAttr(
                            r.ownerPub
                        )}" data-universe-id="${this._escAttr(r.universeId)}" data-share-code="${this._escAttr(
            r.shareCode || ''
        )}"${isOwner ? ' data-edit-own="1"' : ''} class="p-0 m-0 bg-transparent border-0 cursor-pointer text-left text-sm font-black text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 hover:underline">🌍 ${this._escText(
            r.title
        )}</button>
                        ${this._renderPill(
                            ui.sourcesPillInternet || 'Internet',
                            'bg-sky-50 dark:bg-sky-950/25 text-sky-900 dark:text-sky-200 border-sky-200/70 dark:border-sky-800/60'
                        )}
                        ${ownerPill}
                        ${sharePillHtml}
                    </div>
                    ${descHtml}
                    ${
                        isReported
                            ? `<p class="m-0 mt-2 text-[10px] text-slate-500 dark:text-slate-400 leading-snug">${this._escText(
                                  ui.sourcesGlobalHiddenHint ||
                                      'Community signals hide this listing from the public directory; only you (the owner) see it here.'
                              )}</p>`
                            : ''
                    }
                    ${
                        legalDefensePending
                            ? `<p class="m-0 mt-2 text-[10px] text-amber-900 dark:text-amber-100/90 leading-snug font-semibold">${this._escText(
                                  (st.legalAfter48h
                                      ? ui.sourcesLegalDisputeOwnerAfter48h ||
                                        'More than 48 hours since the legal notice without your signed owner response. The listing stays off the public directory; sign below to record your position.'
                                      : (ui.sourcesLegalDisputeOwnerBefore48h ||
                                            'Legal claim: others do not see this listing in the directory until it is resolved. About {hours} hour(s) left to submit your signed owner response under ⋯.'
                                        ).replace(/\{hours\}/g, String(legalHoursLeft ?? '48'))
                                  ) || ''
                              )}</p>`
                            : ''
                    }
                </div>
                <div class="flex gap-2 shrink-0 items-center">
                    <button type="button" data-action="global-vote" data-vote="up" data-owner-pub="${this._escAttr(
                        r.ownerPub
                    )}" data-universe-id="${this._escAttr(r.universeId)}" class="w-9 h-9 flex items-center justify-center rounded-xl border transition-colors ${
            liked
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm dark:bg-emerald-600 dark:border-emerald-500 dark:text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.97]'
        }" aria-label="${voteUpLbl}">
                        ${
                            liked
                                ? `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" class="block">
                                    <path fill="currentColor" d="M1 21h4V9H1v12zm22-11.5c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.82 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73V9.5z"/>
                                  </svg>`
                                : `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" class="block">
                                    <path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" d="M1 21h4V9H1v12zm22-11.5c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.82 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73V9.5z"/>
                                  </svg>`
                        }
                    </button>
                    <span class="min-h-10 px-3 py-2 rounded-xl text-sm font-black bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 border border-slate-200 dark:border-slate-700 tabular-nums" aria-label="${this._escAttr(
                        ui.sourcesGlobalVote || ui.sourcesGlobalVoteUp
                    )}">${String(votes == null ? 0 : Math.max(0, votes))}</span>
                    <button type="button" data-action="toggle-row-actions" data-key="${this._escAttr(
                        key
                    )}" class="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors text-sm font-black" aria-expanded="${open ? 'true' : 'false'}" aria-label="${this._escAttr(
            ui.navMore || ui.more
        )}">⋯</button>
                    <button data-action="load-source" data-id="${this._escAttr(
                        s?.id
                    )}" class="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-sm ring-1 ring-amber-600/40 dark:ring-amber-400/50">${this._escText(
            ui.sourceLoad
        )}</button>
                </div>
            </div>
            ${
                open
                    ? `<div class="mt-3 space-y-2">
                        ${statusPills ? `<div class="flex flex-wrap gap-2 items-center">${statusPills}</div>` : ''}
                        <div class="flex flex-wrap gap-2">
                            ${
                                isOwner
                                    ? ''
                                    : `<button type="button" data-action="global-report" data-owner-pub="${this._escAttr(
                                          r.ownerPub
                                      )}" data-universe-id="${this._escAttr(
                                          r.universeId
                                      )}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-amber-50 dark:bg-amber-950/25 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-950 dark:text-amber-100 border border-amber-200 dark:border-amber-800">${this._escText(
                                          ui.sourcesGlobalReport || 'Report'
                                      )} ⚠</button>`
                            }
                            ${
                                legalDefensePending
                                    ? `<button type="button" data-action="global-legal-defense" data-owner-pub="${this._escAttr(
                                          r.ownerPub
                                      )}" data-universe-id="${this._escAttr(
                                          r.universeId
                                      )}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-slate-900 dark:bg-white text-white dark:text-slate-900 border border-slate-900 dark:border-white hover:opacity-95">${this._escText(
                                          ui.sourcesGlobalLegalDefenseButton || 'Respond to legal dispute (owner)'
                                      )}</button>`
                                    : ''
                            }
                            <button type="button" data-action="remove-source" data-id="${this._escAttr(
                                s?.id
                            )}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60 hover:bg-rose-50 dark:hover:bg-rose-900/20">${this._escText(
                                ui.sourceRemove || 'Remove'
                            )}</button>
                        </div>
                    </div>`
                    : ''
            }
        </div>`;
    }

    _renderItemInternet(ui, r, { localInfo = null } = {}) {
        const openLbl = this._escAttr(ui.sourcesGlobalOpenTree || ui.sourceLoad);
        const voteUpLbl = this._escAttr(ui.sourcesGlobalVoteUp || ui.sourcesGlobalVote);
        const reportLbl = this._escAttr(ui.sourcesGlobalReport);
        const installLbl = this._escAttr(ui.sourcesGlobalInstall || ui.sourcesInstall);
        const editOwnLbl = this._escAttr(ui.sourcesGlobalEditOwnTree || ui.navConstruct || 'Edit');
        const removeLbl = this._escAttr(ui.sourcesGlobalRemove || ui.sourceRemove);
        const by = r?.ownerPub ? `Anon-${String(r.ownerPub).slice(0, 6)}` : '';
        const author = String(r?.authorName || '').trim();
        const desc = String(r?.description || '').trim();
        const st = this._computeDirectoryRowState(r);
        const ownerPub = st.ownerPub;
        const isReported = st.isReported;
        const m = this._getRowMetrics(r);
        const votes = Number.isFinite(Number(m?.votes)) ? Number(m.votes) : null;
        const liked = (() => {
            try {
                const pair = store.getNetworkUserPair?.();
                const pub = String(pair?.pub || '').trim();
                if (pub) {
                    const lsKey = this._voteKey(st.ownerPub, st.universeId, pub);
                    return this._lsGet(lsKey) === '1';
                }
                const fallback = this._voteKeyFallback(st.ownerPub, st.universeId);
                return this._lsGet(fallback) === '1';
            } catch {
                return false;
            }
        })();
        const isOwner = (() => {
            try {
                return !!(ownerPub && store.getNostrPublisherPair?.(ownerPub)?.priv);
            } catch {
                return false;
            }
        })();
        const latestLegalAt = String(st.legalLatestAt || '').trim();
        const defenseAt = String(st.legalOwnerDefenseLatestAt || '').trim();
        const hasLegal = (Number(st.legal90Unique) || 0) > 0;
        const legalDefensePending =
            isOwner && hasLegal && latestLegalAt && (!defenseAt || defenseAt < latestLegalAt);
        const ms48 = 48 * 60 * 60 * 1000;
        const legalDeadlineMs = (() => {
            const t = Date.parse(latestLegalAt);
            return Number.isFinite(t) ? t + ms48 : NaN;
        })();
        const legalHoursLeft = (() => {
            if (!Number.isFinite(legalDeadlineMs)) return null;
            const msLeft = Math.max(0, legalDeadlineMs - Date.now());
            return Math.max(1, Math.ceil(msLeft / 3600000));
        })();
        const ownerPill = isOwner
            ? this._renderPill(
                  ui.sourcesPillOwner,
                  'bg-emerald-50 dark:bg-emerald-950/25 text-emerald-900 dark:text-emerald-200 border-emerald-200/70 dark:border-emerald-800/60'
              )
            : '';
        const communityEntry = (() => {
            try {
                const url = formatNostrTreeUrl(st.ownerPub, st.universeId);
                const comm = store.value.communitySources || [];
                return comm.find((s) => String(s?.url || '') === String(url)) || null;
            } catch {
                return null;
            }
        })();
        const isCommunityInstalled = !!communityEntry;
        const primaryLbl = isOwner ? editOwnLbl : isCommunityInstalled ? removeLbl : installLbl;
        const statusPills = [
            isReported
                ? this._renderPill(
                      ui.sourcesGlobalReportedPill || 'Reported',
                      'bg-amber-50 dark:bg-amber-950/25 text-amber-950 dark:text-amber-100 border-amber-200 dark:border-amber-800'
                  )
                : ''
            ,
            (Number(st.legal90Unique) || 0) > 0
                ? this._renderPill(
                      ui.sourcesGlobalDisputePill || 'Dispute',
                      'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                  )
                : ''
            ,
            (() => {
                try {
                    const ref = store.getActivePublicTreeRef?.();
                    if (!ref) return '';
                    if (String(ref.pub) !== String(st.ownerPub) || String(ref.universeId) !== String(st.universeId)) return '';
                    const seeds = store.state.nostrLiveSeeds;
                    const lbl = ui.treeNetworkHealthSeedsLabel || 'Seeds';
                    return this._renderPill(
                        `${lbl}: ${seeds == null ? '—' : String(seeds)}`,
                        'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                    );
                } catch {
                    return '';
                }
            })()
        ]
            .filter(Boolean)
            .join('');

        const key = `internet:${String(r?.ownerPub || '')}/${String(r?.universeId || '')}`;
        const open = !!(key && this._rowActionsOpen && this._rowActionsOpen.has(key));
        const localActions = localInfo?.id
            ? `<div class="flex flex-wrap gap-2">
                    <button type="button" data-action="tree-info" data-id="${this._escAttr(
                        localInfo.id
                    )}" data-name="${this._escAttr(localInfo.name || '')}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">${this._escText(
                        ui.treesViewTreeInfoButton || ui.treeInfoModalTitle || 'Tree information'
                    )}</button>
                    <button type="button" data-action="export-local" data-id="${this._escAttr(
                        localInfo.id
                    )}" data-name="${this._escAttr(localInfo.name || '')}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/30">${this._escText(
                        ui.sourceExport || 'Export'
                    )}</button>
                </div>`
            : '';

        return `<div class="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex flex-wrap gap-2 items-center">
                        <button type="button" data-action="global-open" data-owner-pub="${this._escAttr(
                            r?.ownerPub
                        )}" data-universe-id="${this._escAttr(
            r?.universeId
        )}" data-share-code="${this._escAttr(
            r?.shareCode || ''
        )}"${isOwner ? ' data-edit-own="1"' : ''} class="p-0 m-0 bg-transparent border-0 cursor-pointer text-left text-sm font-black text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 hover:underline">🌍 ${this._escText(
                            r?.title
                        )}</button>
                        ${this._renderPill(
                            ui.sourcesPillInternet || 'Internet',
                            'bg-sky-50 dark:bg-sky-950/25 text-sky-900 dark:text-sky-200 border-sky-200/70 dark:border-sky-800/60'
                        )}
                        ${ownerPill}
                        ${
                            r?.shareCode
                                ? this._renderPill(
                                      `#${r.shareCode}`,
                                      'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                                  )
                                : ''
                        }
                    </div>
                    <p class="m-0 mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-semibold">${this._escText(
                        ui.sourcesGlobalBy || 'by'
                    )} ${this._escText(author || by)}</p>
                    ${
                        desc
                            ? `<p class="m-0 mt-2 text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-3">${this._escText(
                                  desc
                              )}</p>`
                            : ''
                    }
                    ${
                        isReported
                            ? `<p class="m-0 mt-2 text-[10px] text-slate-500 dark:text-slate-400 leading-snug">${
                                  this._escText(
                                      ui.sourcesGlobalHiddenHint ||
                                          'Community signals hide this listing from the public directory; only you (the owner) see it here.'
                                  )
                              }</p>`
                            : ''
                    }
                    ${
                        legalDefensePending
                            ? `<p class="m-0 mt-2 text-[10px] text-amber-900 dark:text-amber-100/90 leading-snug font-semibold">${this._escText(
                                  (st.legalAfter48h
                                      ? ui.sourcesLegalDisputeOwnerAfter48h ||
                                        'More than 48 hours since the legal notice without your signed owner response. The listing stays off the public directory; sign below to record your position.'
                                      : (ui.sourcesLegalDisputeOwnerBefore48h ||
                                            'Legal claim: others do not see this listing in the directory until it is resolved. About {hours} hour(s) left to submit your signed owner response under ⋯.'
                                        ).replace(/\{hours\}/g, String(legalHoursLeft ?? '48'))
                                  ) || ''
                              )}</p>`
                            : ''
                    }
                </div>
                <div class="flex gap-2 shrink-0 items-center">
                    <button type="button" data-action="global-vote" data-vote="up" data-owner-pub="${this._escAttr(
                        r?.ownerPub
                    )}" data-universe-id="${this._escAttr(
            r?.universeId
        )}" class="w-9 h-9 flex items-center justify-center rounded-xl border transition-colors ${
            liked
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm dark:bg-emerald-600 dark:border-emerald-500 dark:text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.97]'
        }" aria-label="${this._escAttr(voteUpLbl)}">
                        ${
                            liked
                                ? `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" class="block">
                                    <path fill="currentColor" d="M1 21h4V9H1v12zm22-11.5c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.82 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73V9.5z"/>
                                  </svg>`
                                : `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" class="block">
                                    <path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" d="M1 21h4V9H1v12zm22-11.5c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.82 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73V9.5z"/>
                                  </svg>`
                        }
                    </button>
                    <span class="min-h-10 px-3 py-2 rounded-xl text-sm font-black bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 border border-slate-200 dark:border-slate-700 tabular-nums" aria-label="${this._escAttr(
                        ui.sourcesGlobalVote || ui.sourcesGlobalVoteUp
                    )}">${String(votes == null ? 0 : Math.max(0, votes))}</span>
                    <button type="button" data-action="toggle-row-actions" data-key="${this._escAttr(
                        key
                    )}" class="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors text-sm font-black" aria-expanded="${open ? 'true' : 'false'}" aria-label="${this._escAttr(
                        ui.navMore || ui.more
                    )}">⋯</button>
                    ${
                        isOwner
                            ? `<button type="button" data-action="global-open" data-edit-own="1" data-owner-pub="${this._escAttr(
                                  r?.ownerPub
                              )}" data-universe-id="${this._escAttr(
                                  r?.universeId
                              )}" data-share-code="${this._escAttr(
                                  r?.shareCode || ''
                              )}" class="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm">${this._escText(
                                  primaryLbl
                              )}</button>`
                            : isCommunityInstalled
                              ? `<button type="button" data-action="remove-source" data-id="${this._escAttr(
                                    communityEntry?.id
                                )}" class="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white shadow-sm">${this._escText(
                                    primaryLbl
                                )}</button>`
                              : `<button type="button" data-action="install-source" data-owner-pub="${this._escAttr(
                                    r?.ownerPub
                                )}" data-universe-id="${this._escAttr(
                                    r?.universeId
                                )}" class="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm">${this._escText(
                                    primaryLbl
                                )}</button>`
                    }
                </div>
            </div>
            ${
                open
                    ? `<div class="mt-3 space-y-2">
                        ${statusPills ? `<div class="flex flex-wrap gap-2 items-center">${statusPills}</div>` : ''}
                        ${localActions}
                        <div class="flex flex-wrap gap-2">
                            ${
                                isOwner
                                    ? ''
                                    : `<button type="button" data-action="global-report" data-owner-pub="${this._escAttr(
                                          r?.ownerPub
                                      )}" data-universe-id="${this._escAttr(
                                          r?.universeId
                                      )}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-amber-50 dark:bg-amber-950/25 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-950 dark:text-amber-100 border border-amber-200 dark:border-amber-800">${this._escText(
                                          reportLbl
                                      )} ⚠</button>`
                            }
                            ${
                                legalDefensePending
                                    ? `<button type="button" data-action="global-legal-defense" data-owner-pub="${this._escAttr(
                                          r?.ownerPub
                                      )}" data-universe-id="${this._escAttr(
                                          r?.universeId
                                      )}" class="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-slate-900 dark:bg-white text-white dark:text-slate-900 border border-slate-900 dark:border-white hover:opacity-95">${this._escText(
                                          ui.sourcesGlobalLegalDefenseButton || 'Respond to legal dispute (owner)'
                                      )}</button>`
                                    : ''
                            }
                        </div>
                    </div>`
                    : ''
            }
        </div>`;
    }

    _renderUnifiedAddLink(ui) {
        return `<div class="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
            <label class="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">${this._escText(
                ui.sourcesOneLinkLabel || 'Add a tree'
            )}</label>
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-snug">${this._escText(
                ui.sourcesOneLinkHint || 'Type library, a share code, or paste the full link—the app figures it out.'
            )}</p>
            <div class="flex gap-2">
                <input id="inp-tree-link" type="text" autocomplete="off" placeholder="${this._escAttr(
                    ui.sourcesOneLinkPlaceholder || 'library'
                )}" class="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-purple-500 dark:text-white">
                <button type="button" data-action="add-tree-link" class="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-xl font-bold shadow-md active:scale-95 transition-transform text-lg shrink-0" title="${this._escAttr(
                    ui.sourceAdd || 'Add'
                )}">+</button>
            </div>
        </div>`;
    }

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
    }

    _scheduleGlobalDirectoryFetch({ reason = 'input' } = {}) {
        if (this._globalDirTimer) clearTimeout(this._globalDirTimer);
        const delay = reason === 'render' ? 0 : 260;
        this._globalDirTimer = setTimeout(() => {
            void this._runGlobalDirectoryFetch();
        }, delay);
    }

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
    }

    /** Re-ranks directory rows using already-loaded metrics (e.g. after 👍 without new fetches). */
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
    }

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
    }

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
    }

    /** Hide × and ← while dismiss without a tree is blocked (avoid looking like valid close). */
    _syncSourcesDismissChrome() {
        const blocked = store.isSourcesDismissBlocked();
        const shell = this.querySelector('.arborito-sources-modal-shell');
        if (!shell) return;
        const apply = (btn) => {
            if (blocked) {
                btn.hidden = true;
                btn.setAttribute('aria-hidden', 'true');
                btn.style.setProperty('display', 'none', 'important');
                btn.style.setProperty('visibility', 'hidden', 'important');
                btn.style.setProperty('pointer-events', 'none', 'important');
            } else {
                btn.hidden = false;
                btn.removeAttribute('aria-hidden');
                btn.style.removeProperty('display');
                btn.style.removeProperty('visibility');
                btn.style.removeProperty('pointer-events');
            }
        };
        shell.querySelectorAll('.arborito-modal-window-x').forEach(apply);
        shell.querySelectorAll('button.arborito-mmenu-back').forEach(apply);
        shell.querySelectorAll('.arborito-float-modal-head .btn-close, .arborito-sheet__hero .btn-close').forEach(apply);
    }

    /** Toques fiables en el overlay “plantar” + Enter; no apilar listeners al reutilizar el mismo DOM. */
    _wirePlantOverlay(container) {
        const inp = container.querySelector('#inp-new-tree-name');
        const btnCancel = container.querySelector('[data-action="cancel-overlay"]');
        const btnOk = container.querySelector('[data-action="confirm-plant"]');
        if (inp) {
            inp.value = this._overlayPlantNameDraft || '';
            inp.addEventListener('input', () => {
                this._overlayPlantNameDraft = inp.value;
            });
            inp.addEventListener('keydown', (ev) => {
                if (ev.key !== 'Enter') return;
                ev.preventDefault();
                this._overlayPlantNameDraft = inp.value || '';
                const n = (inp.value || this._overlayPlantNameDraft || '').trim();
                void plantNewTree(this, n);
            });
        }
        const stopBubble = (ev) => {
            if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
        };
        if (btnCancel) {
            bindMobileTap(btnCancel, (ev) => {
                stopBubble(ev);
                this.overlay = null;
                this.targetId = null;
                this._overlayPlantNameDraft = '';
                this.updateContent();
            });
        }
        if (btnOk) {
            bindMobileTap(btnOk, async (ev) => {
                stopBubble(ev);
                if (inp) this._overlayPlantNameDraft = inp.value || this._overlayPlantNameDraft || '';
                const n = (inp?.value || this._overlayPlantNameDraft || '').trim();
                await plantNewTree(this, n);
            });
        }
        setTimeout(() => {
            if (inp) inp.focus();
        }, 50);
    }

    _wireDeleteOverlay(container) {
        const btnCancel = container.querySelector('[data-action="cancel-overlay"]');
        const btnDel = container.querySelector('[data-action="confirm-delete"]');
        const stopBubble = (ev) => {
            if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
        };
        if (btnCancel) {
            bindMobileTap(btnCancel, (ev) => {
                stopBubble(ev);
                this.overlay = null;
                this.targetId = null;
                this.updateContent();
            });
        }
        if (btnDel) {
            bindMobileTap(btnDel, (ev) => {
                stopBubble(ev);
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
            });
        }
    }

    /** Compact ℹ️ next to export / active / delete (only when curriculum is in memory). */
    treeInfoIconButtonHtml(ui, state) {
        if (!state.data || !state.rawGraphData) return '';
        const titleRaw = ui.treesViewTreeInfoButton || ui.treeInfoModalTitle || 'Tree information';
        const title = escapeHtmlAttr(titleRaw);
        return `<button type="button" data-action="tree-info" class="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-lg leading-none text-slate-600 dark:text-emerald-300 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors hover:border-emerald-300 shrink-0" title="${title}" aria-label="${title}">ℹ️</button>`;
    }

    renderOverlay(ui) {
        const container = this.querySelector('#overlay-container');
        if (!this.overlay) {
            container.className = 'absolute inset-0 z-[200] hidden pointer-events-none';
            container.innerHTML = '';
            this._overlayPlantNameDraft = '';
            return;
        }

        const wasHidden = container.classList.contains('hidden');
        let rebuilt = false;

        container.classList.remove('hidden');

        if (this.overlay === 'plant') {
            const keep =
                container.querySelector('[data-action="confirm-plant"]') &&
                container.querySelector('#inp-new-tree-name');
            if (!keep) {
                const ph = escapeHtmlAttr(ui.treeNamePlaceholder || 'Name your tree...');
                const val = escapeHtmlAttr(this._overlayPlantNameDraft || '');
                container.innerHTML = `
                <div class="w-full max-w-xs text-center px-2">
                    <h3 class="text-xl font-black mb-4 dark:text-white">${ui.plantTree}</h3>
                    <input id="inp-new-tree-name" type="text" placeholder="${ph}" value="${val}" autocomplete="off" class="w-full bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-4 text-base font-bold mb-4 focus:ring-2 focus:ring-green-500 outline-none dark:text-white" autofocus>
                    <div class="flex gap-3">
                        <button type="button" data-action="cancel-overlay" class="flex-1 py-3 min-h-[44px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs uppercase">${ui.cancel}</button>
                        <button type="button" data-action="confirm-plant" class="flex-1 py-3 min-h-[44px] bg-green-600 text-white rounded-xl font-bold text-xs uppercase shadow-lg hover:scale-105 transition-transform active:scale-[0.98]">${ui.sourceAdd}</button>
                    </div>
                </div>`;
                this._wirePlantOverlay(container);
                rebuilt = true;
            }
        } else if (this.overlay === 'delete') {
            const keep = container.querySelector('[data-action="confirm-delete"]');
            if (!keep) {
                container.innerHTML = `
                <div class="w-full max-w-xs text-center px-2">
                    <div class="text-4xl mb-4">⚠️</div>
                    <h3 class="text-xl font-black mb-2 dark:text-white">${ui.deleteTreeConfirm}</h3>
                    <div class="flex gap-3">
                        <button type="button" data-action="cancel-overlay" class="flex-1 py-3 min-h-[44px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs uppercase">${ui.cancel}</button>
                        <button type="button" data-action="confirm-delete" class="flex-1 py-3 min-h-[44px] bg-red-600 text-white rounded-xl font-bold text-xs uppercase shadow-lg hover:scale-105 transition-transform active:scale-[0.98]">${ui.sourceRemove}</button>
                    </div>
                </div>`;
                this._wireDeleteOverlay(container);
                rebuilt = true;
            }
        }

        const overlayBase =
            'absolute inset-0 bg-white/95 dark:bg-slate-900/95 flex items-center justify-center z-[200] rounded-3xl pointer-events-auto';
        const anim = wasHidden || rebuilt ? ' animate-in fade-in' : '';
        container.className = overlayBase + anim;
    }

    getGlobalContent(ui, state, activeSource, opts = {}) {
        const { includeActiveTreeSection = true } = opts || {};
        const escHtml = (s) =>
            String(s ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        const escAttr = (s) => escHtml(s);

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
                    <div class="absolute top-0 right-0 bg-purple-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-widest shadow-sm">
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
                                    class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500 appearance-none transition-shadow hover:shadow-sm cursor-pointer pr-10"
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
            ${filterBtn('used7', ui.sourcesGlobalFilterUsed7d || 'Most used (7 days)')}
            ${filterBtn('recent', ui.sourcesGlobalFilterRecent || 'Recent')}
            ${filterBtn('active', ui.sourcesGlobalFilterActiveNow || 'Trees active now')}
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
        const authorLabel = (pub) => {
            const p = String(pub || '');
            return p ? `Anon-${p.slice(0, 6)}` : '';
        };
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
            const metaPill = `<span class="text-[10px] font-black tracking-wide text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-2.5 py-1">${escHtml(metaLbl)}: ${escHtml(meta)}</span>`;
            const voteUpLbl = escAttr(ui.sourcesGlobalVoteUp || ui.sourcesGlobalVote);
            const voteDownLbl = escAttr(ui.sourcesGlobalVoteDown);
            const reportLbl = escAttr(ui.sourcesGlobalReport);
            const by = authorLabel(r.ownerPub);
            const score = Number.isFinite(Number(m.reportScore)) ? Number(m.reportScore) : null;
            const thr = this._reportHideThreshold();
            const isReported = score != null && score >= thr;
            const reportedPill = isReported
                ? `<span class="text-[10px] font-black tracking-wide text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/35 border border-amber-300/60 dark:border-amber-800/60 rounded-full px-2.5 py-1">${escHtml(ui.sourcesGlobalReportedPill || 'Reported')}</span>`
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
                        <div class="mt-2 flex flex-wrap gap-2 items-center">${metaPill}${r.shareCode ? `<span class="text-[10px] font-black tracking-wide text-purple-700 dark:text-purple-200 bg-purple-50 dark:bg-purple-900/25 border border-purple-200/60 dark:border-purple-800/60 rounded-full px-2.5 py-1">#${escHtml(r.shareCode)}</span>` : ''}${reportedPill}</div>
                    </div>
                    <div class="flex flex-col gap-2 shrink-0">
                        <button type="button" data-action="global-open" data-owner-pub="${escAttr(r.ownerPub)}" data-universe-id="${escAttr(r.universeId)}" data-share-code="${escAttr(r.shareCode || '')}"${primaryOpenEditOwn} class="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm">${primaryOpenText}</button>
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
            ? `<div class="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 text-xs font-bold text-slate-600 dark:text-slate-300">${escHtml(ui.sourcesGlobalSearching || 'Searching…')}</div>`
            : err
            ? `<div class="p-4 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs font-bold text-amber-900 dark:text-amber-200">${escHtml(err)}</div>`
            : filteredRows.length
            ? `<div class="space-y-3">${filteredRows.map(rowHtml).join('')}</div>`
            : `<div class="p-6 rounded-2xl border-2 border-dashed border-slate-100 dark:border-slate-800 text-center text-slate-400 text-sm">${escHtml(ui.sourcesGlobalNoMatches || 'No matches yet. Try a different search.')}</div>`;

        const legacyPartialBanner =
            !loading && !err && this._globalDirHitCap
                ? `<div class="mt-3 p-3 rounded-xl border border-sky-200/80 dark:border-sky-900/60 bg-sky-50/90 dark:bg-sky-950/25 text-[11px] leading-snug text-sky-950 dark:text-sky-100">
                        <p class="m-0 font-black">${escHtml(ui.sourcesGlobalPartialTitle || 'Partial directory listing')}</p>
                        <p class="m-0 mt-1 font-semibold">${escHtml(
                            ui.sourcesGlobalPartialBody ||
                                'We only load a limited batch per query (the network is huge). Try more specific keywords, use a share code, or check again later.'
                        )}</p>
                   </div>`
                : '';

        const legacyTorrentLag = usesGlobalDirectoryPointerForTorrent()
            ? `<p class="m-0 mt-2 text-[11px] text-amber-900 dark:text-amber-100/90 leading-snug rounded-lg border border-amber-200/70 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/25 px-3 py-2">${escHtml(
                  ui.sourcesGlobalTorrentIndexLagHint ||
                      'Optional torrent mirror: the public list updates on a schedule, so very new trees may appear there after a short delay. Live network metadata is usually ahead.'
              )}</p>`
            : '';

        return `
            <div class="pt-2">
                ${activeTreeSection}

                <!-- GLOBAL DIRECTORY SEARCH (Nostr; metadata only) -->
                <div class="block mb-8">
                    <div class="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/30">
                        <h3 class="m-0 text-sm font-black text-slate-800 dark:text-white">${globalSearchTitle}</h3>
                        <p class="m-0 mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">${globalSearchHint}</p>
                        ${legacyTorrentLag}
                        <div class="mt-4 flex gap-2 items-stretch">
                            <input id="inp-global-tree-search" type="search" autocomplete="off" value="${qVal}" placeholder="${qPh}" class="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-500 dark:text-white min-h-[44px]" />
                            <button type="button" data-action="global-refresh" class="min-h-[44px] px-4 py-3 rounded-xl font-black text-sm bg-slate-900 dark:bg-white text-white dark:text-slate-900">↻</button>
                        </div>
                        ${filterRow}
                        ${legacyPartialBanner}
                        <div class="mt-4">${resultsHtml}</div>
                    </div>
                </div>

                <!-- SAVED TREES LIST -->
                <div class="block">
                    
                    ${otherSources.length === 0 
                        ? `<div class="p-8 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl text-center text-slate-400 text-sm">${ui.sourcesNoCommunity || 'No other trees yet.'}</div>`
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
                                        <button type="button" data-action="remove-source" data-id="${escAttr(s.id)}" class="w-9 h-9 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 rounded-xl transition-colors text-sm" aria-label="${escAttr(ui.sourceRemove || 'Remove')}">🗑️</button>
                                    </div>
                                </div>
                            `).join('')}
                           </div>`
                    }
                </div>

                <!-- One field: Arborito detects share codes, public links, and HTTPS automatically -->
                <div class="pt-6 border-t border-slate-100 dark:border-slate-800 mt-4">
                    <label class="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">${escHtml(ui.sourcesOneLinkLabel || 'Add a tree')}</label>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-snug">${escHtml(ui.sourcesOneLinkHint || 'Type library, a share code, or paste the full link—the app figures it out. Official names are resolved on this device only.')}</p>
                    ${quickPickHtml}
                    ${ui.sourcesAliasPrivacyNote ? `<p class="text-[10px] text-slate-400 dark:text-slate-500 mb-2 leading-snug">${escHtml(ui.sourcesAliasPrivacyNote)}</p>` : ''}
                    <div class="flex gap-2">
                        <input id="inp-tree-link" type="text" autocomplete="off" placeholder="${escAttr(ui.sourcesOneLinkPlaceholder || 'library')}" class="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-purple-500 dark:text-white">
                        <button type="button" data-action="add-tree-link" class="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-xl font-bold shadow-md active:scale-95 transition-transform text-lg shrink-0" title="${escAttr(ui.sourceAdd || 'Add')}">+</button>
                    </div>
                </div>
            </div>`;
    }

    getLocalContent(ui, state, activeSource) {
        const escHtml = (s) =>
            String(s ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        const escAttr = (s) => escHtml(s);

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
                        ? `<div class="text-center p-6 text-slate-400 text-sm border-2 border-slate-100 dark:border-slate-800 rounded-2xl border-dashed">${escHtml(ui.sourcesLocalEmpty || 'Your garden is empty. Plant your first tree.')}</div>` 
                        : localTrees.map(t => {
                            const isActive = !!(activeSource && activeSource.id === t.id);
                            return `
                            <div class="bg-white dark:bg-slate-900 border ${isActive ? 'border-green-500 ring-1 ring-green-500 shadow-md' : 'border-slate-200 dark:border-slate-700'} rounded-2xl p-4 flex items-center justify-between group hover:border-green-300 dark:hover:border-green-700 transition-all">
                                <div class="flex items-center gap-4 min-w-0">
                                    <div class="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center text-xl shadow-sm">🌳</div>
                                    <div class="min-w-0">
                                        <h4 class="font-bold text-slate-800 dark:text-white truncate text-sm">${escHtml(t.name)}</h4>
                                        <p class="text-[11px] text-slate-400 font-mono mt-0.5">${escHtml(ui.sourcesUpdated || 'Updated')}: ${new Date(t.updated).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div class="flex gap-2 shrink-0 items-center">
                                    <button type="button" data-action="tree-info" data-id="${escAttr(t.id)}" data-name="${escAttr(t.name)}" class="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-lg leading-none text-slate-600 dark:text-emerald-300 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors hover:border-emerald-300 shrink-0" title="${escAttr(ui.treesViewTreeInfoButton || ui.treeInfoModalTitle || 'Tree information')}" aria-label="${escAttr(ui.treesViewTreeInfoButton || ui.treeInfoModalTitle || 'Tree information')}">ℹ️</button>
                                    <button data-action="export-local" data-id="${escAttr(t.id)}" data-name="${escAttr(t.name)}" class="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-600 dark:text-blue-300 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-2 hover:border-blue-300" title="${escAttr(ui.sourceExport)}">
                                        <span>📤</span>
                                    </button>
                                    
                                    ${isActive 
                                        ? `<span class="px-4 py-2 bg-green-100 text-green-700 text-xs font-black rounded-xl border border-green-200 cursor-default uppercase tracking-wider">${escHtml(ui.sourceActive)}</span>`
                                        : `<button data-action="load-local" data-id="${escAttr(t.id)}" data-name="${escAttr(t.name)}" class="px-6 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow hover:opacity-90 transition-opacity uppercase tracking-wider">${escHtml(ui.sourceLoad)}</button>`
                                    }
                                    
                                    <button type="button" data-action="show-delete" data-id="${escAttr(t.id)}" class="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors ml-1 text-sm" title="${escAttr(ui.sourceRemove)}" aria-label="${escAttr(ui.sourceRemove)}">🗑️</button>
                                </div>
                            </div>
                            `;
                        }).join('')
                    }
                </div>
            </div>`;
    }

    // --- EVENT HANDLERS ---
    handleDelegatedChange(e) {
        if (e.target.id === 'version-select') {
            this.selectedVersionUrl = e.target.value;
            // Switch version immediately on pick; avoids an extra “Apply” button.
            if (typeof this.selectedVersionUrl === 'string' && this.selectedVersionUrl) {
                handleSwitch(this);
            } else {
                this.updateContent();
            }
        }
    }

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
            if (!ownerPub || !universeId) return;
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
            this._overlayPlantNameDraft = '';
            this.updateContent();
        }
        if (action === 'show-plant') {
            this._overlayPlantNameDraft = '';
            this.overlay = 'plant';
            this.updateContent();
        }
        if (action === 'show-delete') {
            this.overlay = 'delete';
            this.targetId = id;
            this.updateContent();
        }

        if (action === 'confirm-plant') {
            const inp = this.querySelector('#inp-new-tree-name');
            if (inp) this._overlayPlantNameDraft = inp.value || this._overlayPlantNameDraft || '';
            const n = (inp?.value || this._overlayPlantNameDraft || '').trim();
            await plantNewTree(this, n);
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
            const ok = await store.loadAndSmartMerge(cid);
            if (ok) this.close({ returnToMore: false });
            return;
        }
        if (action === 'remove-source') {
            const ui = store.ui;
            if (await store.confirm(ui.sourcesDeleteTreeLinkConfirm || 'Delete this tree link?')) {
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
            const allowed = new Set(['discover', 'active', 'recent', 'used7', 'voted']);
            const next = String(btn.dataset.filter || '').trim();
            this._globalDirFilter = allowed.has(next) ? next : 'discover';
            void this._applyGlobalDirectorySortAndMetrics();
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

        // (No micropay/boost.)
        if (action === 'import-tree') importTreeFromFile(this);
        if (action === 'load-local') loadLocalTree(this, id, name);
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
    }
}
customElements.define('arborito-modal-sources', ArboritoModalSources);
