
import { store } from '../store.js';
import { ArboritoComponent } from '../utils/component.js';
import {
    shouldShowMobileUI,
    isDesktopForestInlineSearch,
    clearArboritoGameImmersiveOpen
} from '../utils/breakpoints.js';
import { isModalBackdropEmptyTap } from '../utils/mobile-tap.js';

/** Avoid remounting `<arborito-modal-dialog>` on every `state-change` (broke clicks and pegged CPU in Firefox). */
function dialogModalContentKey(modal) {
    if (!modal || typeof modal !== 'object') return '';
    try {
        const snaps = modal.exportSnapshots;
        const snapIds = Array.isArray(snaps) ? snaps.map((r) => (r && r.id) || '').join('\n') : '';
        return JSON.stringify({
            dialogType: modal.dialogType,
            title: modal.title,
            body: modal.body,
            bodyHtml: !!modal.bodyHtml,
            placeholder: modal.placeholder,
            confirmText: modal.confirmText,
            cancelText: modal.cancelText,
            danger: !!modal.danger,
            choices: modal.choices,
            exportSnapshotIds: snapIds
        });
    } catch {
        return `err-${Date.now()}`;
    }
}

// Sub-components
import './modals/search.js';
import './modals/profile.js';
import './modals/recovery-assistant.js';
import './modals/certificates.js';
import './modals/preview.js';
import './modals/onboarding.js';
import './modals/sources.js';
import './modals/about.js';
import './modals/language.js';
import './modals/export-pdf.js';
import './modals/certificate-view.js';
import './modals/empty-module.js';
import './modals/privacy.js';
import './modals/arcade.js';
import './modals/game-player.js';
import './modals/security-warning.js';
import './modals/load-warning.js';
import './modals/releases.js';
import './modals/node-properties.js';
import './modals/dialog.js';
import './modals/move-node.js';
import './modals/manual.js';
import './modals/readme.js';
import './modals/tree-info.js';
import './modals/tree-report.js';
import './modals/pick-curriculum-lang.js';
import './modals/construction-curriculum-lang.js';
import './modals/forum.js';
import './modals/publish-diff.js';
import './modals/qr-signal-login.js';

// Admin Panel is essentially a modal
import './modals/admin.js';

class ArboritoModals extends ArboritoComponent {
    constructor() {
        super();
        this.lastRenderKey = null;
        /** @type {string|null} — last `dialog` modal content; see `dialogModalContentKey`. */
        this._dialogContentKey = null;
    }

    /** @override */
    update() {
        this.checkRender();
    }

    connectedCallback() {
        this._onViewport = () => this.syncModalBackdropMobileClass();
        window.addEventListener('arborito-viewport', this._onViewport);
        super.connectedCallback();

        this._escapeHandler = (e) => {
            if (e.key !== 'Escape') return;
            if (store.state.modalOverlay) {
                store.closeAuthorLicenseOverlay();
                return;
            }
            if (store.value.modal) {
                const type = store.value.modal?.type || store.value.modal;
                if (type === 'onboarding') return;
                if (type === 'sources' && store.isSourcesDismissBlocked()) {
                    const ui = store.ui;
                    store.notify(ui.sourcesDismissNeedTree || 'Add or load a tree before closing.', true);
                    return;
                }
                if (type !== 'dialog') store.dismissModal();
                return;
            }
            if (store.value.viewMode === 'certificates') {
                store.leaveCertificatesView();
            }
        };
        document.addEventListener('keydown', this._escapeHandler);
    }

    disconnectedCallback() {
        if (this._escapeHandler) {
            document.removeEventListener('keydown', this._escapeHandler);
        }
        if (this._onViewport) {
            window.removeEventListener('arborito-viewport', this._onViewport);
        }
        super.disconnectedCallback();
    }

    syncModalBackdropMobileClass() {
        const backdrop = this.querySelector('#modal-backdrop');
        if (backdrop && backdrop.classList.contains('arborito-modal-root')) {
            backdrop.classList.toggle('arborito-modal--mobile', shouldShowMobileUI());
        }
    }

