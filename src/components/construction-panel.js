
import { store } from '../store.js';
import { github } from '../services/github.js';
import { fileSystem } from '../services/filesystem.js';

/** Etiqueta corta para tabs del dock (misma línea que Home / Search). */
function shortDockLabel(s) {
    const t = String(s || '').trim();
    if (!t) return '…';
    const first = t.split(/\s+/)[0];
    return first.length <= 12 ? first : `${first.slice(0, 10)}…`;
}

class ArboritoConstructionPanel extends HTMLElement {
    constructor() {
        super();
        this.state = {
            activePopover: null, 
            loading: false,
            isLoggingIn: false,
            loginError: null,
            repoInfo: null
        };
        this.lastRenderKey = null;
        this.isInitialized = false;
        
        this.clickOutsideHandler = this.handleClickOutside.bind(this);
    }

    connectedCallback() {
        if (!this.isInitialized) {
            this.renderStructure();
            this.isInitialized = true;
        }
        
        this.updateView();
        this._storeListener = () => this.checkRender();
        store.addEventListener('state-change', this._storeListener);
        document.addEventListener('click', this.clickOutsideHandler);
        
        if (store.value.constructionMode && store.value.githubUser) {
            this.fetchData();
        }
    }
    
    disconnectedCallback() {
        if (this._storeListener) {
            store.removeEventListener('state-change', this._storeListener);
        }
        document.removeEventListener('click', this.clickOutsideHandler);
    }

    handleClickOutside(e) {
        if (this.state.activePopover && !this.contains(e.target)) {
            this.state.activePopover = null;
            this.updateView();
        }
    }

    checkRender() {
        const { constructionMode } = store.value;
        if (!constructionMode) {
            this.style.display = 'none';
            return;
        }
        this.style.display = 'flex';
        this.updateView();
    }

    async fetchData() {
        if (fileSystem.isLocal || !store.value.githubUser) return;
        this.state.loading = true;
        this.updateView();
        try {
            this.state.repoInfo = github.getRepositoryInfo();
        } catch (e) {
            console.error("Fetch Error", e);
        } finally {
            this.state.loading = false;
            this.updateView();
        }
    }

    togglePopover(name) {
        this.state.activePopover = (this.state.activePopover === name) ? null : name;
        this.updateView();
    }

    async handleLogin() {
        const inp = this.querySelector('#inp-gh-token');
        if (!inp) return;
        const token = inp.value.trim();
        if (!token) return;

        this.state.isLoggingIn = true;
        this.state.loginError = null;
        this.updateView();

        try {
            const user = await github.initialize(token);
            if (user) {
                localStorage.setItem('arborito-gh-token', token);
                store.update({ githubUser: user });
                this.state.activePopover = null; 
                this.fetchData();
            } else {
                throw new Error("Invalid Token");
            }
        } catch (e) {
            this.state.loginError = "Auth Failed";
        } finally {
            this.state.isLoggingIn = false;
            this.updateView();
        }
    }

    handleLogout() {
        github.disconnect();
        localStorage.removeItem('arborito-gh-token');
        store.update({ githubUser: null });
        this.state.activePopover = null;
        this.updateView();
    }

    handleSave() {
        if (fileSystem.isLocal) {
            store.userStore.persist();
            store.notify("✅ " + (store.ui.conLocalSaved || "Local Garden Saved"));
        } else {
            store.notify("ℹ️ " + (store.ui.conRemoteSaved || "Remote changes are saved per-file."));
        }
    }

    async handleRevert() {
        const ui = store.ui;
        if (await store.confirm(ui.conRevertConfirm || "Revert to last saved state? Unsaved changes will be lost.", ui.conRevertTitle || "Revert Changes")) {
            store.loadData(store.value.activeSource, store.value.lang, true);
            store.notify("↩️ " + (ui.conReverted || "Changes Reverted"));
        }
    }

    renderStructure() {
        this.className = 'construction-panel-host';

        this.innerHTML = `
            <div class="construction-panel-stack">
                <div id="popover-slot" class="construction-panel-popover flex justify-center empty:hidden w-full"></div>
                <div id="dock-container" class="construction-panel-sheet" data-construction-dock></div>
            </div>
        `;
    }

