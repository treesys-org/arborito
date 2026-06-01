
import { store } from '../../../core/store.js';
import { listKnownAliasKeys } from '../tree-aliases.js';
import { handleSwitch, plantNewTree, importTreeFromFile, loadLocalTree, exportLocalTree, shareActiveTree } from './sources-logic.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { bindMobileTap, bindCloseTaps } from '../../../shared/ui/mobile-tap.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { calloutHtml } from '../../../shared/ui/callout.js';
import { formatNostrTreeUrl, parseNostrTreeUrl } from '../../nostr/nostr-refs.js';
import { DIRECTORY_CLIENT_FETCH_LIMIT, SOURCES_UNIFIED_DISPLAY_CAP } from '../../p2p-webtorrent/directory-index-config.js';
import {
    loadGlobalDirectoryRowsFromHttp,
    loadGlobalDirectoryRowsFromTorrent,
    mergeNostrAndTorrentDirectoryRows,
    usesGlobalDirectoryPointerForTorrent
} from '../../p2p-webtorrent/global-directory-torrent.js';
import { sourcesActionDispatchMethods } from './sources-action-dispatch-mixin.js';
import { canonicalNetworkTreeUrlString, escapeHtmlAttr, escapeHtmlText } from './sources-helpers.js';
import { sourcesRenderItemsMethods } from './sources-render-items-mixin.js';
import { sourcesUnifiedRenderMethods } from './sources-unified-render-mixin.js';
import { sourcesGlobalDirectoryMethods } from './sources-global-directory-mixin.js';

/** Normalize `nostr://…` to dedupe rows (local publish vs saved source). */