    checkRender() {
        const { modal, viewMode, previewNode } = store.value;
        const routedType = modal ? modal.type || modal : null;
        if (routedType !== 'game-player') clearArboritoGameImmersiveOpen();

        // 1. Delegated Modals — vaciar <arborito-modals> para no dejar capas bajo Sage
        if (modal && (modal === 'sage' || modal.type === 'sage')) {
            if (this.innerHTML !== '') {
                this.innerHTML = '';
                this.lastRenderKey = null;
                this._dialogContentKey = null;
            }
            return;
        }

        // 2. View Modes that act like modals (Certificates Dashboard)
        if (viewMode === 'certificates' && modal?.type !== 'certificate') {
            if (this.lastRenderKey !== 'certificates') {
                this.innerHTML = `<arborito-modal-certificates></arborito-modal-certificates>`;
                this.lastRenderKey = 'certificates';
                this.setFocus();
            }
            return;
        }

        // 3. Cleanup if no modal
        if (!modal && !previewNode) {
            if (this.innerHTML !== '' || this.lastRenderKey != null) {
                this.innerHTML = '';
                this.lastRenderKey = null;
                this._dialogContentKey = null;
            }
            return;
        }

        // 4. Preview Modal (Priority over others)
        if (previewNode) {
            const key = `preview-${previewNode.id}`;
            if (this.lastRenderKey !== key) {
                this.innerHTML = `<arborito-modal-preview></arborito-modal-preview>`;
                this.lastRenderKey = key;
                this.setFocus();
            }
            return;
        }

        // 5. Standard Modals Router
        const type = modal.type || modal; // Handle string vs object
        const focusSuffix = typeof modal === 'object' && modal?.focus ? `-${modal.focus}` : '';
        const fromMoreSuffix = typeof modal === 'object' && modal?.fromMobileMore ? '-mm' : '';
        const fromConstructionMoreSuffix =
            typeof modal === 'object' && modal?.fromConstructionMore ? '-cm' : '';
        const fromSourcesSuffix = typeof modal === 'object' && modal?.fromSources ? '-src' : '';
        const readmeManual = type === 'readme' && typeof modal === 'object' && modal?.manualOpen ? '-rm' : '';
        const viewModeSuffix = typeof modal === 'object' && modal?.viewMode ? `-${modal.viewMode}` : '';
        /** `tree-report` has no `modal.url` / `modal.node`; include active tree so switching courses remounts, and keys stay distinct per tree. */
        const reportSrcKey =
            type === 'tree-report' && store.value.activeSource
                ? `-${String(store.value.activeSource.url || store.value.activeSource.id || '').slice(0, 240)}`
                : '';
        const currentKey = `${type}-${modal.node?.id || modal.url || ''}${reportSrcKey}${focusSuffix}${fromMoreSuffix}${fromConstructionMoreSuffix}${fromSourcesSuffix}${readmeManual}${viewModeSuffix}`;

        if (type === 'dialog' && typeof modal === 'object') {
            const dk = dialogModalContentKey(modal);
            if (this._dialogContentKey === dk && this.querySelector('arborito-modal-dialog')) {
                return;
            }
            this._dialogContentKey = dk;
            this.lastRenderKey = `dialog-${dk.length}`;
            this.innerHTML = `<arborito-modal-dialog></arborito-modal-dialog>`;
            this.setFocus();
            return;
        }
        this._dialogContentKey = null;

        if (currentKey === this.lastRenderKey) {
            /* Avoid stale skip: key matched but subtree was removed (close/reopen races, batched updates). */
            if (type !== 'tree-report' || this.querySelector('arborito-modal-tree-report')) return;
        }
        this.lastRenderKey = currentKey;

        switch (type) {
            case 'search':
                if (isDesktopForestInlineSearch()) {
                    window.dispatchEvent(new CustomEvent('arborito-desktop-search-open'));
                    store.setModal(null);
                    this.lastRenderKey = null;
                    return;
                }
                this.innerHTML = `<arborito-modal-search></arborito-modal-search>`;
                break;
            case 'profile':
                this.innerHTML = `<arborito-modal-profile></arborito-modal-profile>`;
                break;
            case 'recovery-assistant':
                this.innerHTML = `<arborito-modal-recovery-assistant></arborito-modal-recovery-assistant>`;
                break;
            case 'contributor':
                this.innerHTML = `
                <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-0 md:p-4 animate-in arborito-modal-root">
                    <div class="bg-white dark:bg-slate-900 rounded-none md:rounded-3xl shadow-2xl w-full h-full border-0 md:border border-slate-200 dark:border-slate-800 cursor-auto relative overflow-hidden flex flex-col arborito-contributor-modal-shell max-w-none md:max-w-none">
                        <arborito-admin-panel class="w-full h-full flex flex-col"></arborito-admin-panel>
                    </div>
                </div>`;
                break;
            case 'onboarding':
                this.innerHTML = `<arborito-modal-onboarding></arborito-modal-onboarding>`;
                break;
            case 'manual':
                this.innerHTML = `<arborito-modal-manual></arborito-modal-manual>`;
                break;
            case 'sources':
                this.innerHTML = `<arborito-modal-sources></arborito-modal-sources>`;
                break;
            case 'releases':
                this.innerHTML = `<arborito-modal-releases></arborito-modal-releases>`;
                break;
            case 'readme':
                this.innerHTML = `<arborito-modal-readme></arborito-modal-readme>`;
                break;
            case 'tree-info':
                this.innerHTML = `<arborito-modal-tree-info></arborito-modal-tree-info>`;
                break;
            case 'tree-report':
                this.innerHTML = `<arborito-modal-tree-report></arborito-modal-tree-report>`;
                break;
            case 'pick-curriculum-lang':
                this.innerHTML = `<arborito-modal-pick-curriculum-lang></arborito-modal-pick-curriculum-lang>`;
                break;
            case 'construction-curriculum-lang':
                this.innerHTML = `<arborito-modal-construction-curriculum-lang></arborito-modal-construction-curriculum-lang>`;
                break;
            case 'security-warning':
                this.innerHTML = `<arborito-modal-security-warning></arborito-modal-security-warning>`;
                break;
            case 'load-warning':
                this.innerHTML = `<arborito-modal-load-warning></arborito-modal-load-warning>`;
                break;
            case 'arcade':
                this.innerHTML = `<arborito-modal-arcade></arborito-modal-arcade>`;
                break;
            case 'game-player':
                this.innerHTML = `<arborito-modal-game-player></arborito-modal-game-player>`;
                break;
            case 'about':
                this.innerHTML = `<arborito-modal-about></arborito-modal-about>`;
                break;
            case 'language':
                this.innerHTML = `<arborito-modal-language></arborito-modal-language>`;
                break;
            case 'privacy':
                this.innerHTML = `<arborito-modal-privacy></arborito-modal-privacy>`;
                break;
            case 'emptyModule':
                this.innerHTML = `<arborito-modal-empty-module></arborito-modal-empty-module>`;
                break;
            case 'certificate':
                this.innerHTML = `<arborito-modal-certificate-view></arborito-modal-certificate-view>`;
                break;
            case 'export-pdf':
                this.innerHTML = `<arborito-modal-export-pdf></arborito-modal-export-pdf>`;
                break;
            case 'node-properties':
                this.innerHTML = `<arborito-modal-node-properties></arborito-modal-node-properties>`;
                break;
            case 'move-node':
                this.innerHTML = `<arborito-modal-move-node></arborito-modal-move-node>`;
                break;
            case 'forum':
                this.innerHTML = `<arborito-modal-forum></arborito-modal-forum>`;
                break;
            case 'publish-diff':
                this.innerHTML = `<arborito-modal-publish-diff></arborito-modal-publish-diff>`;
                break;
            case 'qr-signal-login':
                this.innerHTML = `<arborito-modal-qr-signal-login></arborito-modal-qr-signal-login>`;
                break;
            default:
                this.innerHTML = `<div class="p-8 bg-white m-4 rounded">${(store.ui.modalUnknownType || 'Unknown modal: {type}').replace('{type}', String(type))}</div>`;
        }
        this.setFocus();
    }

