
import { store } from '../../core/store.js';
import { ArboritoComponent } from './component.js';
import {
    shouldShowMobileUI,
    isDesktopForestInlineSearch,
    clearArboritoGameImmersiveOpen
} from './breakpoints.js';
import { isModalBackdropEmptyTap } from './mobile-tap.js';
import { modalShellHtml } from './modal-shell.js';

/* ============================================================================
 * MOBILE FULLBLEED MODAL CONVENTION — READ BEFORE ADDING A NEW MODAL
 * ============================================================================
 *
 * On mobile, modals that render with `layout: 'dock'` (via `modalShellHtml`) are
 * supposed to look full-screen: hero/header pinned to the top edge, content
 * stretching all the way to the screen edges, no dock-clearance gap at the bottom.
 *
 * The fullbleed look is gated by the `arborito-modal--mobile-fullbleed` CSS class
 * on `#modal-backdrop`. WITHOUT this class, CSS in
 * `styles/modals/mobile-sheets-and-dock-panels.css` adds 0.75rem of safe-area
 * padding on top/left/right AND reserves `var(--arborito-mob-dock-clearance)` at
 * the bottom — so the modal looks like a centered card that doesn't reach the
         * borders (so it does not "cover the margins").
 *
 * `modalShellHtml` does add the class once on initial render for any
 * `layout: 'dock'` + mobile call, BUT `_syncOpenModalBackdropChrome()` below runs
 * on EVERY `state-change` and re-evaluates whether the class belongs. So a modal
 * type missing from `MOBILE_FULLBLEED_MODAL_TYPES` will get the class stripped on
 * the next store tick, even if `modalShellHtml` set it.
 *
 * → If you add a new modal that uses `layout: 'dock'` (or otherwise wants to be
 *   fullbleed on mobile), ADD ITS TYPE STRING HERE. That's the only step needed
 *   — no CSS edits, no per-modal hacks.
 *
 * `CONSTRUCTION_MOBILE_FULLBLEED_MODAL_TYPES` is the same idea but only kicks in
 * when the user is in mobile *construction* mode (covers types that are centered
 * cards in normal mobile but full sheets while authoring).
 * ============================================================================ */
const MOBILE_FULLBLEED_MODAL_TYPES = new Set([
    'about',
    'backup',
    'celebration-prefs',
    'construction-history',
    'forum',
    'onboarding',
    'privacy',
    'profile',
    'publish-diff',
    'sources',
    'tree-info'
]);

const CONSTRUCTION_MOBILE_FULLBLEED_MODAL_TYPES = new Set([
    'dialog',
    'pick-curriculum-lang',
    'construction-curriculum-lang',
    'contributor',
    'sources',
    'tree-info'
]);

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
import '../../features/search/modals/search.js';
import '../../features/identity-auth/modals/profile.js';
import '../../features/garden-progress/modals/certificates.js';
import '../../features/tree-graph/modals/preview.js';
import '../../features/identity-auth/modals/onboarding.js';
import '../../features/sources/modals/sources.js';
import '../../features/shell-chrome/modals/about.js';
import '../../features/shell-chrome/modals/language.js';
import '../../features/backup-export/modals/export-pdf.js';
import '../../features/garden-progress/modals/certificate-view.js';
import '../../features/learning/modals/empty-module.js';
import '../../features/privacy-gdpr/modals/privacy.js';
import '../../features/garden-progress/modals/celebration-prefs.js';
import '../../features/backup-export/modals/backup.js';
import '../../features/arcade/modals/arcade.js';
import '../../features/arcade/modals/game-player.js';
import '../../features/sources/modals/security-warning.js';
import '../../features/sources/modals/load-warning.js';
import '../../features/tree-graph/modals/node-properties.js';
import './dialog.js';
import '../../features/tree-graph/modals/move-node.js';
import '../../features/tree-graph/modals/tree-info.js';
import '../../features/sources/modals/pick-curriculum-lang.js';
import '../../features/editor/modals/construction-curriculum-lang.js';
import '../../features/forum/modals/forum.js';
import '../../features/publishing/modals/publish-diff.js';
import '../../features/editor/modals/construction-history.js';
import '../../features/identity-auth/modals/sync-login-qr-scanner.js';