    updateView() {
        if (!this.isInitialized) return;

        const { activeSource, githubUser } = store.value;
        const { activePopover, loading, isLoggingIn, loginError } = this.state;
        const escHtml = (s) =>
            String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        const isLocal = activeSource && (activeSource.type === 'local' || (activeSource.url && activeSource.url.startsWith('local://')));
        
        const isContributor = isLocal || !!githubUser;
        const ui = store.ui;

        const renderKey = JSON.stringify({
            activePopover, loading, isLoggingIn, loginError,
            sourceId: activeSource?.id,
            sourceName: activeSource?.name,
            user: githubUser?.login,
            isLocal,
            hasGithubUser: !!githubUser
        });

        if (renderKey === this.lastRenderKey) return;
        this.lastRenderKey = renderKey;

        const popoverSlot = this.querySelector('#popover-slot');
        if (activePopover === 'login' && !githubUser) {
            popoverSlot.innerHTML = `
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-4 w-[min(20rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1rem)] animate-in slide-in-from-bottom-4 fade-in origin-bottom">
                    <h4 class="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest mb-3">${ui.conConnectRepo || "Connect Repository"}</h4>
                    <input id="inp-gh-token" type="password" placeholder="${ui.conTokenPlaceholder || "GitHub Personal Token..."}" class="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white mb-2 focus:ring-2 focus:ring-emerald-500 outline-none">
                    ${loginError ? `<p class="text-xs text-red-500 mb-2 font-bold">${loginError}</p>` : ''}
                    <button id="btn-login-action" class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs">
                        ${isLoggingIn ? (ui.syncing || 'Connecting...') : (ui.conLogin || 'Connect')}
                    </button>
                    <p class="text-[9px] text-slate-500 mt-2">${ui.conTokenScope || "Requires 'repo' scope token."}</p>
                </div>`;
                
            const btnLoginAction = popoverSlot.querySelector('#btn-login-action');
            if(btnLoginAction) btnLoginAction.onclick = (e) => { e.stopPropagation(); this.handleLogin(); };
            
        } else {
            popoverSlot.innerHTML = '';
        }

        const dock = this.querySelector('#dock-container');
        const saveL = ui.conSaveTooltip || 'Save';
        const revL = ui.conRevertTooltip || 'Revert';
        const aiL = ui.conAiTooltip || 'AI';
        const govL = ui.conGovTooltip || 'Gov';

        /* Login al final del scroll para quedar a la derecha del todo */
        const parts = [];
        if (isContributor) {
            parts.push(`
                <button type="button" id="btn-save-all" class="cp-dock-tab" title="${escHtml(saveL)}" aria-label="${escHtml(saveL)}">
                    <span class="arborito-mob-tab__icon" aria-hidden="true">💾</span>
                    <span class="arborito-mob-tab__label">${escHtml(shortDockLabel(saveL))}</span>
                </button>
                <button type="button" id="btn-revert" class="cp-dock-tab" title="${escHtml(revL)}" aria-label="${escHtml(revL)}">
                    <span class="arborito-mob-tab__icon" aria-hidden="true">↩️</span>
                    <span class="arborito-mob-tab__label">${escHtml(shortDockLabel(revL))}</span>
                </button>
                <button type="button" id="btn-architect" class="cp-dock-tab cp-dock-tab--accent" title="${escHtml(aiL)}" aria-label="${escHtml(aiL)}">
                    <span class="arborito-mob-tab__icon cp-dock-tab__icon-badge" aria-hidden="true">🦉<span class="cp-dock-tab__mini" aria-hidden="true">⛑️</span></span>
                    <span class="arborito-mob-tab__label">${escHtml(shortDockLabel(aiL))}</span>
                </button>
                <button type="button" id="btn-governance" class="cp-dock-tab cp-dock-tab--blue" title="${escHtml(govL)}" aria-label="${escHtml(govL)}">
                    <span class="arborito-mob-tab__icon" aria-hidden="true">🏛️</span>
                    <span class="arborito-mob-tab__label">${escHtml(shortDockLabel(govL))}</span>
                </button>`);
        }
        if (!isLocal) {
            if (!githubUser) {
                parts.push(`
                <button type="button" id="btn-login-toggle" class="cp-dock-tab cp-dock-tab--login" title="${ui.conLoginAction || 'Login'}" aria-label="${ui.conLoginAction || 'Login'}">
                    <span class="arborito-mob-tab__icon" aria-hidden="true">🔑</span>
                    <span class="arborito-mob-tab__label">${escHtml(shortDockLabel(ui.conLoginAction || 'Login'))}</span>
                </button>`);
            } else {
                parts.push(`
                <button type="button" id="btn-logout" class="cp-dock-tab cp-dock-tab--logout" title="${ui.conLogout || 'Logout'}" aria-label="${ui.conLogout || 'Logout'}">
                    <span class="arborito-mob-tab__icon" aria-hidden="true">🚪</span>
                    <span class="arborito-mob-tab__label">${escHtml(shortDockLabel(ui.conLogout || 'Out'))}</span>
                </button>`);
            }
        }
        const scrollInner = parts.join('');

        dock.innerHTML = `
            <div class="cp-dock-row">
                <button type="button" id="btn-back-construct" class="cp-dock-tab cp-dock-tab--edge" title="${ui.navBack || 'Back'}" aria-label="${ui.navBack || 'Back'}">
                    <span class="arborito-mob-tab__icon" aria-hidden="true">←</span>
                    <span class="arborito-mob-tab__label">${escHtml(shortDockLabel(ui.navBack || 'Back'))}</span>
                </button>
                <div class="cp-dock-scroll custom-scrollbar" role="group" aria-label="${escHtml(ui.navConstruct || 'Construction')}">
                    ${scrollInner}
                </div>
            </div>
        `;

        const bind = (id, fn) => {
            const el = dock.querySelector(id);
            if (el) el.onclick = (e) => { e.stopPropagation(); fn(e); };
        };

        bind('#btn-back-construct', () => store.toggleConstructionMode());

        if (isContributor) {
            bind('#btn-architect', () => store.setModal({ type: 'sage', mode: 'architect' }));
            bind('#btn-governance', () => store.setModal({ type: 'contributor', tab: 'access' }));
            bind('#btn-save-all', () => this.handleSave());
            bind('#btn-revert', () => this.handleRevert());
        }
        
        if (!isLocal) {
            if (!githubUser) bind('#btn-login-toggle', () => this.togglePopover('login'));
            else bind('#btn-logout', () => this.handleLogout());
        }
    }
}

customElements.define('arborito-construction-panel', ArboritoConstructionPanel);
