import { AVAILABLE_LANGUAGES, normalizeAppLangCode } from './i18n.js';
import { fetchLocalePack } from './i18n-runtime.js';
import { afterConstructionModeMutation } from './shell/construction-sync.js';
import { syncMobileTreeShellClass } from './utils/mobile-tree-shell-class.js';

/**
 * UI state, i18n, modals, theme — base class for the app store.
 */
export class UIStore extends EventTarget {
    constructor() {
        super();
        this._dialogResolver = null;
        /** @type {unknown[]} When a global dialog opens, previous `modal` is pushed here and restored on close. */
        this._dialogParentStack = [];
        this._pendingUpdate = false;
        let initialLang = localStorage.getItem('arborito-lang');
        if (!initialLang) {
            const browserLang = navigator.language.split('-')[0].toUpperCase();
            const supportedLang = AVAILABLE_LANGUAGES.find((l) => l.code === browserLang);
            initialLang = supportedLang ? supportedLang.code : 'EN';
        }
        initialLang = normalizeAppLangCode(initialLang);
        this.state = {
            theme: localStorage.getItem('arborito-theme') || 'light',
            lang: initialLang,
            i18nData: null,
            communitySources: [],
            activeSource: null,
            availableReleases: [],
            manifestUrlAttempted: null,
            pendingUntrustedSource: null,
            data: null,
            rawGraphData: null,
            searchCache: {},
            /** `idle` | `indexing` | `ready` | `error` — local search index (IndexedDB). */
            searchIndexStatus: 'idle',
            searchIndexError: null,
            path: [],
            ai: { status: 'idle', progress: '', messages: [] },
            selectedNode: null,
            previewNode: null,
            /** Generic (language, etc.); the graph does NOT use this for the tree. */
            loading: false,
            /** Curriculum pipeline only — drives “Loading open knowledge map…”. */
            treeHydrating: false,
            error: null,
            lastErrorMessage: null,
            viewMode: 'explore',
            certificatesFromMobileMore: false,
            constructionMode: false,
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
            /** WebTorrent seeder mode (optional). */
            webtorrentSeeder: { running: false, total: 0, done: 0, peers: 0 },
            /** Post-load nudge for optional encrypted cloud sync. */
            cloudSyncBanner: null
        };
    }

    get ui() {
        if (!this.state.i18nData) {
            return new Proxy({}, {
                get: (target, prop) => {
                    if (
                        prop === 'uiTourSteps' ||
                        prop === 'uiTourStepsMobile' ||
                        prop === 'uiTourStepsSourcesPicker'
                    )
                        return [];
                    const key = String(prop);
                    if (key === 'ariaDesktopMainNav') return 'Primary navigation';
                    if (key === 'loading') return 'Loading...';
                    if (key === 'appTitle') return 'Arborito';
                    let clean = key.replace(/^nav/, '');
                    clean = clean.replace(/([A-Z])/g, ' $1').trim();
                    return clean;
                }
            });
        }
        return this.state.i18nData;
    }

    get availableLanguages() {
        return AVAILABLE_LANGUAGES;
    }

    get currentLangInfo() {
        return AVAILABLE_LANGUAGES.find((l) => l.code === this.state.lang);
    }

