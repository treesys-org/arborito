import { bindMobileTap } from '../utils/mobile-tap.js';
import { store } from '../store.js';
import { parseNostrTreeUrl } from '../services/nostr-refs.js';
import { shouldShowMobileUI } from '../utils/breakpoints.js';
import { curriculumLangSelectOptionsHtml, bindCurriculumLangSelect } from '../utils/construction-curriculum-lang-select.js';
import { iconLanguageSvg } from './sidebar-utils.js';

/** Short label for dock tabs (same row as Home / Search). */
function shortDockLabel(s) {
    const t = String(s || '').trim();
    if (!t) return '…';
    const first = t.split(/\s+/)[0].replace(/[,;:.)]+$/g, '');
    if (!first) return '…';
    const max = 20;
    return first.length <= max ? first : `${first.slice(0, max - 1)}…`;
}

const MMENU_DRILL_CHEVRON = `<svg class="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/></svg>`;

function conMoreDrillRowHtml(id, glyph, labelEscaped, extraClass = '', attrs = {}) {
    const ex = extraClass ? ` ${extraClass}` : '';
    const extraAttr = [
        attrs.title ? ` title="${attrs.title}"` : '',
        attrs.ariaLabel ? ` aria-label="${attrs.ariaLabel}"` : '',
        attrs.disabled ? ' disabled' : ''
    ].join('');
    return `<button type="button" id="${id}" class="arborito-mmenu-drill-row${ex}" role="menuitem"${extraAttr}>
        <span class="w-9 text-center text-xl shrink-0 leading-none" aria-hidden="true">${glyph}</span>
        <span class="flex-1 min-w-0 text-left">${labelEscaped}</span>
        ${MMENU_DRILL_CHEVRON}
    </button>`;
}

class ArboritoConstructionPanel extends HTMLElement {
    constructor() {
        super();
        this.state = {
            loading: false,
            publishingPublic: false,
            revokingPublic: false
        };
        /** Compact mobile: revert / governance / publish in “More” panel */
        this.moreToolsOpen = false;
        /** Single paint: reopen More after modal without `animate-in` (avoids flicker). */
        this._conMoreInstantReveal = false;
        this.lastRenderKey = null;
        this.isInitialized = false;
    }

    connectedCallback() {
        if (!this.isInitialized) {
            this.renderStructure();
            this.isInitialized = true;
        }

        this._storeListener = () => this.checkRender();
        store.addEventListener('state-change', this._storeListener);
        this._viewportListener = () => {
            this.lastRenderKey = null;
            if (store.value.constructionMode) this.updateView();
        };
        window.addEventListener('arborito-viewport', this._viewportListener);
        this.checkRender();
    }

    disconnectedCallback() {
        if (typeof document !== 'undefined') {
            document.documentElement.classList.remove('arborito-construction-more-open');
        }
        if (this._storeListener) {
            store.removeEventListener('state-change', this._storeListener);
        }
        if (this._viewportListener) {
            window.removeEventListener('arborito-viewport', this._viewportListener);
        }
    }

    /** Syncs global class to hide theme/profile while compact “More” sheet is open. */
    _syncConstructionMoreOpenClass() {
        if (typeof document === 'undefined') return;
        const pop = this.querySelector('#cp-construct-more-pop');
        const open = !!(pop && !pop.hasAttribute('hidden'));
        document.documentElement.classList.toggle('arborito-construction-more-open', open);
    }

    checkRender() {
        const { constructionMode } = store.value;
        if (!constructionMode) {
            if (typeof document !== 'undefined') {
                document.documentElement.classList.remove('arborito-construction-more-open');
            }
            this.style.display = 'none';
            this.classList.remove('construction-panel-host--mob-dock');
            return;
        }
        this.style.display = 'flex';
        this.updateView();
    }

    /** Used by `shell/construction-sync.js` after `constructionMode` changes. */
    syncConstructionFromStore() {
        this.checkRender();
    }

    /**
     * After closing a modal opened from compact More (`fromConstructionMore`), reopen that sheet.
     * @param {{ instant?: boolean }} [opts] — `instant`: no veil enter animation (modal → More transition).
     */
    openConstructionMoreMenu(opts = {}) {
        this.moreToolsOpen = true;
        this.lastRenderKey = null;
        this._conMoreInstantReveal = !!opts.instant;
        this.updateView();
        this._conMoreInstantReveal = false;
    }

