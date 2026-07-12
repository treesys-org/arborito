import { AVAILABLE_LANGUAGES, normalizeAppLangCode } from '../core/i18n.js';
import { syncLessonReaderChromeClass } from '../shared/ui/lesson-reader-open.js';
import { syncMobileTreeShellClass } from '../shared/ui/mobile-tree-shell-class.js';
import {
    isModalOnlyPartial,
    shouldSkipGlobalStateChange,
    shouldSyncMobileTreeShell,
} from '../shared/ui/mobile-shell-sync.js';
import { modalType } from '../shared/ui/modal-enter.js';
import { applyArboritoTheme, resolveStoredTheme } from '../shared/lib/boot-theme.js';
import { getPanelRef } from '../app/panel-refs.js';
import { isSagePointerGuarded } from '../features/learning/api/sage-pointer-guard.js';
import { syncReactI18nSnapshot } from './react-state.js';
import { patchDomainSlicesFromPartial } from './patch-domain-slices.js';
import {
    ES_UI_BOOT_STUB,
    EN_UI_BOOT_STUB,
} from './shell-boot-stubs.js';
import {
    showDialog as showDialogLifecycle,
    showExportSnapshotsPickDialog as showExportSnapshotsPickDialogLifecycle,
    closeDialog as closeDialogLifecycle,
    alert as alertLifecycle,
    confirm as confirmLifecycle,
    acknowledge as acknowledgeLifecycle,
    prompt as promptLifecycle,
} from './shell-dialog-lifecycle.js';
import {
    dismissModalOnStore,
} from './shell-modal-lifecycle.js';
import { openModal } from '../app/modal-open.js';
import {
    loadLanguageOnStore,
    setLanguageOnStore,
} from './shell-language-lifecycle.js';
import { setThemeOnStore, toggleThemeOnStore } from './shell-theme-lifecycle.js';
import {
    ensureSageHostReadyOnStore,
    nudgeSageHostOnStore,
    openSageModalOnStore,
} from './shell-sage-lifecycle.js';
import { leaveCertificatesViewOnStore, setViewModeOnStore } from './shell-view-lifecycle.js';

export { bootStubForLang } from './shell-boot-stubs.js';

/** @type {Promise<typeof import('../features/editor/api/construction-sync.js')>|null} */
let _constructionSyncPromise = null;

async function getConstructionSync() {
    if (!_constructionSyncPromise) {
        _constructionSyncPromise = import('../features/editor/api/construction-sync.js');
    }
    return _constructionSyncPromise;
}

export class ShellStore extends EventTarget {
    constructor() {
        super();
        this._dialogResolver = null;
        /** @type {unknown[]} When a global dialog opens, previous `modal` is pushed here and restored on close. */
        this._dialogParentStack = [];
        /** Modal type for which the shell enter animation already played (in-modal refreshes skip re-enter). */
        this._modalShellSession = null;
        this._modalShellPainted = false;
        this._pendingUpdate = false;
        let initialLang = localStorage.getItem('arborito-lang');
        if (!initialLang) {
            const browserLang = navigator.language.split('-')[0].toUpperCase();
            const supportedLang = AVAILABLE_LANGUAGES.find((l) => l.code === browserLang);
            initialLang = supportedLang ? supportedLang.code : 'EN';
        }
        initialLang = normalizeAppLangCode(initialLang);
        this.state = {
            theme: resolveStoredTheme(),
            lang: initialLang,
            i18nData: null,
            communitySources: [],
            activeSource: null,
            availableReleases: [],
            pendingUntrustedSource: null,
            data: null,
            rawGraphData: null,
            searchCache: {},
            /** `idle` | `indexing` | `ready` | `error`, local search index (IndexedDB). */
            searchIndexStatus: 'idle',
            searchIndexError: null,
            path: [],
            ai: { status: 'idle', progress: '', messages: [] },
            selectedNode: null,
            previewNode: null,
            /** Generic (language, etc.); the graph does NOT use this for the tree. */
            loading: false,
            /** Curriculum pipeline only. Drives the "Loading open knowledge map…" message. */
            treeHydrating: false,
            /** Fullscreen tree-growing overlay; opt-in flag set by
             *  user-initiated install / open from Sources (so silent refreshes
             *  don't blank the UI). Cleared in `mountCurriculum`'s `finally`. */
            treeGrowingOverlay: false,
            /** Active publish flow (chunked uploads + directory bump): drives
             *  the publishing toast and the construction-panel edit
             *  lock. Cleared in `publishTreePublicInteractive`'s `finally`. */
            publishingTree: false,
            error: null,
            lastErrorMessage: null,
            viewMode: 'explore',
            certificatesFromMobileMore: false,
            constructionMode: false,
            /** Composed tree: user picked tree metadata vs branch editing on enter. */
            constructionEditFocus: null,
            /** Composed tree: branch ref locked for this construction session. */
            constructionLockedBranchRefId: null,
            /** When set (construction only), edit this `rawGraphData.languages` key instead of matching UI `lang`. */
            curriculumEditLang: null,
            modal: null,
            /** Floating modal above the main one (e.g. CC legal text without closing Sources/welcome). */
            modalOverlay: null,
            lastActionMessage: null,
            /** Public trees: approximate connected readers (network presence), or null if not applicable. */
            nostrLiveSeeds: null,
            /** Collaborators: map inviteePub → role (`editor`|`proposer`) after `loadCollaboratorInvites`, or null. */
            treeCollaboratorRoles: null,
            /** Optional inviteePub → username labels from collaborator invites. */
            treeCollaboratorUsernames: null,
            /** Optional normalized username → role for invites matched by account name. */
            treeCollaboratorRolesByUsername: null,
            /** When viewing a composed tree (árbol): scope for progress + navigation. */
            treeContext: null,
            /** When opening from a manual bookmark (search bookmarks list), jump to that section. */
            lessonOpenHint: null,
            /** WebTorrent seeder mode (optional). */
            webtorrentSeeder: { running: false, total: 0, done: 0, peers: 0 },
            /** Post-load nudge for optional encrypted cloud sync. */
            cloudSyncBanner: null,
            /** Unread creator moderation alerts (reports / legal on published trees). */
            creatorModerationAlerts: [],
            creatorModerationUnreadCount: 0,
            graphUi: null,
        };
    }