// Admin Panel is essentially a modal
import '../../features/nostr/modals/admin.js';

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
        this._syncOpenModalBackdropChrome();
    }

    /** Keep backdrop chrome (fullbleed, mobile) in sync during in-modal updates (e.g. Sources plant/load). */
    _syncOpenModalBackdropChrome() {
        const backdrop = this.querySelector('#modal-backdrop');
        if (!backdrop || !backdrop.classList.contains('arborito-modal-root')) return;
        this.syncModalBackdropMobileClass();
        const m = store.value.modal;
        const t = typeof m === 'string' ? m : m?.type;
        backdrop.classList.toggle('arborito-modal--search', t === 'search');
        backdrop.classList.toggle('arborito-modal--arcade', t === 'arcade');
        backdrop.classList.toggle('arborito-modal--immersive', t === 'game-player');
        const mobUi = shouldShowMobileUI();
        const constructionMobile =
            typeof document !== 'undefined' &&
            document.documentElement.classList.contains('arborito-construction-mobile') &&
            !document.documentElement.classList.contains('arborito-desktop');
        const fullBleedInConstruction =
            constructionMobile &&
            t &&
            typeof t === 'string' &&
            CONSTRUCTION_MOBILE_FULLBLEED_MODAL_TYPES.has(t);
        const fullBleed =
            mobUi &&
            (store.value.viewMode === 'certificates' ||
                (t && MOBILE_FULLBLEED_MODAL_TYPES.has(t)) ||
                fullBleedInConstruction);
        backdrop.classList.toggle('arborito-modal--mobile-fullbleed', fullBleed);
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

        // Clear delegated modals host so Sage does not sit under stale modal layers.
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
        const viewModeSuffix = typeof modal === 'object' && modal?.viewMode ? `-${modal.viewMode}` : '';
        const currentKey = `${type}-${modal.node?.id || modal.url || ''}${focusSuffix}${fromMoreSuffix}${fromConstructionMoreSuffix}${fromSourcesSuffix}${viewModeSuffix}`;

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

        if (currentKey === this.lastRenderKey) return;
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
            case 'contributor':
                /* Contributor panel: mobile fullbleed, desktop card. Size comes from .arborito-contributor-modal-shell. */
                this.innerHTML = modalShellHtml({
                    bodyHtml: '<arborito-admin-panel class="w-full h-full flex flex-col"></arborito-admin-panel>',
                    layout: 'dock',
                    panelClass: 'arborito-contributor-modal-shell',
                });
                break;
            case 'onboarding':
                this.innerHTML = `<arborito-modal-onboarding></arborito-modal-onboarding>`;
                break;
            case 'sources':
                this.innerHTML = `<arborito-modal-sources></arborito-modal-sources>`;
                break;
            case 'tree-info':
                this.innerHTML = `<arborito-modal-tree-info></arborito-modal-tree-info>`;
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
            case 'celebration-prefs':
                this.innerHTML = `<arborito-modal-celebration-prefs></arborito-modal-celebration-prefs>`;
                break;
            case 'backup':
                this.innerHTML = `<arborito-modal-backup></arborito-modal-backup>`;
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
            case 'construction-history':
                this.innerHTML = `<arborito-modal-construction-history></arborito-modal-construction-history>`;
                break;
            case 'sync-login-qr-scanner':
                this.innerHTML = `<arborito-modal-sync-login-qr-scanner></arborito-modal-sync-login-qr-scanner>`;
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
                this._syncOpenModalBackdropChrome();
                if (!backdrop._dismissBound) {
                    backdrop._dismissBound = true;
                    /* click (no bindMobileTap): touchend on the backdrop with preventDefault breaks taps on children */
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
