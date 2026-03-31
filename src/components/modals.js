
import { store } from '../store.js';
import { ArboritoComponent } from '../utils/component.js';
import {
    shouldShowMobileUI,
    isDesktopForestInlineSearch,
    clearArboritoGameImmersiveOpen
} from '../utils/breakpoints.js';

// Sub-components
import './modals/search.js';
import './modals/profile.js';
import './modals/certificates.js';
import './modals/preview.js';
import './modals/welcome.js';
import './modals/sources.js';
import './modals/about.js';
import './modals/language.js';
import './modals/impressum.js';
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

// Admin Panel is essentially a modal
import './modals/admin.js';

class ArboritoModals extends ArboritoComponent {
    constructor() {
        super();
        this.lastRenderKey = null;
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
            if (store.value.modal) {
                const type = store.value.modal?.type || store.value.modal;
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

        // 1. Delegated Modals — vaciar <arborito-modals> para no dejar capas bajo Sage/Editor
        if (modal && (modal === 'sage' || modal.type === 'sage')) {
            if (this.innerHTML !== '') {
                this.innerHTML = '';
                this.lastRenderKey = null;
            }
            return;
        }
        if (modal && modal.type === 'editor') {
            if (this.innerHTML !== '') {
                this.innerHTML = '';
                this.lastRenderKey = null;
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
        const currentKey = `${type}-${modal.node?.id || modal.url || ''}${focusSuffix}${fromMoreSuffix}`;

        // Don't skip render for generic 'dialog' type as its content changes without changing 'type' key
        if (type !== 'dialog' && currentKey === this.lastRenderKey) return;
        this.lastRenderKey = currentKey;

        switch (type) {
            case 'dialog':
                this.innerHTML = `<arborito-modal-dialog></arborito-modal-dialog>`;
                break;
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
                this.innerHTML = `
                <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-0 md:p-4 animate-in arborito-modal-root">
                    <div class="bg-white dark:bg-slate-900 rounded-none md:rounded-3xl shadow-2xl w-full h-full border-0 md:border border-slate-200 dark:border-slate-800 cursor-auto relative overflow-hidden flex flex-col arborito-contributor-modal-shell max-w-none md:max-w-none">
                        <arborito-admin-panel class="w-full h-full flex flex-col"></arborito-admin-panel>
                    </div>
                </div>`;
                break;
            case 'welcome':
            case 'tutorial':
                this.innerHTML = `<arborito-modal-welcome></arborito-modal-welcome>`;
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
            case 'impressum':
                this.innerHTML = `<arborito-modal-impressum></arborito-modal-impressum>`;
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
                backdrop.classList.toggle(
                    'arborito-modal--mobile-fullbleed',
                    mobUi && (store.value.viewMode === 'certificates' || t === 'releases')
                );
                if (!backdrop._dismissBound) {
                    backdrop._dismissBound = true;
                    backdrop.addEventListener('click', (e) => {
                        if (e.target === backdrop) store.dismissModal();
                    });
                }
            }
        }, 50);
    }
}

customElements.define('arborito-modals', ArboritoModals);