    get ui() {
        const isEs = normalizeAppLangCode(this.state.lang) === 'ES';
        const bootStub = isEs ? ES_UI_BOOT_STUB : EN_UI_BOOT_STUB;
        const data = this.state.i18nData;
        return new Proxy(data || bootStub, {
            get: (_target, prop) => {
                const key = String(prop);
                if (data && Object.prototype.hasOwnProperty.call(data, key) && data[key] != null) {
                    return data[key];
                }
                if (Object.prototype.hasOwnProperty.call(bootStub, key) && bootStub[key] != null) {
                    return bootStub[key];
                }
                if (key === 'ariaDesktopMainNav') return isEs ? 'Navegación principal' : 'Primary navigation';
                if (key === 'loading') return isEs ? 'Cargando…' : 'Loading...';
                if (key === 'appTitle') return 'Arborito';
                let clean = key.replace(/^nav/, '');
                clean = clean.replace(/([A-Z])/g, ' $1').trim();
                return clean;
            }
        });
    }

    get availableLanguages() {
        return AVAILABLE_LANGUAGES;
    }

    get currentLangInfo() {
        return AVAILABLE_LANGUAGES.find((l) => l.code === this.state.lang);
    }

    /** @param {unknown} modal */
    _isSageModal(modal) {
        if (!modal) return false;
        if (modal === 'sage') return true;
        return typeof modal === 'object' && modal.type === 'sage';
    }

    _closeSageHost() {
        if (typeof document === 'undefined') return;
        if (isSagePointerGuarded()) return;
        document.documentElement.classList.remove('arborito-sage-open');
        const el = getPanelRef('sage');
        if (el?.isVisible && typeof el.hide === 'function') {
            el.hide();
        }
    }

    _sageMayShow() {
        const { modal, previewNode, modalOverlay, viewMode } = this.state;
        return (
            this._isSageModal(modal) &&
            !previewNode &&
            !modalOverlay &&
            viewMode !== 'certificates'
        );
    }