    renderStructure() {
        this.className = 'construction-panel-host';

        this.innerHTML = `
            <div class="construction-panel-stack">
                <div id="dock-container" class="construction-panel-sheet" data-construction-dock>
                    <div id="cp-dock-main" class="cp-dock-main"></div>
                </div>
            </div>
        `;
    }

    /** @param {{ fromConstructionMore?: boolean }} [opts] */
    handleRevert(opts = {}) {
        if (opts.fromConstructionMore) {
            store.setModal({ type: 'sources', fromConstructionMore: true });
        } else {
            store.setModal('sources');
        }
    }

    async handleMakeTreePublic() {
        if (this.state.publishingPublic) return;
        this.state.publishingPublic = true;
        this.lastRenderKey = null;
        this.updateView();
        try {
            await store.publishTreePublicInteractive();
        } finally {
            this.state.publishingPublic = false;
            this.lastRenderKey = null;
            this.updateView();
        }
    }

    async handleRetractPublicTree() {
        if (this.state.revokingPublic) return;
        this.state.revokingPublic = true;
        this.lastRenderKey = null;
        this.updateView();
        try {
            // Allow retract even if the editor is still local:// but the tree has a published public tree URL.
            const srcUrl = String((store.value.activeSource && store.value.activeSource.url) || '');
            let localId = null;
            let publicTreeUrl = null;
            if (srcUrl.startsWith('local://')) {
                localId = srcUrl.slice('local://'.length);
                publicTreeUrl =
                    (store.userStore && store.userStore.getLocalTreePublishedNetworkUrl
                        ? store.userStore.getLocalTreePublishedNetworkUrl(localId)
                        : null) || null;
            }
            if (typeof store.revokePublicTreeInteractive === 'function') {
                await store.revokePublicTreeInteractive({ publicTreeUrl, localTreeIdToUnlink: localId });
            } else {
                await store.revokeActivePublicTreeInteractive();
            }
        } finally {
            this.state.revokingPublic = false;
            this.lastRenderKey = null;
            this.updateView();
        }
    }