class ArboritoModalSources extends HTMLElement {
    constructor() {
        super();
        /* `activeTab` is the focus hint sent to ourselves when a tree-info / sources
         * round-trip closes (`sources-action-dispatch-mixin` reads it for the
         * `sourcesFocusTab` payload). The modal itself is single-pane now, so this
         * almost always stays at 'local'. */
        this.activeTab = 'local';
        this.selectedVersionUrl = null;
        this.overlay = null; // 'delete' | 'import' (plant uses dedicated store.prompt() dialog)
        this.targetId = null; // ID for delete
        this.isInitialized = false;
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
        /** Content language filter: '*' = global (default), or a curriculum code (e.g. 'EN'). */
        this._sourcesLangFilter = '*';
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
        const k = 'arborito-nostr-user-first-seen';
        const raw = this._lsGet(k);
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
        if (!this.isInitialized) {
            this.renderSkeleton();
            this.isInitialized = true;
        }
        
        this.updateContent();

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
                document.querySelector('arborito-sidebar')?.closeMobileMenuIfOpen?.();
            }
            return;
        }
        /* Onboarding-skip path: the user clicked "Continue without account"
         * which opened Sources with `fromOnboarding` set. The explicit close
         * (back arrow / X / outside tap) returns them to the session-choice
         * step instead of stranding them on a blank canvas. Bypasses the
         * "no tree" dismiss block because going back to onboarding is a
         * valid escape — the wizard will eventually push them forward
         * again.
         *
         * IMPORTANT: only honour the redirect on a "user-initiated" close.
         * Tree load / plant / import all call `close({ returnToMore: false })`
         * which means the user committed to a tree; in that case we do NOT
         * want to bounce them back to onboarding — they should land on the
         * canvas of the tree they just loaded. */
        const cur = store.value && store.value.modal;
        const fromOnb = cur && typeof cur === 'object' && cur.fromOnboarding;
        const userBack = opts.returnToMore !== false;
        if (fromOnb && userBack) {
            const hint = typeof fromOnb === 'object' ? fromOnb : {};
            const payload = { type: 'onboarding' };
            if (Number(hint.step) === 2) payload.step = 2;
            if (hint.view) payload.view = hint.view;
            store.setModal(payload);
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
        const curM = store.value && store.value.modal;
        const fromOnb = curM && typeof curM === 'object' && !!curM.fromOnboarding;
        /* When sources is opened from the onboarding flow we want an explicit
         * back affordance on every viewport: users asked to be able to go back
         * to the tree picker during onboarding (and only there). On desktop the
         * default chrome only renders an × close — and × reads as "discard"
         * rather than "go back" — so we inject a leading ← chip with the
         * `.btn-close` class so the existing close handler runs and the
         * `fromOnboarding` bounce in `close()` sends the user back to the
         * wizard. We disable `showBack` to avoid the default mobile back
         * chevron stacking next to ours. */
        const onbBackHtml = fromOnb
            ? `<button type="button" class="btn-close arborito-mmenu-back shrink-0" aria-label="${ui.onboardingBack || ui.navBack || 'Back'}" title="${ui.onboardingBack || ui.navBack || 'Back'}">←</button>`
            : '';
        /* Header pinned to `mobile: true` so the drill family — Sources / Tree-info /
         * Tree-report / Readme — share *exactly* the same hero on every viewport.
         * Back/close still respect the real viewport (← on mobile, × on desktop):
         * that swap lives inside `modalHeroHtml`. */
        const heroRow = embedded
            ? ''
            : modalHeroHtml(ui, {
                  mobile: true,
                  title: ui.sourceManagerTitle,
                  subtitle: ui.sourceManagerDesc,
                  showClose: !mobSources,
                  showBack: fromOnb ? false : undefined,
                  leadingIcon: onbBackHtml,
              });

        const shellStyle = embedded ? 'height:100%;max-height:100%;min-height:0;' : '';
        /* Panel chrome comes from .arborito-float-modal-card — do not duplicate shadow/border utilities here.
           Sources keeps arborito-sources-modal-shell for child styling and isolate for internal overlays. */
        /* Background tokens:
         * - Light: keep the soft `emerald-50` (looks great on bright theme).
         * - Dark:  switched from `emerald-950` (read as overly vivid against
         *          rows tinted in their own emerald accents) to a neutral
         *          slate so the green only appears in pills / active
         *          indicators, where it actually carries meaning. */
        const shellClass = embedded
            ? 'arborito-sources-modal-shell arborito-sources-modal-shell--embed bg-emerald-50 dark:bg-slate-900 w-full relative flex flex-col min-h-0 flex-1 border-0 shadow-none cursor-auto isolate overflow-hidden'
            : mobSources
              ? 'arborito-sources-modal-shell bg-emerald-50 dark:bg-slate-900 w-full h-full min-h-0 relative flex flex-col border-0 shadow-none cursor-auto isolate overflow-hidden'
              : 'arborito-sources-modal-shell arborito-float-modal-card bg-emerald-50 dark:bg-slate-900 relative flex flex-col cursor-auto isolate';

        const inner = `
            <div class="${shellClass}" style="${shellStyle || undefined}">
                ${heroRow}

                <div id="tab-content" class="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-4 pb-4 pt-3 min-h-0 pr-1 relative z-0">
                </div>
                <div id="overlay-container" class="absolute inset-0 z-[200] hidden pointer-events-none"></div>
            </div>`;

        const m = store.value.modal;
        const instantBackdrop =
            !embedded &&
            (store.isSourcesDismissBlocked() ||
                (m &&
                    typeof m === 'object' &&
                    m.fromConstructionMore &&
                    shouldShowMobileUI()));

        if (embedded) {
            this.innerHTML = `<div class="arborito-sources-embed-root flex flex-col flex-1 min-h-0 w-full h-full min-w-0 overflow-hidden">${inner}</div>`;
        } else {
            /* Sources keeps its own panel skeleton (`arborito-sources-modal-shell` with
             * isolate + isolation). The shell helper renders the backdrop / scrim /
             * enter animation; the panel is the `inner` block above. */
            this.innerHTML = modalShellHtml({
                bodyHtml: inner,
                layout: mobSources ? 'dock' : 'centered',
                mobile: mobSources,
                instantOpen: instantBackdrop,
                bareBackdrop: true,
            });
        }

        bindCloseTaps(this, () => this.close());

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
        const htmlChanged = this._lastUnifiedHtml !== nextHtml;
        if (htmlChanged) {
            container.innerHTML = nextHtml;
            this._lastUnifiedHtml = nextHtml;
        }
        /* Race fix (mobile install button): `bindMobileTap` keeps `touchStartX/Y`
         * in a per-listener closure. If we dispose+rebind between `touchstart` and
         * `touchend` (e.g. directory metrics update fires `state-change` during the
         * tap), the new listener sees `touchStartX=0`, calculates an absurd delta,
         * decides "this is a scroll, not a tap" and silently drops the click — users
         * then report "trees won't install on tap". Only rebind when the DOM was
         * actually replaced. */
        if (htmlChanged) {
            this._wireTabContentActionButtons(container);
            this._wireGlobalDirectoryControls(container);
        }
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

    /** Directory fetch spinner: toggles `visibility` (keeps the layout box) so the
     * Filters button next to it never reflows. Toggling `display:none` instead would
     * make the filters row visibly shake on every keystroke. */
    _syncSourcesDirLoadingVisibility() {
        const el = this.querySelector('#arborito-sources-dir-loading');
        if (!el) return;
        const on = !!this._globalDirLoading;
        el.classList.toggle('invisible', !on);
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


    _renderPill(txt, cls) {
        return `<span class="arborito-pill arborito-pill--chip border ${cls}">${this._escText(
            txt
        )}</span>`;
    }


    /** Re-ranks directory rows using already-loaded metrics (e.g. after 👍 without new fetches). */


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

    /* Plant flow uses the shared `store.prompt()` dialog (a top-level modal with proven
     * mobile keyboard handling), so there is no plant overlay to wire here. The old in-modal
     * overlay broke virtual-keyboard activation on iOS / Android Chrome because the focused
     * `<input>` sat inside a re-renderable absolute layer behind several `pointer-events: none`
     * parents — a classic source of "tap but no keyboard" bugs. */
    async _promptForTreeNameAndPlant() {
        const ui = store.ui;
        /* `store.prompt()` pushes the Sources modal onto an internal stack and re-opens it after
         * the dialog resolves, so cancelling restores the user where they were. */
        let answer = null;
        try {
            answer = await store.prompt(
                ui.plantTreeDesc || 'Name your new tree.',
                ui.treeNamePlaceholder || 'Name your tree...',
                ui.plantTree || 'Plant a tree'
            );
        } catch (err) {
            console.error('plant prompt failed', err);
            return;
        }
        if (answer == null) return; // cancelled
        const trimmed = String(answer).trim();
        if (!trimmed) {
            store.notify(ui.treeNameRequired || 'Please enter a tree name.', true);
            return;
        }
        await plantNewTree(this, trimmed, null);
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
        return `<button type="button" data-action="tree-info" class="arborito-icon-btn arborito-icon-btn--sm" title="${title}" aria-label="${title}">ℹ️</button>`;
    }

    renderOverlay(ui) {
        const container = this.querySelector('#overlay-container');
        if (!this.overlay) {
            container.className = 'absolute inset-0 z-[200] hidden pointer-events-none';
            container.innerHTML = '';
            return;
        }

        const wasHidden = container.classList.contains('hidden');
        let rebuilt = false;

        container.classList.remove('hidden');

        if (this.overlay === 'delete') {
            const keep = container.querySelector('[data-action="confirm-delete"]');
            if (!keep) {
                container.innerHTML = `
                <div class="w-full max-w-xs text-center px-2">
                    <div class="text-4xl mb-4">⚠️</div>
                    <h3 class="text-xl font-black mb-2 dark:text-white">${ui.deleteTreeConfirm}</h3>
                    <div class="arborito-action-row">
                        <button type="button" data-action="cancel-overlay" class="arborito-cta-slate py-3 min-h-[44px] rounded-xl font-bold text-xs uppercase">${ui.cancel}</button>
                        <button type="button" data-action="confirm-delete" class="arborito-cta-rose py-3 min-h-[44px] rounded-xl font-bold text-xs uppercase shadow-lg hover:scale-105 transition-transform active:scale-[0.98]">${ui.sourceRemove}</button>
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

}
Object.assign(ArboritoModalSources.prototype, sourcesActionDispatchMethods);
Object.assign(ArboritoModalSources.prototype, sourcesRenderItemsMethods);
Object.assign(ArboritoModalSources.prototype, sourcesUnifiedRenderMethods);
Object.assign(ArboritoModalSources.prototype, sourcesGlobalDirectoryMethods);
customElements.define('arborito-modal-sources', ArboritoModalSources);