    update(partialState) {
        if (!partialState || Object.keys(partialState).length === 0) return;
        if ('modal' in partialState) {
            this._prevModal = this.state.modal;
            const prevType = modalType(this.state.modal);
            const nextType = modalType(partialState.modal);
            if (!partialState.modal) {
                this._modalShellSession = null;
                this._modalShellPainted = false;
            } else if (nextType !== prevType) {
                this._modalShellSession = nextType;
                this._modalShellPainted = false;
            }
        }
        const merged = { ...partialState };
        if (
            'modal' in merged &&
            !merged.modal &&
            this._isSageModal(this.state.modal) &&
            isSagePointerGuarded()
        ) {
            merged.modal = this.state.modal;
        }
        if ('modal' in merged && !('modalOverlay' in merged)) {
            merged.modalOverlay = null;
        }
        if (
            (('previewNode' in merged && merged.previewNode) ||
                ('modalOverlay' in merged && merged.modalOverlay) ||
                ('viewMode' in merged && merged.viewMode === 'certificates')) &&
            this._isSageModal(this.state.modal)
        ) {
            merged.modal = null;
        }
        this.state = { ...this.state, ...merged };
        patchDomainSlicesFromPartial(merged, this.state);
        if (!this._sageMayShow()) {
            this._closeSageHost();
        }
        if ('theme' in partialState) {
            const t = this.state.theme;
            applyArboritoTheme(t === 'dark' ? 'dark' : 'light');
            if (this._persistThemePreference && (t === 'dark' || t === 'light')) {
                localStorage.setItem('arborito-theme', t);
            }
            this._persistThemePreference = false;
        }
        if ('lang' in partialState) {
            localStorage.setItem('arborito-lang', this.state.lang);
            try {
                if (typeof document !== 'undefined') {
                    const lc = String(this.state.lang || 'EN').toLowerCase();
                    document.documentElement.lang = lc.startsWith('es') ? 'es' : 'en';
                }
            } catch {
                /* ignore */
            }
        }
        /* Must run before the state-change microtask: the graph and the CSS read this class on the same tick. */
        if ('constructionMode' in partialState && typeof document !== 'undefined') {
            const enabling = !!this.state.constructionMode;
            document.documentElement.classList.toggle('arborito-construction-mobile', enabling);
            if (!enabling) {
                this.state.constructionEditFocus = null;
                this.state.constructionLockedBranchRefId = null;
                delete document.documentElement.dataset.arboritoConstructionAbout;
            }
            void getConstructionSync().then((mod) => {
                mod.afterConstructionModeMutation(this, { entering: enabling });
            });
        }
        /* Edit-lock during a public publish: drives a CSS overlay over the
         * construction panel, the graph, and the modals so the user can't
         * mutate the tree while half its chunks are already on the network.
         * Synchronous (not microtask) so the lock visibly engages on the same
         * frame the publish promise starts. */
        if ('publishingTree' in partialState && typeof document !== 'undefined') {
            document.documentElement.classList.toggle(
                'arborito-publishing-tree',
                !!this.state.publishingTree
            );
        }
        if (typeof document !== 'undefined' && shouldSyncMobileTreeShell(partialState)) {
            const sb = getPanelRef('sidebar');
            syncMobileTreeShellClass(this, { mobileMoreOpen: !!(sb && sb.isMobileMenuOpen) });
            syncLessonReaderChromeClass(this);
        }
        const skipGlobalBus = shouldSkipGlobalStateChange(partialState);
        if (!this._pendingUpdate) {
            this._pendingUpdate = true;
            queueMicrotask(() => {
                this._pendingUpdate = false;
                /* Domain slices sync synchronously in patchDomainSlicesFromPartial.
                 * Skip the global bus on tree taps and modal open/close. */
                if (!skipGlobalBus) {
                    this.dispatchEvent(new CustomEvent('state-change', { detail: this.value }));
                    syncReactI18nSnapshot(this);
                } else if (isModalOnlyPartial(partialState)) {
                    this.dispatchEvent(
                        new CustomEvent('arborito-modal-change', {
                            detail: { modal: this.state.modal },
                        })
                    );
                }
            });
        }
    }

    notify(msg, isError = false) {
        if (isError) {
            this.update({ lastErrorMessage: msg });
            setTimeout(() => this.update({ lastErrorMessage: null }), 4000);
        } else {
            this.update({ lastActionMessage: msg });
            setTimeout(() => this.update({ lastActionMessage: null }), 3000);
        }
    }

    showDialog(opts) {
        return showDialogLifecycle(this, opts);
    }

    showExportSnapshotsPickDialog(opts) {
        return showExportSnapshotsPickDialogLifecycle(this, opts);
    }

    closeDialog(result) {
        return closeDialogLifecycle(this, result);
    }

    alert(body, title, opts) {
        return alertLifecycle(this, body, title, opts);
    }

    confirm(body, title, danger = false) {
        return confirmLifecycle(this, body, title, danger);
    }

    acknowledge(opts) {
        return acknowledgeLifecycle(this, opts);
    }

    prompt(body, placeholder = '', title, confirmText) {
        return promptLifecycle(this, body, placeholder, title, confirmText);
    }

    async loadLanguage(langCode) {
        return loadLanguageOnStore(this, langCode);
    }

    async setLanguage(lang, opts = {}) {
        return setLanguageOnStore(this, lang, opts);
    }

    setTheme(theme, options = {}) {
        return setThemeOnStore(this, theme, options);
    }

    toggleTheme() {
        return toggleThemeOnStore(this);
    }

    async openNodeFromMobileTree(nodeId) {
        const node = this.findNode(nodeId);
        if (!node) return;
        if (node.type === 'leaf' || node.type === 'exam') {
            await this.navigateTo(nodeId, node);
        } else {
            await this.toggleNode(nodeId);
        }
    }

    _nudgeSageHost() {
        return nudgeSageHostOnStore(this);
    }

    async _ensureSageHostReady() {
        return ensureSageHostReadyOnStore(this);
    }

    openSageModal(payload) {
        return openSageModalOnStore(this, payload);
    }

    async _openSageModal(payload) {
        return openSageModalOnStore(this, payload);
    }

    setModal(modal) {
        return openModal(modal);
    }

    dismissModal(opts = {}) {
        return dismissModalOnStore(this, opts);
    }

    leaveCertificatesView(opts = {}) {
        return leaveCertificatesViewOnStore(this, opts);
    }

    setViewMode(viewMode, options = {}) {
        return setViewModeOnStore(this, viewMode, options);
    }
}

