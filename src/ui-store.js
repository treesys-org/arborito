import { AVAILABLE_LANGUAGES } from './i18n.js';

/**
 * UI state, i18n, modals, theme — base class for the app store.
 */
export class UIStore extends EventTarget {
    constructor() {
        super();
        this._dialogResolver = null;
        this._pendingUpdate = false;
        let initialLang = localStorage.getItem('arborito-lang');
        if (!initialLang) {
            const browserLang = navigator.language.split('-')[0].toUpperCase();
            const supportedLang = AVAILABLE_LANGUAGES.find((l) => l.code === browserLang);
            initialLang = supportedLang ? supportedLang.code : 'EN';
        }
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
            path: [],
            ai: { status: 'idle', progress: '', messages: [] },
            selectedNode: null,
            previewNode: null,
            loading: true,
            error: null,
            lastErrorMessage: null,
            viewMode: 'explore',
            certificatesFromMobileMore: false,
            constructionMode: false,
            modal: null,
            lastActionMessage: null,
            githubUser: null
        };
    }

    get ui() {
        if (!this.state.i18nData) {
            return new Proxy({}, {
                get: (target, prop) => {
                    if (prop === 'welcomeSteps')
                        return [{ title: 'Loading...', text: '...', icon: '...' }];
                    if (prop === 'uiTourSteps' || prop === 'uiTourStepsMobile') return [];
                    const key = String(prop);
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
        this.state = { ...this.state, ...partialState };
        if ('theme' in partialState) {
            const t = this.state.theme;
            document.documentElement.classList.toggle('dark', t === 'dark');
            if (t === 'dark' || t === 'light') {
                localStorage.setItem('arborito-theme', t);
            }
        }
        if (partialState.lang) {
            localStorage.setItem('arborito-lang', this.state.lang);
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
        placeholder = '',
        confirmText = 'OK',
        cancelText = 'Cancel',
        danger = false
    }) {
        return new Promise((resolve) => {
            this._dialogResolver = resolve;
            this.setModal({
                type: 'dialog',
                dialogType: type,
                title,
                body,
                placeholder,
                confirmText,
                cancelText,
                danger
            });
        });
    }

    closeDialog(result) {
        if (this._dialogResolver) {
            this._dialogResolver(result);
            this._dialogResolver = null;
        }
        this.setModal(null);
    }

    async alert(body, title) {
        const t =
            title !== undefined && title !== null
                ? title
                : (this.state.i18nData?.dialogNoticeTitle ?? 'Notice');
        return this.showDialog({ type: 'alert', title: t, body });
    }

    async confirm(body, title, danger = false) {
        const t =
            title !== undefined && title !== null
                ? title
                : (this.state.i18nData?.dialogConfirmTitle ?? 'Confirm');
        return this.showDialog({ type: 'confirm', title: t, body, danger });
    }

    async prompt(body, placeholder = '', title) {
        const t =
            title !== undefined && title !== null
                ? title
                : (this.state.i18nData?.dialogInputTitle ?? 'Input');
        return this.showDialog({ type: 'prompt', title: t, body, placeholder });
    }

    async loadLanguage(langCode) {
        try {
            const path = `./locales/${langCode.toLowerCase()}.json`;
            const res = await fetch(path, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`Missing language file: ${path}`);
            const data = await res.json();
            this.update({ i18nData: data });
        } catch (e) {
            console.error(`Language load failed for ${langCode}`, e);
            if (langCode !== 'EN') await this.loadLanguage('EN');
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

    async setLanguage(lang) {
        if (this.state.lang === lang) return;
        const isWelcomeOpen = this.state.modal === 'welcome' || this.state.modal === 'tutorial';
        this.update({ loading: true, error: null });
        try {
            const path = `./locales/${lang.toLowerCase()}.json`;
            const res = await fetch(path, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`Missing language file: ${path}`);
            const i18nData = await res.json();
            this.update({ lang, i18nData, searchCache: {} });
            if (this.state.activeSource) await this.loadData(this.state.activeSource, false);
            else this.update({ loading: false });
            if (!isWelcomeOpen) this.goHome();
        } catch (e) {
            this.update({ loading: false, error: `Language error: ${e.message}` });
            if (lang !== 'EN') this.setLanguage('EN');
        }
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
            if (!node.content && node.contentPath) {
                await this.loadNodeContent(node);
            }
            this.update({ selectedNode: node, previewNode: null, modal: null });
        } else {
            await this.toggleNode(nodeId);
        }
    }

    setModal(modal) {
        this.update({ modal });
    }

    _reopenMobileMoreMenu() {
        queueMicrotask(() => {
            const el = document.querySelector('arborito-sidebar');
            if (el && typeof el.openMobileMoreMenu === 'function') el.openMobileMoreMenu();
        });
    }

    dismissModal(opts = {}) {
        const m = this.state.modal;
        const openedFromMore = m && typeof m === 'object' && m.fromMobileMore;
        const returnToMore = opts.returnToMore !== false;
        this.setModal(null);
        if (openedFromMore && returnToMore) this._reopenMobileMoreMenu();
    }

    leaveCertificatesView(opts = {}) {
        if (this.state.viewMode !== 'certificates') return;
        const fromMore = this.state.certificatesFromMobileMore;
        const returnToMore = opts.returnToMore !== false;
        this.update({ viewMode: 'explore', certificatesFromMobileMore: false });
        if (fromMore && returnToMore) this._reopenMobileMoreMenu();
    }

    toggleConstructionMode() {
        this.update({ constructionMode: !this.state.constructionMode });
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