    setFocus() {
        setTimeout(() => {
            const focusable = this.querySelector('[autofocus], input:not([type="hidden"]), button, a[href]');
            if (focusable) {
                focusable.focus();
            }
            const backdrop = this.querySelector('#modal-backdrop');
            if (backdrop) {
                backdrop.classList.add('arborito-modal-root');
                this.syncModalBackdropMobileClass();
                const m = store.value.modal;
                const t = typeof m === 'string' ? m : m?.type;
                backdrop.classList.toggle('arborito-modal--search', t === 'search');
                backdrop.classList.toggle('arborito-modal--arcade', t === 'arcade');
                backdrop.classList.toggle('arborito-modal--releases', t === 'releases');
                backdrop.classList.toggle('arborito-modal--immersive', t === 'game-player');
                const mobUi = shouldShowMobileUI();
                const constructionMobile =
                    typeof document !== 'undefined' &&
                    document.documentElement.classList.contains('arborito-construction-mobile') &&
                    !document.documentElement.classList.contains('arborito-desktop');
                /* Only sheets that should edge-to-edge in construction; others keep normal mobile layout. */
                const constructionFullBleedTypes = new Set([
                    'dialog',
                    'pick-curriculum-lang',
                    'construction-curriculum-lang',
                    'contributor',
                    'sources',
                    'tree-info'
                ]);
                const fullBleedInConstruction =
                    constructionMobile &&
                    t &&
                    typeof t === 'string' &&
                    constructionFullBleedTypes.has(t);
                const onboardingFullBleed = mobUi && t === 'onboarding';
                const sourcesFirstRunFullBleed =
                    mobUi && t === 'sources' && typeof store.isSourcesDismissBlocked === 'function' && store.isSourcesDismissBlocked();
                backdrop.classList.toggle(
                    'arborito-modal--mobile-fullbleed',
                    mobUi &&
                        (store.value.viewMode === 'certificates' ||
                            t === 'releases' ||
                            t === 'profile' ||
                            fullBleedInConstruction ||
                            onboardingFullBleed ||
                            sourcesFirstRunFullBleed)
                );
                if (!backdrop._dismissBound) {
                    backdrop._dismissBound = true;
                    /* click (no bindMobileTap): touchend en el backdrop con preventDefault rompe taps en hijos */
                    backdrop.addEventListener('click', (e) => {
                        if (!isModalBackdropEmptyTap(backdrop, e)) return;
                        const cur = store.value.modal;
                        const mt = cur?.type || cur;
                        if (mt === 'onboarding') return;
                        if (mt === 'sources' && store.isSourcesDismissBlocked()) {
                            const ui = store.ui;
                            store.notify(ui.sourcesDismissNeedTree || 'Add or load a tree before closing.', true);
                            return;
                        }
                        store.dismissModal();
                    });
                }
            }
        }, 50);
    }
}

customElements.define('arborito-modals', ArboritoModals);