    updateView() {
        if (!this.isInitialized) return;

        const { activeSource } = store.value;
        const escHtml = (s) =>
            String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        const isLocal = activeSource && (activeSource.type === 'local' || (activeSource.url && activeSource.url.startsWith('local://')));
        const nostrTreeRef = (activeSource && activeSource.url) ? parseNostrTreeUrl(activeSource.url) : null;
        const isPublicTree = !!nostrTreeRef;
        const publishedNetworkUrlForLocal =
            isLocal && (activeSource && activeSource.url) && String(activeSource.url).startsWith('local://')
                ? (store.userStore && store.userStore.getLocalTreePublishedNetworkUrl ? store.userStore.getLocalTreePublishedNetworkUrl(String(activeSource.url).slice('local://'.length)) : null) || null
                : null;
        const publishedNetworkParsed = publishedNetworkUrlForLocal
            ? parseNostrTreeUrl(publishedNetworkUrlForLocal)
            : null;
        const networkRole = typeof store.getMyTreeNetworkRole === 'function' ? store.getMyTreeNetworkRole() : null;
        const isNetworkTreeOwner = !!(
            nostrTreeRef &&
            store.getNostrPublisherPair(nostrTreeRef.pub) &&
            store.getNostrPublisherPair(nostrTreeRef.pub).priv
        );
        const isPublishedLocalTreeOwner = !!(
            publishedNetworkParsed &&
            store.getNostrPublisherPair(publishedNetworkParsed.pub) &&
            store.getNostrPublisherPair(publishedNetworkParsed.pub).priv
        );
        const isContributor =
            isLocal ||
            (isPublicTree && (networkRole === 'owner' || networkRole === 'editor' || networkRole === 'proposer'));

        const localIdForEntry =
            isLocal && (activeSource && activeSource.url) && String(activeSource.url).startsWith('local://')
                ? String(activeSource.url).slice('local://'.length)
                : '';
        const localEntry = (() => {
            if (!localIdForEntry) return null;
            const trees = store.userStore?.state?.localTrees;
            if (!Array.isArray(trees)) return null;
            return trees.find((t) => t && String(t.id) === String(localIdForEntry)) || null;
        })();
        const hasPublishedBaseline = !!(
            (localEntry && localEntry.publishedNetworkUrl) &&
            localEntry &&
            localEntry.publishedSnapshotHash
        );
        const isDraftDirty =
            !!(hasPublishedBaseline && (localEntry && localEntry.draftHash) && (localEntry && localEntry.publishedSnapshotHash)) &&
            String(localEntry.draftHash) !== String(localEntry.publishedSnapshotHash);

        const ui = store.ui;

        const hasTree = !!store.state.rawGraphData;
        const langKeys =
            hasTree && (store.state.rawGraphData && store.state.rawGraphData.languages)
                ? Object.keys(store.state.rawGraphData.languages).sort()
                : [];
        const curriculumEditLang = store.state.curriculumEditLang || '';
        const canRetractPublicTree =
            (typeof store.canRetractActivePublicUniverse === 'function' && store.canRetractActivePublicUniverse()) ||
            isPublishedLocalTreeOwner;
        const constructionUndoDepth =
            typeof store.getConstructionUndoDepth === 'function' ? store.getConstructionUndoDepth() : 0;
        const canUndoCon = constructionUndoDepth > 0;
        const isDesktopForest =
            typeof document !== 'undefined' &&
            document.documentElement.classList.contains('arborito-desktop');
        /** Wide screen: same actions as mobile but on dock row (no “More” sheet). */
        const prefersExpandedConstructionDock =
            isDesktopForest ||
            (typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches);
        const useCompactDock = shouldShowMobileUI() && isContributor && !prefersExpandedConstructionDock;
        if (!useCompactDock) this.moreToolsOpen = false;
        const constructionLangModalOpen = (store.value.modal && store.value.modal.type) === 'construction-curriculum-lang';
        const renderKey = JSON.stringify({
            sourceId: (activeSource && activeSource.id),
            sourceName: (activeSource && activeSource.name),
            isLocal,
            isPublicTree,
            publishedNetworkUrlForLocal,
            hasPublishedBaseline,
            isDraftDirty,
            hasTree,
            langKeys,
            curriculumEditLang,
            uiLang: store.state.lang || '',
            publishingPublic: this.state.publishingPublic,
            revokingPublic: this.state.revokingPublic,
            canRetractPublicTree,
            constructionUndoDepth,
            constructionLangModalOpen,
            moreToolsOpen: this.moreToolsOpen,
            useCompactDock,
            prefersExpandedConstructionDock,
            networkRole,
            isNetworkTreeOwner,
            isPublishedLocalTreeOwner
        });

        if (renderKey === this.lastRenderKey) return;
        this.lastRenderKey = renderKey;

        const showCurriculumTools = isContributor && hasTree && langKeys.length;

        const dockMain = this.querySelector('#cp-dock-main');
        const exitConstructL = ui.navConstructExit || ui.navBack || ui.close || 'Back';
        const constructTitle = ui.navConstruct || 'Construction';
        const revL = ui.conRevertTooltip || ui.conRevertTitle || 'Revert';
        const revDockShort = ui.conRevertTitle || revL;
        const aiL = ui.conAiTooltip || ui.sageArchitectTitle || 'AI';
        const govTooltip = ui.conGovTooltip || ui.adminConsole || 'Governance';
        const govDockLbl = ui.conMoreRowGovernance || govTooltip;
        const republishPub = canRetractPublicTree && isPublicTree;
        const pubL = republishPub
            ? ui.publicTreeRepublishDockTooltip || ui.publicTreeRepublishTitle || ui.publicTreeDockTooltip
            : ui.publicTreeDockTooltip || 'Make tree public';
        const pubShort = republishPub
            ? ui.publicTreeRepublishDockLabel || ui.publicTreeRepublishButton || ui.publicTreeDockLabel
            : ui.publicTreeDockLabel || 'Public';
        const undoL = ui.conUndoTooltip || ui.conUndoAria || 'Undo last map edit';
        const undoShort = ui.conUndoDockLabel || ui.conUndoLabel || 'Undo';
        const retL = ui.revokePublicTreeDockTooltip || 'Retract public tree';
        const retShort = ui.revokePublicTreeDockLabel || 'Retract';
        const langDockL = ui.conLangDockTab || ui.conCurriculumLangLabel || 'Language';
        const versionsDockL = ui.conMoreRowVersions || ui.conOpenVersions || 'Versions';

        const curriculumTabBtn =
            showCurriculumTools ?
                `<button type="button" id="btn-cp-curriculum" class="cp-dock-tab${constructionLangModalOpen ? ' cp-dock-tab--accent' : ''}" title="${escHtml(langDockL)}" aria-label="${escHtml(langDockL)}" aria-expanded="${constructionLangModalOpen}" aria-haspopup="dialog">
                    <span class="cp-dock-tab__curriculum-glyph cp-dock-tab__curriculum-glyph--svg" aria-hidden="true">${iconLanguageSvg({ size: 18, className: 'cp-dock-tab__lang-svg' })}</span>
                    <span class="cp-dock-tab__label">${escHtml(shortDockLabel(langDockL))}</span>
                </button>`
            : '';

        const contributorTabs = [];
        if (isContributor && !useCompactDock) {
            const pubActsAsUnpublish =
                (canRetractPublicTree && isNetworkTreeOwner && isPublicTree) ||
                (!!publishedNetworkParsed && isPublishedLocalTreeOwner);
            // UX: if there's a published baseline for a local tree, the primary action becomes:
            // - Dirty draft -> "Update public" (republish same universe)
            // - Clean -> disabled "Up to date"
            const hasBaseline = hasPublishedBaseline;
            const isUpdate = hasBaseline && isDraftDirty && !pubActsAsUnpublish;
            const isUpToDate = hasBaseline && !isDraftDirty && !pubActsAsUnpublish;

            const pubBtnTitle = pubActsAsUnpublish
                ? retL
                : isUpdate
                    ? (ui.publicTreeUpdateTooltip || ui.publicTreeRepublishDockTooltip || 'Update the public tree')
                    : isUpToDate
                        ? (ui.publicTreeUpToDateTooltip || 'Already up to date')
                        : pubL;
            const pubBtnShort = pubActsAsUnpublish
                ? retShort
                : isUpdate
                    ? (ui.publicTreeUpdateLabel || ui.publicTreeRepublishDockLabel || ui.publicTreeRepublishButton || 'Update public')
                    : isUpToDate
                        ? (ui.publicTreeUpToDateLabel || 'Up to date')
                        : pubShort;
            const pubBtnBusy = pubActsAsUnpublish ? this.state.revokingPublic : this.state.publishingPublic;
            const pubBtnIcon = pubActsAsUnpublish ? '🛑' : (isUpdate ? '🔄' : '🌐');
            contributorTabs.push(`
                <button type="button" id="btn-construction-undo" data-arbor-tour="con-undo" class="cp-dock-tab disabled:opacity-40 disabled:pointer-events-none" title="${escHtml(undoL)}" aria-label="${escHtml(undoL)}" ${canUndoCon ? '' : 'disabled'}>
                    <span class="cp-dock-tab__curriculum-glyph" aria-hidden="true">↶</span>
                    <span class="cp-dock-tab__label">${escHtml(shortDockLabel(undoShort))}</span>
                </button>
                ${curriculumTabBtn}
                <button type="button" id="btn-architect" data-arbor-tour="con-ai" class="cp-dock-tab cp-dock-tab--accent" title="${escHtml(aiL)}" aria-label="${escHtml(aiL)}">
                    <span class="cp-dock-tab__curriculum-glyph" aria-hidden="true">🦉⛑️</span>
                    <span class="cp-dock-tab__label">${escHtml(shortDockLabel(aiL))}</span>
                </button>
                <button type="button" id="btn-governance" data-arbor-tour="con-gov" class="cp-dock-tab cp-dock-tab--blue" title="${escHtml(govTooltip)}" aria-label="${escHtml(govTooltip)}">
                    <span class="cp-dock-tab__curriculum-glyph" aria-hidden="true">🏛️</span>
                    <span class="cp-dock-tab__label">${escHtml(shortDockLabel(govDockLbl))}</span>
                </button>
                ${hasTree && (isLocal || isNetworkTreeOwner) ? `
                <button type="button" id="btn-public-tree" data-arbor-tour="con-publish" class="cp-dock-tab cp-dock-tab--cta ${pubActsAsUnpublish ? 'cp-dock-tab--cta-danger' : 'cp-dock-tab--cta-amber'} disabled:opacity-50 disabled:pointer-events-none" title="${escHtml(pubBtnTitle)}" aria-label="${escHtml(pubBtnTitle)}" ${(pubBtnBusy || isUpToDate) ? 'disabled' : ''}>
                    <span class="cp-dock-tab__curriculum-glyph" aria-hidden="true">${pubBtnBusy ? '⏳' : pubBtnIcon}</span>
                    <span class="cp-dock-tab__label">${pubBtnBusy ? escHtml(ui.conDockBusy || '…') : escHtml(shortDockLabel(pubBtnShort))}</span>
                </button>` : ''}
            `);
        }

        const scrollInner =
            isContributor && !useCompactDock ?
                contributorTabs.join('')
            : !isContributor ?
                `<span class="cp-dock-readonly-hint">${escHtml(ui.treeReadOnlyHint || 'Read-only tree.')}</span>`
            : '';

        if (!dockMain) {
            if (typeof document !== 'undefined') {
                document.documentElement.classList.remove('arborito-construction-more-open');
            }
            return;
        }

        const dockExitlessDesktop = isDesktopForest && !useCompactDock;

        if (useCompactDock && isContributor) {
            this.classList.remove('construction-panel-host--desk-compact-dock');
            this.classList.add('construction-panel-host--mob-dock');
            const moreDockL = ui.conDockMore || 'More';
            const moreDockAria = ui.conDockMoreAria || moreDockL;
            const secCurriculum = ui.conMoreSectionCurriculum || ui.conCurriculumLangLabel || 'Languages';
            const rowVersions = versionsDockL;
            const rowGov = ui.conMoreRowGovernance || govTooltip;

            let curriculumMoreBlock = '';
            if (showCurriculumTools) {
                const moreLangSelectInner = curriculumLangSelectOptionsHtml(
                    ui,
                    langKeys,
                    curriculumEditLang,
                    escHtml,
                    store.state.lang || ''
                );
                curriculumMoreBlock = `<div class="px-4 pt-4 w-full box-border" role="group" aria-label="${escHtml(secCurriculum)}">
                    <p class="arborito-menu-section">${escHtml(secCurriculum)}</p>
                    <div class="cp-construct-more__field">
                        <span class="cp-construct-more__field-lb">${escHtml(ui.conCurriculumLangLabel || 'Content language')}</span>
                        <select id="cp-more-curriculum-lang" class="cp-construct-more__select" aria-label="${escHtml(ui.conCurriculumLangLabel || 'Content language')}">${moreLangSelectInner}</select>
                    </div>
                </div>`;
            }

            const secTools = ui.conMoreSectionTools || ui.menuSectionTools || 'More actions';
            const toolsHeading = curriculumMoreBlock
                ? `<hr class="arborito-mmenu-divider mx-4 box-border" aria-hidden="true" /><div class="px-4 w-full box-border"><p class="arborito-menu-section">${escHtml(secTools)}</p></div>`
                : `<div class="px-4 pt-4 w-full box-border"><p class="arborito-menu-section">${escHtml(secTools)}</p></div>`;

            const moreRows = [];
            moreRows.push(conMoreDrillRowHtml('cp-more-governance', '🏛️', escHtml(rowGov)));
            if (hasPublishedBaseline) {
                /* In More sheet: same logic as dock CTA — Publish changes vs Up to date. */
                const rowLabel = isDraftDirty
                    ? (ui.publicTreeUpdateLabel || ui.publicTreeRepublishDockLabel || ui.publicTreeRepublishButton || 'Publish changes')
                    : (ui.publicTreeUpToDateLabel || ui.publishDiffClean || 'Up to date');
                const rowTitle = isDraftDirty
                    ? (ui.publicTreeUpdateTooltip || ui.publicTreeRepublishDockTooltip || ui.publishDiffTitle || 'Review and publish changes')
                    : (ui.publicTreeUpToDateTooltip || ui.publishDiffNoChanges || 'Up to date');
                moreRows.push(
                    conMoreDrillRowHtml(
                        'cp-more-publish-diff',
                        isDraftDirty ? '🔄' : '✓',
                        escHtml(rowLabel),
                        isDraftDirty ? 'arborito-mmenu-drill-row--accent' : '',
                        {
                            title: escHtml(rowTitle),
                            ariaLabel: escHtml(rowTitle),
                            disabled: !isDraftDirty
                        }
                    )
                );
            }
            if (canRetractPublicTree) {
                moreRows.push(
                    conMoreDrillRowHtml(
                        'btn-retract-public-tree',
                        this.state.revokingPublic ? '⏳' : '🛑',
                        this.state.revokingPublic ? escHtml('…') : escHtml(retShort),
                        'arborito-mmenu-drill-row--danger',
                        {
                            title: escHtml(retL),
                            ariaLabel: escHtml(retL),
                            disabled: this.state.revokingPublic
                        }
                    )
                );
            }
            const morePopHidden = !this.moreToolsOpen;
            const moreBackdropEnter =
                morePopHidden || this._conMoreInstantReveal ? '' : ' animate-in fade-in';
            const pubActsAsUnpublish =
                (canRetractPublicTree && isNetworkTreeOwner && isPublicTree) ||
                (!!publishedNetworkParsed && isPublishedLocalTreeOwner);
            const hasBaseline = hasPublishedBaseline;
            const isUpdate = hasBaseline && isDraftDirty && !pubActsAsUnpublish;
            const isUpToDate = hasBaseline && !isDraftDirty && !pubActsAsUnpublish;

            const pubBtnTitle = pubActsAsUnpublish
                ? retL
                : isUpdate
                    ? (ui.publicTreeUpdateTooltip || ui.publicTreeRepublishDockTooltip || 'Update the public tree')
                    : isUpToDate
                        ? (ui.publicTreeUpToDateTooltip || 'Already up to date')
                        : pubL;
            const pubBtnShort = pubActsAsUnpublish
                ? retShort
                : isUpdate
                    ? (ui.publicTreeUpdateLabel || ui.publicTreeRepublishDockLabel || ui.publicTreeRepublishButton || 'Update public')
                    : isUpToDate
                        ? (ui.publicTreeUpToDateLabel || 'Up to date')
                        : pubShort;
            const pubBtnBusy = pubActsAsUnpublish ? this.state.revokingPublic : this.state.publishingPublic;
            const pubBtnIcon = pubActsAsUnpublish ? '🛑' : (isUpdate ? '🔄' : '🌐');
            const pubDockBtn =
                hasTree && (isLocal || isNetworkTreeOwner)
                    ? `<button type="button" id="btn-public-tree" data-arbor-tour="con-publish" class="arborito-mob-tab cp-construct-mob-tab--pub disabled:opacity-40 disabled:pointer-events-none" title="${escHtml(pubBtnTitle)}" aria-label="${escHtml(pubBtnTitle)}" ${!hasTree || pubBtnBusy || isUpToDate ? 'disabled' : ''}>
                        <span class="arborito-mob-tab__icon" aria-hidden="true">${pubBtnBusy ? '⏳' : pubBtnIcon}</span>
                        <span class="arborito-mob-tab__label">${pubBtnBusy ? '…' : escHtml(shortDockLabel(pubBtnShort))}</span>
                    </button>`
                    : `<span class="arborito-mob-tab cp-construct-mob-tab--pub opacity-30 pointer-events-none" aria-hidden="true"></span>`;
            dockMain.innerHTML = `
            <div class="cp-construct-wrap" role="region" aria-label="${escHtml(ui.constructionDockAriaFallback || constructTitle)}">
                <div id="cp-construct-more-backdrop" class="arborito-sheet-backdrop arborito-sheet-backdrop--mobile-more cp-construct-more-backdrop${moreBackdropEnter}${this._conMoreInstantReveal ? ' cp-construct-more-backdrop--instant' : ''}" aria-hidden="${morePopHidden ? 'true' : 'false'}"${morePopHidden ? ' hidden' : ''}></div>
                <div id="cp-construct-more-pop" class="arborito-sheet arborito-sheet--mobile-more min-h-0 cp-construct-more-sheet${this._conMoreInstantReveal ? ' cp-construct-more-sheet--instant' : ''}" role="dialog" aria-modal="true" aria-label="${escHtml(moreDockAria)}"${morePopHidden ? ' hidden' : ''}>
                    <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero arborito-mmenu-hero--root">
                        <div class="arborito-sheet__grab" aria-hidden="true"></div>
                        <div class="arborito-mmenu-toolbar">
                            <button type="button" id="cp-more-close" class="arborito-mmenu-back shrink-0" aria-label="${escHtml(ui.navBack || ui.close || 'Close')}">←</button>
                            <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${escHtml(moreDockL)}</h2>
                            <span class="w-10 shrink-0" aria-hidden="true"></span>
                        </div>
                    </div>
                    <div class="arborito-mmenu-scroll arborito-mmenu-pane-host custom-scrollbar cp-construct-more-mmenu-scroll" style="padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 12px));">
                        ${curriculumMoreBlock}
                        ${toolsHeading}
                        <div class="px-4 w-full box-border pb-1">${moreRows.join('')}</div>
                    </div>
                </div>
                <nav class="cp-construct-mob-dock" aria-label="${escHtml(ui.constructionDockAriaFallback || 'Tools')}">
                    <button type="button" id="btn-back-construct" class="arborito-mob-tab" title="${escHtml(exitConstructL)}" aria-label="${escHtml(exitConstructL)}">
                        <span class="arborito-mob-tab__icon" aria-hidden="true">←</span>
                        <span class="arborito-mob-tab__label">${escHtml(shortDockLabel(exitConstructL))}</span>
                    </button>
                    <button type="button" id="btn-construction-undo" data-arbor-tour="con-undo" class="arborito-mob-tab cp-construct-mob-tab--undo disabled:opacity-40 disabled:pointer-events-none" title="${escHtml(undoL)}" aria-label="${escHtml(undoL)}" ${canUndoCon ? '' : 'disabled'}>
                        <span class="arborito-mob-tab__icon" aria-hidden="true">↶</span>
                        <span class="arborito-mob-tab__label">${escHtml(shortDockLabel(undoShort))}</span>
                    </button>
                    ${pubDockBtn}
                    <button type="button" id="btn-architect" data-arbor-tour="con-ai" class="arborito-mob-tab cp-construct-mob-tab--owl" title="${escHtml(aiL)}" aria-label="${escHtml(aiL)}">
                        <span class="arborito-mob-tab__icon" aria-hidden="true">🦉⛑️</span>
                        <span class="arborito-mob-tab__label">${escHtml(shortDockLabel(aiL))}</span>
                    </button>
                    <button type="button" id="btn-cp-more-tools" data-arbor-tour="con-more" class="arborito-mob-tab${this.moreToolsOpen ? ' arborito-mob-tab--active' : ''}" aria-expanded="${this.moreToolsOpen}" aria-haspopup="true" title="${escHtml(moreDockAria)}" aria-label="${escHtml(moreDockAria)}">
                        <span class="arborito-mob-tab__icon arborito-mob-tab__icon--menu" aria-hidden="true">☰</span>
                        <span class="arborito-mob-tab__label">${escHtml(shortDockLabel(moreDockL))}</span>
                    </button>
                </nav>
            </div>`;
        } else {
            this.classList.remove('construction-panel-host--mob-dock');
            if (dockExitlessDesktop) this.classList.add('construction-panel-host--desk-compact-dock');
            else this.classList.remove('construction-panel-host--desk-compact-dock');
            const backBtn = dockExitlessDesktop
                ? ''
                : `<button type="button" id="btn-back-construct" class="cp-dock-tab cp-dock-tab--edge" title="${escHtml(exitConstructL)}" aria-label="${escHtml(exitConstructL)}">
                    <span class="cp-dock-tab__label">←</span>
                </button>`;
            dockMain.innerHTML = `
            <div class="cp-dock-row" role="region" aria-label="${escHtml(ui.constructionDockAriaFallback || constructTitle)}">
                ${backBtn}
                <div class="cp-dock-scroll custom-scrollbar" role="toolbar" aria-label="${escHtml(ui.constructionDockAriaFallback || 'Tools')}">
                    ${scrollInner}
                </div>
            </div>
        `;
        }

        const bind = (root, id, fn) => {
            const el = root.querySelector(id);
            if (el) {
                bindMobileTap(el, (e) => {
                    e.stopPropagation();
                    fn(e);
                });
            }
        };

        bind(dockMain, '#btn-back-construct', () => {
            this.moreToolsOpen = false;
            store.toggleConstructionMode();
        });

        bind(dockMain, '#btn-construction-undo', () => {
            if (!(store.getConstructionUndoDepth && store.getConstructionUndoDepth())) return;
            this.moreToolsOpen = false;
            store.undoConstructionEdit();
            this.lastRenderKey = null;
            this.updateView();
        });

        const curBtn = dockMain.querySelector('#btn-cp-curriculum');
        if (curBtn) {
            bindMobileTap(curBtn, (e) => {
                e.stopPropagation();
                this.moreToolsOpen = false;
                store.openConstructionCurriculumLangModal();
            });
        }

        bind(dockMain, '#btn-cp-more-tools', () => {
            this.moreToolsOpen = !this.moreToolsOpen;
            this.lastRenderKey = null;
            this.updateView();
        });
        bind(dockMain, '#cp-more-close', () => {
            this.moreToolsOpen = false;
            this.lastRenderKey = null;
            this.updateView();
        });
        bind(dockMain, '#cp-construct-more-backdrop', () => {
            this.moreToolsOpen = false;
            this.lastRenderKey = null;
            this.updateView();
        });
        bind(dockMain, '#cp-more-revert', () => {
        });
        bind(dockMain, '#cp-more-governance', () => {
            this.moreToolsOpen = false;
            store.setModal({ type: 'contributor', tab: 'info', fromConstructionMore: true });
            this.lastRenderKey = null;
            this.updateView();
        });
        /*
         * `#btn-publish-diff` (separate diff tab in dock) was merged with `#btn-public-tree`.
         * We keep `cp-more-publish-diff` for compact mobile More sheet.
         */
        bind(dockMain, '#cp-more-publish-diff', () => {
            if (!localIdForEntry) return;
            store.setModal({ type: 'publish-diff', localTreeId: localIdForEntry, fromConstructionMore: true });
            this.moreToolsOpen = false;
            this.lastRenderKey = null;
            this.updateView();
        });

        const moreLangSel = dockMain.querySelector('#cp-more-curriculum-lang');
        if (moreLangSel) {
            bindCurriculumLangSelect(moreLangSel, {
                onPickAdd: () => {
                    this.moreToolsOpen = false;
                    this.lastRenderKey = null;
                    this.updateView();
                },
                addLangOpts: { fromConstructionMore: true }
            });
        }
        bind(dockMain, '#cp-more-open-versions', () => {
            this.moreToolsOpen = false;
            this.lastRenderKey = null;
            // Construction uses the unified curriculum switcher overlay (versions + snapshots),
            // not the legacy Releases modal.
            store.dispatchEvent(new CustomEvent('open-curriculum-switcher', { detail: { preferTab: 'version' } }));
            this.updateView();
        });

        if (isContributor) {
            bind(dockMain, '#btn-architect', () => {
                this.moreToolsOpen = false;
                store.setModal({ type: 'sage', mode: 'architect' });
                this.lastRenderKey = null;
                this.updateView();
            });
            bind(dockMain, '#btn-governance', () => store.setModal({ type: 'contributor', tab: 'info' }));
            bind(dockMain, '#btn-public-tree', () => {
                const srcUrl = String((store.value.activeSource && store.value.activeSource.url) || '');
                const activeTreeRef = parseNostrTreeUrl(srcUrl);
                const localId = srcUrl.startsWith('local://') ? srcUrl.slice('local://'.length) : null;
                const publishedUrl = localId
                    ? (store.userStore && store.userStore.getLocalTreePublishedNetworkUrl
                          ? store.userStore.getLocalTreePublishedNetworkUrl(localId)
                          : null) || null
                    : null;
                const publishedTreeRef = publishedUrl ? parseNostrTreeUrl(publishedUrl) : null;

                const actsAsUnpublish =
                    (typeof store.canRetractActivePublicUniverse === 'function' &&
                        store.canRetractActivePublicUniverse() &&
                        !!activeTreeRef &&
                        !!(
                            store.getNostrPublisherPair(activeTreeRef.pub) &&
                            store.getNostrPublisherPair(activeTreeRef.pub).priv
                        )) ||
                    (!!publishedTreeRef &&
                        !!(
                            store.getNostrPublisherPair(publishedTreeRef.pub) &&
                            store.getNostrPublisherPair(publishedTreeRef.pub).priv
                        ));
                if (actsAsUnpublish) return this.handleRetractPublicTree();
                /*
                 * “Publish tree” vs “publish changes”:
                 *   - no baseline → first-time publish (interactive flow).
                 *   - baseline + changes → open diff; modal has its own “Publish changes” CTA.
                 */
                const entryId = localId;
                const entry = entryId
                    ? (store.userStore?.state?.localTrees || []).find((t) => String(t?.id) === String(entryId)) || null
                    : null;
                const hasBaseline = !!(
                    (entry && entry.publishedNetworkUrl) &&
                    entry &&
                    entry.publishedSnapshotHash
                );
                const isDirty =
                    !!(hasBaseline && (entry && entry.draftHash) && (entry && entry.publishedSnapshotHash)) &&
                    String(entry.draftHash) !== String(entry.publishedSnapshotHash);
                if (hasBaseline && isDirty) {
                    const fromConstructionMoreMenu = this.moreToolsOpen;
                    this.moreToolsOpen = false;
                    store.setModal({
                        type: 'publish-diff',
                        localTreeId: entryId || '',
                        fromConstructionMore: fromConstructionMoreMenu
                    });
                    return;
                }
                return this.handleMakeTreePublic();
            });
        }
        if (canRetractPublicTree) {
            bind(dockMain, '#btn-retract-public-tree', () => this.handleRetractPublicTree());
        }

        this._syncConstructionMoreOpenClass();
    }
}

customElements.define('arborito-construction-panel', ArboritoConstructionPanel);
