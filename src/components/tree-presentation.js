import { store } from '../store.js';
import { fileSystem } from '../services/filesystem.js';
import { parseNostrTreeUrl } from '../services/nostr-refs.js';
import { safeStripeDonationUrl } from '../utils/stripe-donation-url.js';
import { bindMobileTap } from '../utils/mobile-tap.js';

function esc(s) {
    return String(s != null ? s : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Tree description, author blurb, donation link — desktop + mobile graph chrome.
 */
class ArboritoTreePresentation extends HTMLElement {
    constructor() {
        super();
        this._lastPresKey = null;
        this._presRenderQueued = false;
        this._presResizeObs = null;
        /** Mobile construction (scroll slot): “About” form on bottom sheet, not card on trunk */
        this._mobileCourseSheetOpen = false;
        this._onViewport = () => this._syncMobilePresClearance();
        this._onDocKeydown = (e) => {
            if (e.key !== 'Escape' || !this._mobileCourseSheetOpen) return;
            if (!this.isConnected || !this.closest('#arborito-tree-pres-flow-slot')) return;
            this._mobileCourseSheetOpen = false;
            this._lastPresKey = null;
            this.render();
        };
        this._onStore = () => {
            if (this._presRenderQueued) return;
            this._presRenderQueued = true;
            queueMicrotask(() => {
                this._presRenderQueued = false;
                this.render();
            });
        };
    }

    connectedCallback() {
        store.addEventListener('state-change', this._onStore);
        this._onCcBannerClick = (e) => {
            const btn = e.target && e.target.closest && e.target.closest('.arborito-tree-pres-cc-notice--btn');
            if (!btn || !this.contains(btn)) return;
            e.preventDefault();
            e.stopPropagation();
            store.openAuthorLicenseOverlay({ fromTreePresentation: true });
        };
        this.addEventListener('click', this._onCcBannerClick);
        if (typeof window !== 'undefined') {
            window.addEventListener('arborito-viewport', this._onViewport);
            document.addEventListener('keydown', this._onDocKeydown, true);
        }
        this._setupMobilePresClearanceObserver();
        this.render();
    }

    disconnectedCallback() {
        store.removeEventListener('state-change', this._onStore);
        if (this._onCcBannerClick) {
            this.removeEventListener('click', this._onCcBannerClick);
            this._onCcBannerClick = null;
        }
        if (typeof window !== 'undefined') {
            window.removeEventListener('arborito-viewport', this._onViewport);
            document.removeEventListener('keydown', this._onDocKeydown, true);
        }
        this._teardownMobilePresClearanceObserver();
        document.documentElement.classList.remove('arborito-tree-pres-course-sheet-open');
    }

    /** Reserve space under the card on mobile trunk (so HOME panel does not cover fields). */
    _setupMobilePresClearanceObserver() {
        if (typeof ResizeObserver === 'undefined' || this._presResizeObs) return;
        this._presResizeObs = new ResizeObserver(() => this._syncMobilePresClearance());
        this._presResizeObs.observe(this);
    }

    _teardownMobilePresClearanceObserver() {
        if (this._presResizeObs) {
            this._presResizeObs.disconnect();
            this._presResizeObs = null;
        }
        if (typeof document !== 'undefined') {
            document.documentElement.style.removeProperty('--arbor-mobile-pres-clearance');
        }
    }

    /** Called from graph when moving this component between anchor and scroll slot. */
    syncMobilePresClearanceFromHost() {
        this._syncMobilePresClearance();
    }

    _isMobileConstructionFlowSlot() {
        if (typeof document === 'undefined') return false;
        const root = document.documentElement;
        return (
            !root.classList.contains('arborito-desktop') &&
            root.classList.contains('arborito-construction-mobile') &&
            !!this.closest('#arborito-tree-pres-flow-slot')
        );
    }

    /** Lifts graph above dock while “About” sheet is open (full-screen backdrop). */
    _syncConstructionCourseSheetChromeClass() {
        if (typeof document === 'undefined') return;
        const v = store.value;
        const inFlow =
            this.isConnected &&
            !this.classList.contains('hidden') &&
            this._isMobileConstructionFlowSlot() &&
            !(v.selectedNode || v.previewNode) &&
            !!v.rawGraphData;
        const open = !!(inFlow && this._mobileCourseSheetOpen);
        document.documentElement.classList.toggle('arborito-tree-pres-course-sheet-open', open);
    }

    /** CC BY-SA notice above tree (explore and construction). Click opens license reference panel. */
    _ccLicenseBannerHtml(ui) {
        const t = String(ui.treesCcLicenseShort || '').trim();
        if (!t) return '';
        const label = esc(t);
        return `<button type="button" class="arborito-tree-pres-cc-notice arborito-tree-pres-cc-notice--btn" aria-label="${label}">${label}</button>`;
    }

    _editableCourseFormHtml(ui, desc, authorName, authorAbout, donationInputValue, actionsRowConstruct, opts = {}) {
        const ccLead = opts.ccBanner ? this._ccLicenseBannerHtml(ui) : '';
        /* explicit color: mobile graph inherits light text and reset uses inherit on inputs */
        const field =
            'w-full text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400';
        const fieldMono = `${field} font-mono`;
        const pubLim =
            typeof store.getPublicationMetadataLimits === 'function'
                ? store.getPublicationMetadataLimits()
                : { authorMin: 2, descriptionMin: 5 };
        const minHintLine = (n) =>
            esc(String(ui.treeMetaMinCharsHint || 'Minimum {n} characters (required).').replace(/\{n\}/g, String(n)));
        return `<div class="space-y-2 text-slate-800 dark:text-slate-100">
                ${ccLead ? `<div class="arborito-tree-pres-cc-wrap">${ccLead}</div>` : ''}
                <label class="block text-[10px] font-black uppercase text-slate-600 dark:text-slate-300">${esc(
                    ui.treeMetaDescription || 'Description'
                )} <span class="text-rose-600 dark:text-rose-300" title="${esc(
                    ui.publishMissingDescription || ''
                )}">*</span></label>
                <p class="text-[9px] font-bold text-slate-500 dark:text-slate-400 m-0 -mt-0.5">${minHintLine(pubLim.descriptionMin)}</p>
                <textarea id="tree-pres-desc" rows="2" class="${field}" placeholder="${esc(ui.treeMetaDescriptionPh || '')}">${esc(desc)}</textarea>
                <label class="block text-[10px] font-black uppercase text-slate-600 dark:text-slate-300">${esc(
                    ui.treeMetaAuthor || 'Author'
                )} <span class="text-rose-600 dark:text-rose-300" title="${esc(
                    ui.publishMissingAuthor || ''
                )}">*</span></label>
                <p class="text-[9px] font-bold text-slate-500 dark:text-slate-400 m-0 -mt-0.5">${minHintLine(pubLim.authorMin)}</p>
                <input id="tree-pres-author" type="text" class="${field}" value="${esc(authorName)}" placeholder="${esc(ui.treeMetaAuthorPh || '')}" />
                <label class="block text-[10px] font-black uppercase text-slate-600 dark:text-slate-300">${ui.treeMetaAuthorAbout || 'About the author'}</label>
                <textarea id="tree-pres-about" rows="2" class="${field}" placeholder="${esc(ui.treeMetaAuthorAboutPh || '')}">${esc(authorAbout)}</textarea>
                <label class="block text-[10px] font-black uppercase text-slate-600 dark:text-slate-300">${esc(
                    ui.treeMetaDonationUrl || 'Stripe donation link'
                )}</label>
                <input id="tree-pres-donate" type="url" inputmode="url" class="${fieldMono}" value="${esc(
                    donationInputValue
                )}" placeholder="https://buy.stripe.com/…" autocomplete="off" />
                <p class="text-[10px] text-slate-600 dark:text-slate-400 leading-snug pt-0.5">${esc(
                    ui.treeMetaDonationStripeHint ||
                        'Only Stripe Payment Links (buy.stripe.com or donate.stripe.com) are accepted.'
                )}</p>
                <button type="button" id="tree-pres-save" disabled class="w-full py-2 rounded-xl bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-black text-xs transition-transform active:scale-[0.98] disabled:opacity-100 disabled:cursor-not-allowed">${esc(
                    ui.treeMetaSave || 'Save tree info'
                )}</button>
                ${actionsRowConstruct}
            </div>`;
    }

    _syncMobilePresClearance() {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        if (root.classList.contains('arborito-desktop')) {
            root.style.removeProperty('--arbor-mobile-pres-clearance');
            return;
        }
        /* Only the graph chip adjusts trunk; copies in More / sidebar / modal must not touch the global var. */
        if (
            this.closest('#mobile-menu') ||
            this.closest('arborito-sidebar') ||
            this.closest('arborito-modal-tree-info')
        ) {
            return;
        }
        const flowSlot = this.closest('#arborito-tree-pres-flow-slot');
        if (flowSlot) {
            /* Same clearance as floating anchor: slot is absolute and trunk uses this padding. */
            if (!this.isConnected || this.classList.contains('hidden')) {
                root.style.setProperty('--arbor-mobile-pres-clearance', '0px');
                return;
            }
            const h = flowSlot.getBoundingClientRect().height;
            if (!h || h < 2) {
                root.style.setProperty('--arbor-mobile-pres-clearance', '0px');
                return;
            }
            const pad = Math.ceil(h + 14);
            root.style.setProperty('--arbor-mobile-pres-clearance', `${pad}px`);
            return;
        }
        if (!this.isConnected || this.classList.contains('hidden')) {
            root.style.setProperty('--arbor-mobile-pres-clearance', '0px');
            return;
        }
        const h = this.getBoundingClientRect().height;
        if (!h || h < 2) {
            root.style.setProperty('--arbor-mobile-pres-clearance', '0px');
            return;
        }
        const pad = Math.ceil(h + 14);
        root.style.setProperty('--arbor-mobile-pres-clearance', `${pad}px`);
    }

    render() {
        try {
        const v = store.value;
        const ui = store.ui;
        const embedModal = this.hasAttribute('embed-modal');
        const hideReport = this.hasAttribute('hide-report');
        if ((v.selectedNode || v.previewNode) && !embedModal) {
            const key = 'hide:node';
            if (this._lastPresKey === key) {
                this.className = 'hidden';
                this._syncMobilePresClearance();
                return;
            }
            this._lastPresKey = key;
            this.innerHTML = '';
            this.className = 'hidden';
            this._syncMobilePresClearance();
            return;
        }
        const raw = v.rawGraphData;
        if (!raw) {
            const key = 'hide:nodata';
            if (this._lastPresKey === key) {
                this.className = 'hidden';
                this._syncMobilePresClearance();
                return;
            }
            this._lastPresKey = key;
            this.innerHTML = '';
            this.className = 'hidden';
            this._syncMobilePresClearance();
            return;
        }
        const pres = raw.universePresentation && typeof raw.universePresentation === 'object' ? raw.universePresentation : {};
        const desc = String(pres.description || '').trim();
        const authorName = String(pres.authorName || '').trim();
        const authorAbout = String(pres.authorAbout || '').trim();
        const donationRaw = String(pres.donationUrl || '').trim();
        const donationUrl = safeStripeDonationUrl(donationRaw);
        const donationInputValue = donationUrl || donationRaw;
        const canEdit =
            !!v.constructionMode &&
            fileSystem.features.canWrite &&
            (!!fileSystem.isLocal || !!parseNostrTreeUrl((v.activeSource && v.activeSource.url) || ''));

        const hasContent = !!(desc || authorName || authorAbout || donationUrl);
        /** Readers / others’ tree: intro + report. No report in construction or own local garden (`local://`). */
        const showReport = !hideReport && !v.constructionMode && !fileSystem.isLocal;
        const actionsRowReader = showReport
            ? `
            <div class="flex flex-wrap items-center gap-3 pt-3 mt-1 border-t border-slate-100 dark:border-slate-800">
                <button type="button" class="btn-tree-report text-xs font-black uppercase tracking-wide text-amber-700 dark:text-amber-300 hover:underline bg-transparent border-0 p-0 cursor-pointer">${esc(ui.treeReportShort || 'Report tree')}</button>
            </div>`
            : '';
        const actionsRowConstruct = '';

        if (!this._isMobileConstructionFlowSlot()) {
            this._mobileCourseSheetOpen = false;
        }

        const slimReader = !canEdit && !hasContent;
        const useMobileFlowCompact = this._isMobileConstructionFlowSlot() && canEdit && !slimReader;
        const stableKey = JSON.stringify({
            slim: slimReader,
            mflow: useMobileFlowCompact,
            sheet: useMobileFlowCompact ? this._mobileCourseSheetOpen : false,
            canEdit,
            embedModal,
            hideReport,
            localSrc: fileSystem.isLocal,
            showReport,
            desc,
            authorName,
            authorAbout,
            donationUrl,
            donationInputValue,
            cm: v.constructionMode,
            lang: v.lang,
            nostrLiveSeeds: v.nostrLiveSeeds
        });
        if (stableKey === this._lastPresKey && !this.classList.contains('hidden')) {
            requestAnimationFrame(() => this._syncMobilePresClearance());
            return;
        }
        this._lastPresKey = stableKey;

        this.className =
            'arborito-tree-presentation rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/90 shadow-lg backdrop-blur-sm text-left max-w-xl w-full mx-auto text-sm text-slate-800 dark:text-slate-100';

        if (slimReader) {
            const slimHint = embedModal
                ? ui.treePresentationReaderHintEmbed ||
                  ui.treePresentationReaderHint ||
                  'The author has not added information for this tree.'
                : ui.treePresentationReaderHint ||
                  'The author has not added information for this tree.';
            const cc = this._ccLicenseBannerHtml(ui);
            this.innerHTML = `
            <div class="p-3 sm:p-4">
                <h2 class="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">${esc(ui.treePresentationTitle || 'About this tree')}</h2>
                ${cc ? `<div class="arborito-tree-pres-cc-wrap mb-2">${cc}</div>` : ''}
                <p class="text-xs text-slate-500 dark:text-slate-400 mb-1 leading-relaxed">${esc(slimHint)}</p>
                ${actionsRowReader}
            </div>`;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => this._syncMobilePresClearance());
            });
            return;
        }

        if (useMobileFlowCompact) {
            this.className =
                'arborito-tree-presentation arborito-tree-pres--flow-compact rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/90 shadow-md text-left w-full max-w-xl mx-auto text-sm text-slate-800 dark:text-slate-100';
            const presTitle = esc(ui.treePresentationTitle || 'About this tree');
            const hint = esc(
                ui.treePresMobileCompactHint || 'Public summary, author & link — tap to edit'
            );
            const closeLb = esc(ui.close || 'Close');
            const backLb = esc(ui.navBack || ui.close || 'Back');
            const sheetInner = this._editableCourseFormHtml(
                ui,
                desc,
                authorName,
                authorAbout,
                donationInputValue,
                '',
                { ccBanner: true }
            );
            const sheetMarkup = this._mobileCourseSheetOpen
                ? `<div class="arborito-tree-pres-sheet-root" id="tree-pres-sheet-root" role="presentation">
      <button type="button" class="arborito-tree-pres-sheet-backdrop" id="tree-pres-sheet-backdrop" aria-label="${closeLb}"></button>
      <div class="arborito-tree-pres-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="tree-pres-sheet-heading">
        <div class="arborito-tree-pres-sheet-head arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero">
          <div class="arborito-mmenu-toolbar w-full">
            <button type="button" id="tree-pres-sheet-close" class="arborito-mmenu-back shrink-0" aria-label="${backLb}">←</button>
            <h2 id="tree-pres-sheet-heading" class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${presTitle}</h2>
            <span class="w-10 shrink-0" aria-hidden="true"></span>
          </div>
        </div>
        <div class="arborito-tree-pres-sheet-body">
          ${sheetInner}
        </div>
      </div>
    </div>`
                : '';

            const ccMob = this._ccLicenseBannerHtml(ui);
            this.innerHTML = `${
                ccMob ? `<div class="arborito-tree-pres-cc-wrap mb-1.5">${ccMob}</div>` : ''
            }<div class="arborito-tree-pres-compact">
      <button type="button" id="tree-pres-toggle-sheet" class="arborito-tree-pres-compact__btn" aria-expanded="${this._mobileCourseSheetOpen}">
        <span class="arborito-tree-pres-compact__glyph" aria-hidden="true">📋</span>
        <span class="arborito-tree-pres-compact__main">
          <span class="arborito-tree-pres-compact__title">${presTitle}</span>
          <span class="arborito-tree-pres-compact__hint">${hint}</span>
        </span>
        <span class="arborito-tree-pres-compact__chev" aria-hidden="true">${this._mobileCourseSheetOpen ? '▾' : '▸'}</span>
      </button>
    </div>${sheetMarkup}`;

            const toggle = this.querySelector('#tree-pres-toggle-sheet');
            if (toggle) {
                toggle.onclick = () => {
                    this._mobileCourseSheetOpen = !this._mobileCourseSheetOpen;
                    this._lastPresKey = null;
                    this.render();
                };
            }
            const closeSheet = () => {
                this._mobileCourseSheetOpen = false;
                this._lastPresKey = null;
                this.render();
            };
            const bd = this.querySelector('#tree-pres-sheet-backdrop');
            if (bd) bd.onclick = closeSheet;
            const xc = this.querySelector('#tree-pres-sheet-close');
            if (xc) xc.onclick = closeSheet;

            const saveM = this.querySelector('#tree-pres-save');
            if (saveM) {
                const descEl = this.querySelector('#tree-pres-desc');
                const authorEl = this.querySelector('#tree-pres-author');
                const aboutEl = this.querySelector('#tree-pres-about');
                const donateEl = this.querySelector('#tree-pres-donate');

                const baseline = {
                    description: String(desc || '').trim(),
                    authorName: String(authorName || '').trim(),
                    authorAbout: String(authorAbout || '').trim(),
                    donationUrl: String(donationInputValue || '').trim()
                };

                const getNext = () => {
                    const rawDon = String((donateEl && donateEl.value) != null ? donateEl.value : '').trim();
                    const normalized = rawDon ? safeStripeDonationUrl(rawDon) || '' : '';
                    return {
                        description: String((descEl && descEl.value) != null ? descEl.value : '').trim(),
                        authorName: String((authorEl && authorEl.value) != null ? authorEl.value : '').trim(),
                        authorAbout: String((aboutEl && aboutEl.value) != null ? aboutEl.value : '').trim(),
                        donationUrl: rawDon,
                        donationNormalized: normalized
                    };
                };

                const isDirty = (n) =>
                    n.description !== baseline.description ||
                    n.authorName !== baseline.authorName ||
                    n.authorAbout !== baseline.authorAbout ||
                    n.donationUrl !== baseline.donationUrl;

                const pubLim =
                    typeof store.getPublicationMetadataLimits === 'function'
                        ? store.getPublicationMetadataLimits()
                        : { authorMin: 2, descriptionMin: 5 };
                const meetsPublishReqs = (n) =>
                    n.authorName.length >= pubLim.authorMin && n.description.length >= pubLim.descriptionMin;

                const syncSaveEnabled = () => {
                    const next = getNext();
                    const enable = isDirty(next) && meetsPublishReqs(next);
                    saveM.disabled = !enable;
                    saveM.className = enable
                        ? 'w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-xs transition-transform active:scale-[0.98]'
                        : 'w-full py-2 rounded-xl bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-black text-xs transition-transform active:scale-[0.98] disabled:opacity-100 disabled:cursor-not-allowed';
                };

                [descEl, authorEl, aboutEl, donateEl].forEach((el) => {
                    if (!el) return;
                    el.addEventListener('input', syncSaveEnabled, { passive: true });
                    el.addEventListener('change', syncSaveEnabled, { passive: true });
                });
                syncSaveEnabled();

                saveM.onclick = () => {
                    const next = getNext();
                    if (!isDirty(next)) return;
                    if (!meetsPublishReqs(next)) {
                        const tpl =
                            (next.authorName.length < pubLim.authorMin
                                ? ui.publishMissingAuthor
                                : ui.publishMissingDescription) ||
                            (ui.publishMetaRequiredTitle || 'Course details required');
                        const need = next.authorName.length < pubLim.authorMin ? pubLim.authorMin : pubLim.descriptionMin;
                        const msg = String(tpl).includes('{n}') ? String(tpl).replace(/\{n\}/g, String(need)) : tpl;
                        store.notify(msg, true);
                        syncSaveEnabled();
                        return;
                    }
                    if (next.donationUrl.trim() && !next.donationNormalized) {
                        store.notify(
                            ui.treeDonationStripeInvalid ||
                                'Use a Stripe payment link (buy.stripe.com or donate.stripe.com).',
                            true
                        );
                        return;
                    }
                    store.updateUniversePresentation({
                        description: next.description,
                        authorName: next.authorName,
                        authorAbout: next.authorAbout,
                        donationUrl: next.donationNormalized
                    });
                    store.notify(ui.treeMetaSaved || 'Saved.');
                };
            }
            requestAnimationFrame(() => {
                requestAnimationFrame(() => this._syncMobilePresClearance());
            });
            return;
        }

        const donateBtn = donationUrl
            ? `<a href="${esc(donationUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md">${esc(ui.treeDonateCta || 'Support the author')}</a>`
            : '';

        const editPanel = canEdit
            ? this._editableCourseFormHtml(ui, desc, authorName, authorAbout, donationInputValue, actionsRowConstruct)
            : `<div class="space-y-2">
                ${desc ? `<p class="text-slate-600 dark:text-slate-300 leading-snug">${esc(desc).replace(/\n/g, '<br>')}</p>` : ''}
                ${authorName || authorAbout ? `<div class="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
                    ${authorName ? `<p class="font-bold text-slate-800 dark:text-slate-100">${esc(authorName)}</p>` : ''}
                    ${authorAbout ? `<p class="text-xs text-slate-600 dark:text-slate-400 mt-1">${esc(authorAbout).replace(/\n/g, '<br>')}</p>` : ''}
                </div>` : ''}
                ${donateBtn ? `<div class="pt-1">${donateBtn}</div>` : ''}
                ${actionsRowReader}
            </div>`;

        const treeRef = parseNostrTreeUrl((v.activeSource && v.activeSource.url) || '');
        const seedsN = v.nostrLiveSeeds;
        const seedsLine =
            treeRef && seedsN != null && typeof seedsN === 'number'
                ? `<p class="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 mt-1.5 mb-0" title="${esc(
                      ui.treeLiveSeedsHint ||
                          'Approximate number of browsers recently connected to this tree on the network.'
                  )}">🌱 ${esc(
                      (ui.treeLiveSeedsLine || '{n} online').replace('{n}', String(seedsN))
                  )}</p>`
                : ((v.activeSource && v.activeSource.type) === 'local'
                    ? `<p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1.5 mb-0">${esc(
                          (ui.treeLiveSeedsLocalLine ||
                              'Local tree: network “seeds” do not apply here (this device only).').replace('{n}', '0')
                      )}</p>`
                    : '');

        const ccFull = this._ccLicenseBannerHtml(ui);
        this.innerHTML = `
            <div class="p-3 sm:p-4">
                <h2 class="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">${ui.treePresentationTitle || 'About this tree'}</h2>
                ${ccFull ? `<div class="arborito-tree-pres-cc-wrap mb-2">${ccFull}</div>` : ''}
                ${seedsLine}
                ${editPanel}
            </div>
        `;

        // Report: bindMobileTap so taps work reliably on Android (plain onclick can be swallowed on scroll layers).
        this.querySelectorAll('.btn-tree-report').forEach((b) => {
            bindMobileTap(b, (e) => {
                if (e && e.preventDefault) e.preventDefault();
                if (e && e.stopPropagation) e.stopPropagation();
                store.setModal({ type: 'tree-report' });
            });
        });

        // Prevent graph pan/drag handlers from stealing focus when interacting with the course form (desktop).
        // Some browsers may still deliver pointer events to the underlying SVG if a parent layer is non-interactive.
        this.querySelectorAll('input, textarea, select, button, a').forEach((el) => {
            ['pointerdown', 'mousedown', 'touchstart'].forEach((evt) => {
                el.addEventListener(
                    evt,
                    (e) => {
                        e.stopPropagation();
                    },
                    { passive: true }
                );
            });
        });

        const save = this.querySelector('#tree-pres-save');
        if (save) {
            const descEl = this.querySelector('#tree-pres-desc');
            const authorEl = this.querySelector('#tree-pres-author');
            const aboutEl = this.querySelector('#tree-pres-about');
            const donateEl = this.querySelector('#tree-pres-donate');

            const baseline = {
                description: String(desc || '').trim(),
                authorName: String(authorName || '').trim(),
                authorAbout: String(authorAbout || '').trim(),
                donationUrl: String(donationInputValue || '').trim()
            };

            const getNext = () => {
                const rawDon = String((donateEl && donateEl.value) != null ? donateEl.value : '').trim();
                const normalized = rawDon ? safeStripeDonationUrl(rawDon) || '' : '';
                return {
                    description: String((descEl && descEl.value) != null ? descEl.value : '').trim(),
                    authorName: String((authorEl && authorEl.value) != null ? authorEl.value : '').trim(),
                    authorAbout: String((aboutEl && aboutEl.value) != null ? aboutEl.value : '').trim(),
                    donationUrl: rawDon,
                    donationNormalized: normalized
                };
            };

            const isDirty = (n) =>
                n.description !== baseline.description ||
                n.authorName !== baseline.authorName ||
                n.authorAbout !== baseline.authorAbout ||
                n.donationUrl !== baseline.donationUrl;

            const pubLim =
                typeof store.getPublicationMetadataLimits === 'function'
                    ? store.getPublicationMetadataLimits()
                    : { authorMin: 2, descriptionMin: 5 };
            const meetsPublishReqs = (n) =>
                n.authorName.length >= pubLim.authorMin && n.description.length >= pubLim.descriptionMin;

            const syncSaveEnabled = () => {
                const next = getNext();
                const enable = isDirty(next) && meetsPublishReqs(next);
                save.disabled = !enable;
                save.className = enable
                    ? 'w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-xs transition-transform active:scale-[0.98]'
                    : 'w-full py-2 rounded-xl bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-black text-xs transition-transform active:scale-[0.98] disabled:opacity-100 disabled:cursor-not-allowed';
            };

            [descEl, authorEl, aboutEl, donateEl].forEach((el) => {
                if (!el) return;
                el.addEventListener('input', syncSaveEnabled, { passive: true });
                el.addEventListener('change', syncSaveEnabled, { passive: true });
            });
            syncSaveEnabled();

            save.onclick = () => {
                const next = getNext();
                if (!isDirty(next)) return;
                if (!meetsPublishReqs(next)) {
                    const tpl =
                        (next.authorName.length < pubLim.authorMin
                            ? ui.publishMissingAuthor
                            : ui.publishMissingDescription) ||
                        (ui.publishMetaRequiredTitle || 'Course details required');
                    const need = next.authorName.length < pubLim.authorMin ? pubLim.authorMin : pubLim.descriptionMin;
                    const msg = String(tpl).includes('{n}') ? String(tpl).replace(/\{n\}/g, String(need)) : tpl;
                    store.notify(msg, true);
                    syncSaveEnabled();
                    return;
                }
                if (next.donationUrl.trim() && !next.donationNormalized) {
                    store.notify(
                        ui.treeDonationStripeInvalid ||
                            'Use a Stripe payment link (buy.stripe.com or donate.stripe.com).',
                        true
                    );
                    return;
                }
                store.updateUniversePresentation({
                    description: next.description,
                    authorName: next.authorName,
                    authorAbout: next.authorAbout,
                    donationUrl: next.donationNormalized
                });
                store.notify(ui.treeMetaSaved || 'Saved.');
            };
        }
        requestAnimationFrame(() => {
            requestAnimationFrame(() => this._syncMobilePresClearance());
        });
        } finally {
            this._syncConstructionCourseSheetChromeClass();
        }
    }
}

customElements.define('arborito-tree-presentation', ArboritoTreePresentation);
