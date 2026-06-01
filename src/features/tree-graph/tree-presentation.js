import { store } from '../../core/store.js';
import { fileSystem } from '../backup-export/filesystem.js';
import { parseNostrTreeUrl } from '../nostr/nostr-refs.js';
import { safeStripeSupportUrl } from '../../shared/lib/stripe-support-url.js';
import {
    anonOwnerLabel,
    currentOnlineAccountUsername,
    forumDisplayNameForPub,
    resolveOpenTreeOwnerDisplay
} from './tree-owner-display.js';
import { escHtml as esc } from '../../shared/lib/html-escape.js';

/**
 * Tree description, creator credit, support-the-creator link — desktop + mobile graph chrome.
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
        if (!this.hasAttribute('data-arbor-tour')) {
            this.setAttribute('data-arbor-tour', 'con-info');
        }
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

    _editableCourseFormHtml(ui, desc, _authorName, _authorAbout, supportInputValue, actionsRowConstruct, opts = {}) {
        const ccLead = opts.ccBanner ? this._ccLicenseBannerHtml(ui) : '';
        /* Explicit colors: mobile graph inherits light text and reset uses inherit on inputs.
         * Author free-text + bio are no longer collected here — the creator's forum identity
         * (Nostr pubkey resolved to sync-login username) is the single source of truth, shown read-only
         * in the footer of the card. Saves auto-populate `authorName` from the local identity. */
        const field =
            'w-full text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400';
        const fieldMono = `${field} font-mono`;
        const pubLim =
            typeof store.getPublicationMetadataLimits === 'function'
                ? store.getPublicationMetadataLimits()
                : { authorMin: 2, descriptionMin: 5 };
        const minHintLine = (n) =>
            esc(String(ui.treeMetaMinCharsHint || 'Minimum {n} characters (required).').replace(/\{n\}/g, String(n)));
        const creatorRow = this._creatorRowHtml(ui);
        return `<div class="space-y-2 text-slate-800 dark:text-slate-100">
                ${ccLead ? `<div class="arborito-tree-pres-cc-wrap">${ccLead}</div>` : ''}
                <label class="arborito-eyebrow arborito-eyebrow--strong block">${esc(
                    ui.treeMetaDescription || 'Description'
                )} <span class="text-rose-600 dark:text-rose-300" title="${esc(
                    ui.publishMissingDescription || ''
                )}">*</span></label>
                <p class="text-[9px] font-bold text-slate-500 dark:text-slate-400 m-0 -mt-0.5">${minHintLine(pubLim.descriptionMin)}</p>
                <textarea id="tree-pres-desc" rows="3" class="${field}" placeholder="${esc(ui.treeMetaDescriptionPh || '')}">${esc(desc)}</textarea>
                <label class="arborito-eyebrow arborito-eyebrow--strong block">${esc(
                    ui.treeMetaSupportUrl || 'Support-the-creator link'
                )}</label>
                <input id="tree-pres-support" type="url" inputmode="url" class="${fieldMono}" value="${esc(
                    supportInputValue
                )}" placeholder="https://buy.stripe.com/…" autocomplete="off" />
                <p class="text-[10px] text-slate-600 dark:text-slate-400 leading-snug pt-0.5">${esc(
                    ui.treeMetaSupportStripeHint ||
                        'Only Stripe Payment Links (https://buy.stripe.com/…) are accepted, so the link always points to Stripe checkout.'
                )}</p>
                <button type="button" id="tree-pres-save" disabled class="w-full py-2 rounded-xl bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-black text-xs transition-transform active:scale-[0.98] disabled:opacity-100 disabled:cursor-not-allowed">${esc(
                    ui.treeMetaSave || 'Save tree info'
                )}</button>
                ${creatorRow}
                ${actionsRowConstruct}
            </div>`;
    }

    /**
     * Compact "Created by …" row used by the construction editor only (reader view was removed).
     * Resolves identities from forum/auth/Nostr, not from free-text fields, so the card never
     * shows stale or impersonated author metadata. With no resolvable identity we surface a hint
     * so the user understands why the save button stays disabled (must sign in first).
     */
    _creatorRowHtml(ui) {
        const ids = this._collectTreeIdentities();
        if (!ids.owner) {
            return `<p class="arborito-tree-pres-creator-hint">${esc(
                ui.treeMetaCreatorMissingHint ||
                    'Sign in with your online account (Profile) so the tree card shows you as the creator.'
            )}</p>`;
        }
        const ownerLabel = esc(ids.owner.label);
        const ownerSub = ids.owner.sub ? `<span class="arborito-tree-pres-creator__sub">${esc(ids.owner.sub)}</span>` : '';
        const collabCount = ids.collaborators.length;
        const collabBtn = collabCount
            ? `<button type="button" class="arborito-tree-pres-creator__collab" data-arbor-collab-toggle="1" aria-haspopup="dialog">${esc(
                  String(ui.treeMetaCollaboratorsCount || '+{n} collaborators').replace(/\{n\}/g, String(collabCount))
              )}</button>`
            : '';
        return `<div class="arborito-tree-pres-creator" data-arbor-creator-row>
                <span class="arborito-tree-pres-creator__label">${esc(
                    ui.treeMetaCreatorLabel || 'Created by'
                )}</span>
                <span class="arborito-tree-pres-creator__name">${ownerLabel}</span>
                ${ownerSub}
                ${collabBtn}
            </div>`;
    }

    /**
     * Resolve owner + collaborator identities for the current tree.
     * For Nostr trees: owner = `treeRef.pub`, collaborators = `editor` roles in `treeCollaboratorRoles`.
     * For local trees: owner = currently signed-in user (best-effort). No collaborators.
     * Resolution priority: published `authorName` → forum name → Anon-XXXXXX / truncated pubkey.
     * Returns `{ owner: {pub, label, sub, role}, collaborators: [...] }` or `{ owner: null, collaborators: [] }`.
     */
    _collectTreeIdentities() {
        const v = store.value;
        const ui = store.ui;
        const treeRef = parseNostrTreeUrl((v.activeSource && v.activeSource.url) || '');
        const out = { owner: null, collaborators: [] };

        const labelForCollaborator = (pub) => {
            const p = String(pub || '');
            if (!p) return { label: '', sub: '' };
            const forumName = forumDisplayNameForPub(store, p);
            const short = `${p.slice(0, 6)}…${p.slice(-4)}`;
            if (forumName) return { label: forumName, sub: short };
            return { label: anonOwnerLabel(p), sub: short };
        };

        if (treeRef) {
            const ownerInfo = resolveOpenTreeOwnerDisplay(store, treeRef.pub);
            out.owner = {
                pub: treeRef.pub,
                label: ownerInfo.label || (ui.treeMetaCollaboratorOwner || 'Owner'),
                sub: ownerInfo.sub,
                role: ui.treeMetaCollaboratorOwner || 'Owner'
            };
            const roles = (v && v.treeCollaboratorRoles) || {};
            for (const pub of Object.keys(roles)) {
                if (pub === treeRef.pub) continue;
                const r = roles[pub];
                if (r !== 'editor' && r !== 'proposer') continue;
                const info = labelForCollaborator(pub);
                out.collaborators.push({
                    pub,
                    label: info.label || anonOwnerLabel(pub),
                    sub: info.sub,
                    role: r === 'editor'
                        ? (ui.treeMetaCollaboratorEditor || 'Editor')
                        : (ui.treeMetaCollaboratorProposer || 'Proposes changes')
                });
            }
        } else {
            const ownerInfo = resolveOpenTreeOwnerDisplay(store, '');
            if (ownerInfo.label) {
                out.owner = {
                    pub: '',
                    label: ownerInfo.label,
                    sub: '',
                    role: ui.treeMetaCollaboratorOwner || 'Owner'
                };
            }
        }
        return out;
    }

    /**
     * Single source of truth for the metadata save button (used by both the desktop card and the
     * mobile compact sheet). We deliberately do NOT collect free-text author / about anymore; the
     * `authorName` saved on the tree is derived from the local identity so it stays in sync with
     * the forum username — the user cannot type a fake name in the public metadata anymore.
     */
    _wireSaveButton(saveBtn, baselineSrc) {
        const ui = store.ui;
        const descEl = this.querySelector('#tree-pres-desc');
        const supportEl = this.querySelector('#tree-pres-support');

        const identityName = this._currentIdentityNameForSave(baselineSrc.authorName);
        const baseline = {
            description: String(baselineSrc.desc || '').trim(),
            authorName: String(baselineSrc.authorName || '').trim(),
            authorAbout: String(baselineSrc.authorAbout || '').trim(),
            supportUrl: String(baselineSrc.supportInputValue || '').trim()
        };

        const getNext = () => {
            const rawSupport = String((supportEl && supportEl.value) != null ? supportEl.value : '').trim();
            const normalized = rawSupport ? safeStripeSupportUrl(rawSupport) || '' : '';
            return {
                description: String((descEl && descEl.value) != null ? descEl.value : '').trim(),
                /* `authorName` is no longer user-typed: use the resolved local identity. We keep
                 * the previous stored value if no identity is available (e.g. anon session) so
                 * the publish-required check still works against pre-authored trees that already
                 * carry an `authorName` from a previous edit session. */
                authorName: identityName || baseline.authorName,
                authorAbout: baseline.authorAbout,
                supportUrl: rawSupport,
                supportNormalized: normalized
            };
        };

        const isDirty = (n) =>
            n.description !== baseline.description ||
            n.authorName !== baseline.authorName ||
            n.supportUrl !== baseline.supportUrl;

        const pubLim =
            typeof store.getPublicationMetadataLimits === 'function'
                ? store.getPublicationMetadataLimits()
                : { authorMin: 2, descriptionMin: 5 };
        const meetsPublishReqs = (n) =>
            n.authorName.length >= pubLim.authorMin && n.description.length >= pubLim.descriptionMin;

        const enabledCls =
            'w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-xs transition-transform active:scale-[0.98]';
        const disabledCls =
            'w-full py-2 rounded-xl bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-black text-xs transition-transform active:scale-[0.98] disabled:opacity-100 disabled:cursor-not-allowed';

        const syncEnabled = () => {
            const next = getNext();
            const enable = isDirty(next) && meetsPublishReqs(next);
            saveBtn.disabled = !enable;
            saveBtn.className = enable ? enabledCls : disabledCls;
        };

        [descEl, supportEl].forEach((el) => {
            if (!el) return;
            el.addEventListener('input', syncEnabled, { passive: true });
            el.addEventListener('change', syncEnabled, { passive: true });
        });
        syncEnabled();

        saveBtn.onclick = () => {
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
                syncEnabled();
                return;
            }
            if (next.supportUrl.trim() && !next.supportNormalized) {
                store.notify(
                    ui.treeSupportStripeInvalid ||
                        'Use a Stripe payment link (https://buy.stripe.com/…).',
                    true
                );
                return;
            }
            store.updateUniversePresentation({
                description: next.description,
                authorName: next.authorName,
                authorAbout: next.authorAbout,
                supportUrl: next.supportNormalized
            });
            store.notify(ui.treeMetaSaved || 'Saved.');
        };
    }

    /** Pick the name we persist as `authorName` on save. Prefers the online account username. */
    _currentIdentityNameForSave(previousAuthorName) {
        const session = currentOnlineAccountUsername(store);
        if (session) return session;
        return String(previousAuthorName || '').trim();
    }

    /** Wire the "+N collaborators" pill: opens a small dialog listing owner + collaborators. */
    _wireCollaboratorList(ui) {
        const btn = this.querySelector('[data-arbor-collab-toggle]');
        if (!btn) return;
        btn.onclick = (e) => {
            if (e && e.preventDefault) e.preventDefault();
            if (e && e.stopPropagation) e.stopPropagation();
            const ids = this._collectTreeIdentities();
            if (!ids.owner) return;
            const renderRow = (p) => `<li class="arborito-tree-pres-collab-item">
                <span class="arborito-tree-pres-collab-item__name">${esc(p.label)}</span>
                ${p.sub ? `<span class="arborito-tree-pres-collab-item__sub">${esc(p.sub)}</span>` : ''}
                <span class="arborito-tree-pres-collab-item__role">${esc(p.role)}</span>
            </li>`;
            const html = `<ul class="arborito-tree-pres-collab-list">
                ${renderRow(ids.owner)}
                ${ids.collaborators.map(renderRow).join('')}
            </ul>`;
            store.showDialog({
                type: 'alert',
                title: ui.treeMetaCollaboratorsListTitle || 'People who edit this tree',
                body: html,
                bodyHtml: true,
                confirmText: ui.treeMetaCollaboratorsClose || ui.close || 'Close'
            });
        };
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
        /* The "About this tree" card is a construction-time editor only. Every reader-mode path
         * (embed in modal, slim card on the graph, "Report tree" footer, languages/creator row,
         * seeds line) was deprecated: that information already lives in the Trees picker and the
         * graph chrome, so duplicating it here was just noise. We hide the host element until
         * the user enters construction mode. */
        const hideAndReturn = (key) => {
            if (this._lastPresKey === key) {
                this.className = 'hidden';
                this._syncMobilePresClearance();
                return;
            }
            this._lastPresKey = key;
            this.innerHTML = '';
            this.className = 'hidden';
            this._syncMobilePresClearance();
        };
        if (!v.constructionMode) {
            hideAndReturn('hide:reader');
            return;
        }
        if (v.selectedNode || v.previewNode) {
            hideAndReturn('hide:node');
            return;
        }
        const raw = v.rawGraphData;
        if (!raw) {
            hideAndReturn('hide:nodata');
            return;
        }
        const pres = raw.universePresentation && typeof raw.universePresentation === 'object' ? raw.universePresentation : {};
        const desc = String(pres.description || '').trim();
        const authorName = String(pres.authorName || '').trim();
        const authorAbout = String(pres.authorAbout || '').trim();
        const supportRaw = String(pres.supportUrl || '').trim();
        const supportUrl = safeStripeSupportUrl(supportRaw);
        const supportInputValue = supportUrl || supportRaw;
        const canEdit =
            fileSystem.features.canWrite &&
            (!!fileSystem.isLocal || !!parseNostrTreeUrl((v.activeSource && v.activeSource.url) || ''));
        if (!canEdit) {
            hideAndReturn('hide:noedit');
            return;
        }
        const actionsRowConstruct = '';

        if (!this._isMobileConstructionFlowSlot()) {
            this._mobileCourseSheetOpen = false;
        }

        const useMobileFlowCompact = this._isMobileConstructionFlowSlot();
        const stableKey = JSON.stringify({
            mflow: useMobileFlowCompact,
            sheet: useMobileFlowCompact ? this._mobileCourseSheetOpen : false,
            localSrc: fileSystem.isLocal,
            desc,
            authorName,
            authorAbout,
            supportUrl,
            supportInputValue,
            lang: v.lang,
        });
        if (stableKey === this._lastPresKey && !this.classList.contains('hidden')) {
            requestAnimationFrame(() => this._syncMobilePresClearance());
            return;
        }
        this._lastPresKey = stableKey;

        this.className =
            'arborito-tree-presentation rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/90 shadow-lg backdrop-blur-sm text-left max-w-xl w-full mx-auto text-sm text-slate-800 dark:text-slate-100';

        if (useMobileFlowCompact) {
            this.className =
                'arborito-tree-presentation arborito-tree-pres--flow-compact rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/90 shadow-md text-left w-full max-w-xl mx-auto text-sm text-slate-800 dark:text-slate-100';
            const presTitle = esc(ui.treePresentationTitle || 'About this tree');
            const hint = esc(
                ui.treePresMobileCompactHint || 'Public summary & support link — tap to edit'
            );
            const closeLb = esc(ui.close || 'Close');
            const backLb = esc(ui.navBack || ui.close || 'Back');
            const sheetInner = this._editableCourseFormHtml(
                ui,
                desc,
                authorName,
                authorAbout,
                supportInputValue,
                '',
                { ccBanner: false }
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

            this.innerHTML = `<div class="arborito-tree-pres-compact">
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
                this._wireSaveButton(saveM, { desc, authorName, authorAbout, supportInputValue });
            }
            this._wireCollaboratorList(ui);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => this._syncMobilePresClearance());
            });
            return;
        }

        const editPanel = this._editableCourseFormHtml(
            ui,
            desc,
            authorName,
            authorAbout,
            supportInputValue,
            actionsRowConstruct
        );

        this.innerHTML = `
            <div class="p-3 sm:p-4">
                <h2 class="arborito-eyebrow arborito-eyebrow--md mb-2">${esc(ui.treePresentationTitle || 'About this tree')}</h2>
                ${editPanel}
            </div>
        `;

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
            this._wireSaveButton(save, { desc, authorName, authorAbout, supportInputValue });
        }
        this._wireCollaboratorList(ui);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => this._syncMobilePresClearance());
        });
        } finally {
            this._syncConstructionCourseSheetChromeClass();
        }
    }
}

customElements.define('arborito-tree-presentation', ArboritoTreePresentation);