    update(partialState) {
        const merged = { ...partialState };
        if ('modal' in merged && !('modalOverlay' in merged)) {
            merged.modalOverlay = null;
        }
        this.state = { ...this.state, ...merged };
        if ('theme' in partialState) {
            const t = this.state.theme;
            document.documentElement.classList.toggle('dark', t === 'dark');
            if (t === 'dark' || t === 'light') {
                localStorage.setItem('arborito-theme', t);
            }
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
        /* Debe ir antes del microtask de state-change: el grafo y el CSS leen esta clase en el mismo tick. */
        if ('constructionMode' in partialState && typeof document !== 'undefined') {
            document.documentElement.classList.toggle(
                'arborito-construction-mobile',
                !!this.state.constructionMode
            );
            afterConstructionModeMutation(this);
        }
        if (typeof document !== 'undefined') {
            const sb = document.querySelector('arborito-sidebar');
            syncMobileTreeShellClass(this, { mobileMoreOpen: !!(sb && sb.isMobileMenuOpen) });
        }
        if (!this._pendingUpdate) {
            this._pendingUpdate = true;
            queueMicrotask(() => {
                this._pendingUpdate = false;
                this.dispatchEvent(new CustomEvent('state-change', { detail: this.value }));
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

    showDialog({
        type = 'alert',
        title = '',
        body = '',
        bodyHtml = false,
        placeholder = '',
        confirmText = 'OK',
        cancelText = 'Cancel',
        danger = false,
        choices = undefined,
        exportSnapshots = undefined,
        selectAllText = undefined,
        selectNoneText = undefined
    }) {
        return new Promise((resolve) => {
            this._dialogResolver = resolve;
            this._dialogParentStack.push(this.state.modal);
            this.setModal({
                type: 'dialog',
                dialogType: type,
                title,
                body,
                bodyHtml,
                placeholder,
                confirmText,
                cancelText,
                danger,
                choices,
                exportSnapshots,
                selectAllText,
                selectNoneText
            });
        });
    }

    /**
     * Pick saved versions to include in the .arborito export (checkboxes, all selected by default).
     * Close with X / backdrop / “Back” → `null`. Confirm → `string[]` of checked ids (may be `[]`).
     */
    showExportSnapshotsPickDialog({
        title = '',
        body = '',
        snapshots = [],
        confirmText = 'Export',
        selectAllText = 'All',
        selectNoneText = 'None'
    }) {
        return this.showDialog({
            type: 'exportSnapshots',
            title,
            body,
            confirmText,
            cancelText: 'Cancel',
            exportSnapshots: snapshots,
            selectAllText,
            selectNoneText,
            danger: false
        });
    }

    closeDialog(result) {
        if (this._dialogResolver) {
            this._dialogResolver(result);
            this._dialogResolver = null;
        }
        const previousModal = this._dialogParentStack.pop();
        this.setModal(previousModal !== undefined ? previousModal : null);
    }

    async alert(body, title) {
        const t =
            title !== undefined && title !== null
                ? title
                : ((this.state.i18nData && this.state.i18nData.dialogNoticeTitle) != null ? (this.state.i18nData.dialogNoticeTitle) : 'Notice');
        return this.showDialog({ type: 'alert', title: t, body });
    }

    async confirm(body, title, danger = false) {
        const t =
            title !== undefined && title !== null
                ? title
                : ((this.state.i18nData && this.state.i18nData.dialogConfirmTitle) != null ? (this.state.i18nData.dialogConfirmTitle) : 'Confirm');
        return this.showDialog({ type: 'confirm', title: t, body, danger });
    }

    async prompt(body, placeholder = '', title) {
        const t =
            title !== undefined && title !== null
                ? title
                : ((this.state.i18nData && this.state.i18nData.dialogInputTitle) != null ? (this.state.i18nData.dialogInputTitle) : 'Input');
        return this.showDialog({ type: 'prompt', title: t, body, placeholder });
    }

    async loadLanguage(langCode) {
        const lang = normalizeAppLangCode(langCode);
        try {
            const data = await fetchLocalePack(lang);
            this.update({ i18nData: data });
        } catch (e) {
            console.error(`Language load failed for ${lang}`, e);
            if (lang !== 'EN') await this.loadLanguage('EN');
            else {
                this.update({
                    i18nData: {
                        appTitle: 'Arborito (Recovery)',
                        loading: 'Loading...',
                        errorTitle: 'Error',
                        errorNoTrees: 'Language Error'
                    }
                });
            }
        }
    }

    /**
     * Change UI language and optionally reload the active tree.
     * Do not dismiss the language / onboarding modal before this promise settles: if `modal.type` is
     * `language` or `onboarding`, `goHome()` is skipped until the user leaves that flow.
     */
    async setLanguage(lang) {
        const target = normalizeAppLangCode(lang);
        if (normalizeAppLangCode(this.state.lang) === target && this.state.i18nData) return;

        const modalSnap = this.state.modal;
        const modalType = typeof modalSnap === 'string' ? modalSnap : (modalSnap && modalSnap.type);
        const deferNavigation =
            modalType === 'language' ||
            modalType === 'onboarding';

        this.update({ loading: true, error: null });

        let appliedLang = target;
        /** @type {object | null} */
        let pack = null;
        try {
            pack = await fetchLocalePack(target);
        } catch (e) {
            console.error('[Arborito] setLanguage: pack load failed', target, e);
            if (target !== 'EN') {
                try {
                    appliedLang = 'EN';
                    pack = await fetchLocalePack('EN', { bypassCache: true });
                } catch (e2) {
                    console.error('[Arborito] setLanguage: EN fallback failed', e2);
                    this.update({ loading: false, error: String((e && e.message) || e) });
                    return;
                }
            } else {
                this.update({ loading: false, error: String((e && e.message) || e) });
                return;
            }
        }

        this.update({
            lang: appliedLang,
            i18nData: pack,
            searchCache: {}
        });

        try {
            if (this.state.activeSource) await this.loadData(this.state.activeSource, false);
            else this.update({ loading: false });
        } catch (e) {
            console.error('[Arborito] setLanguage: curriculum reload failed', e);
            this.update({ loading: false, error: String((e && e.message) || e) });
        }

        if (!deferNavigation) this.goHome();
    }

    setTheme(theme) {
        this.update({ theme });
    }

    toggleTheme() {
        const next = this.state.theme === 'light' ? 'dark' : 'light';
        this.update({ theme: next });
        requestAnimationFrame(() => {
            document.documentElement.classList.toggle('dark', this.state.theme === 'dark');
        });
    }

    async openNodeFromMobileTree(nodeId) {
        const node = this.findNode(nodeId);
        if (!node) return;
        if (node.type === 'leaf' || node.type === 'exam') {
            if (
                !node.content &&
                (node.contentPath ||
                    (node.treeLazyContent && node.treeContentKey))
            ) {
                await this.loadNodeContent(node);
            }
            this.update({ selectedNode: node, previewNode: null, modal: null });
            if (typeof this.afterLessonOpened === 'function') {
                this.afterLessonOpened(node);
            }
        } else {
            await this.toggleNode(nodeId);
        }
    }

    setModal(modal) {
        this.update({ modal });
    }

    dismissModal(opts = {}) {
        const m = this.state.modal;
        const openedFromMore = m && typeof m === 'object' && m.fromMobileMore;
        const openedFromConstructionMore = m && typeof m === 'object' && m.fromConstructionMore;
        const openedFromSources = m && typeof m === 'object' && m.fromSources;
        const returnToMore = opts.returnToMore !== false;
        if (openedFromSources && returnToMore) {
            const payload = { type: 'sources' };
            if (openedFromConstructionMore) payload.fromConstructionMore = true;
            if (openedFromMore) payload.fromMobileMore = true;
            if (m.sourcesFocusTab === 'local') payload.focusTab = 'local';
            this.setModal(payload);
            return;
        }
        /*
         * Construction: reopen “More” behind the modal, no scrim fade-in animation, and
         * clear the modal on the next frame — so the scrim is opaque before paint without the modal
         * (Sources / Versions / language used to fade in from 0 and the graph flickered).
         */
        if (openedFromConstructionMore && returnToMore) {
            const cp = document.querySelector('arborito-construction-panel');
            if (cp && typeof cp.openConstructionMoreMenu === 'function') {
                cp.openConstructionMoreMenu({ instant: true });
            }
            // By default defer to the next frame to avoid graph flicker.
            // If the caller opens another modal in the same stack (e.g. confirm publish),
            // a later rAF would wipe that modal: use `syncClose: true` in `dismissModal`.
            if (opts.syncClose) {
                this.setModal(null);
            } else {
                requestAnimationFrame(() => this.setModal(null));
            }
            return;
        }
        const fromConstructLang =
            m && typeof m === 'object' && m.type === 'pick-curriculum-lang' && m.fromConstructionLangModal;
        if (fromConstructLang && returnToMore) {
            this.setModal({ type: 'construction-curriculum-lang' });
            return;
        }
        if (openedFromMore && returnToMore) {
            const sb = document.querySelector('arborito-sidebar');
            if (sb && typeof sb.openMobileMoreMenu === 'function') sb.openMobileMoreMenu();
        }
        this.setModal(null);
    }

    leaveCertificatesView(opts = {}) {
        if (this.state.viewMode !== 'certificates') return;
        const fromMore = this.state.certificatesFromMobileMore;
        const returnToMore = opts.returnToMore !== false;
        if (fromMore && returnToMore) {
            const sb = document.querySelector('arborito-sidebar');
            if (sb && typeof sb.openMobileMoreMenu === 'function') sb.openMobileMoreMenu();
        }
        this.update({ viewMode: 'explore', certificatesFromMobileMore: false });
    }

    setViewMode(viewMode, options = {}) {
        if (viewMode === 'certificates') {
            this.update({
                viewMode: 'certificates',
                modal: null,
                certificatesFromMobileMore: !!options.fromMobileMore
            });
            return;
        }
        if (viewMode === 'explore' && this.state.viewMode === 'certificates') {
            this.leaveCertificatesView(options);
            return;
        }
        this.update({ viewMode });
    }
}
