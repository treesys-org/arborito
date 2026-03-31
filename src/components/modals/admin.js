
import { store } from '../../store.js';
import { fileSystem } from '../../services/filesystem.js';
import { github } from '../../services/github.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js'; 

class ArboritoAdminPanel extends HTMLElement {
    constructor() {
        super();
        this.state = {
            adminTab: 'proposals', 
            isAdmin: false,
            canWrite: false,
            isRepoHealthy: true, 
            adminData: { prs: [], users: [], gov: null },
            accessRules: [], 
            accessTree: null, 
            selectedFolderPath: null, 
            expandedPaths: new Set(['/']), 
            isDirty: false, 
            isLoggingIn: false,
            loginError: null,
            releases: [],
            releasesLoading: false,
            newVersionName: '',
            creatingRelease: false,
            loadingTree: false
        };
        this.isInitialized = false;
        
        window.arboritoAdminToggleFolder = (path) => this.toggleFolder(path);
        window.arboritoAdminSelectFolder = (path) => this.selectAccessFolder(path);
    }

    connectedCallback() {
        const modalState = store.value.modal;
        if (modalState && modalState.tab) {
            this.state.adminTab = modalState.tab;
        }

        if (!this.isInitialized) {
            this.renderSkeleton();
            this.isInitialized = true;
        }
        
        this.updateContent();

        this.subscription = () => {
            this.updateContent();
            if(store.value.activeSource && !this.state.accessTree) this.initData();
        };
        store.addEventListener('state-change', this.subscription);
        
        if (store.value.activeSource) {
            this.initData();
        }
    }
    
    disconnectedCallback() {
        store.removeEventListener('state-change', this.subscription);
        delete window.arboritoAdminToggleFolder;
        delete window.arboritoAdminSelectFolder;
    }

    async initData() {
        if (!fileSystem.isLocal && !store.value.githubUser) return;

        const features = fileSystem.features;
        const isAdmin = features.hasGovernance && store.value.githubUser ? await github.isAdmin() : false;

        this.updateState({ canWrite: features.canWrite, isAdmin: isAdmin });
        
        if (this.state.adminTab === 'archives') this.loadReleases();
        if (this.state.adminTab === 'access') this.loadFolderTree();

        if (!fileSystem.isLocal && features.canWrite) {
            const isHealthy = await github.checkHealth();
            this.updateState({ isRepoHealthy: isHealthy });
            this.loadAdminData();
        }
    }

    async loadAdminData() {
        if (fileSystem.isLocal) return;
        const promises = [github.getPullRequests(), github.getCollaborators()];
        if (fileSystem.features.hasGovernance) promises.push(github.getCodeOwners());
        const results = await Promise.all(promises);
        const prs = results[0] || [];
        const users = results[1] || [];
        const gov = results.length > 2 ? results[2] : null;
        const parsedRules = this.parseGovernance(gov?.content || '');
        this.updateState({ adminData: { prs, users, gov }, accessRules: parsedRules, isDirty: false });
    }

    renderSkeleton() {
        const ui = store.ui;

        // Check Login State First
        if (!fileSystem.isLocal && !store.value.githubUser) {
            this.renderLogin();
            return;
        }

        this.innerHTML = `
        <div class="flex flex-col h-full bg-slate-50 dark:bg-slate-950 relative rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl">
            <!-- Header -->
            <div class="flex flex-col shrink-0 z-20">
                <div class="arborito-float-modal-head arborito-dock-modal-hero flex items-start gap-2 px-4 pt-4 pb-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0 mt-0.5', { tagClass: 'btn-close-panel-mob' })}
                    <div class="w-10 h-10 bg-white/80 dark:bg-slate-800/90 rounded-xl flex items-center justify-center text-xl shrink-0 border border-slate-200/80 dark:border-slate-600">🏛️</div>
                    <div class="min-w-0 flex-1">
                        <h2 id="repo-title" class="arborito-mmenu-subtitle m-0 uppercase leading-tight tracking-tight truncate">Loading...</h2>
                        <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-0.5">${ui.adminConsole || "Admin Console"}</p>
                    </div>
                    ${modalWindowCloseXHtml(ui, 'btn-close-panel-x')}
                </div>
                
                <div class="flex px-4 pb-4 gap-2 overflow-x-auto no-scrollbar">
                    <button data-tab="proposals" class="tab-btn flex-1 py-3 flex items-center justify-center gap-2 font-black uppercase text-xs tracking-widest transition-all rounded-xl">
                        <span>📬</span> ${ui.adminPrs || "Proposals"}
                    </button>
                    <button data-tab="access" class="tab-btn flex-1 py-3 flex items-center justify-center gap-2 font-black uppercase text-xs tracking-widest transition-all rounded-xl">
                        <span>🔐</span> ${ui.adminGovTitle || "Permissions"}
                    </button>
                    <button data-tab="team" class="tab-btn flex-1 py-3 flex items-center justify-center gap-2 font-black uppercase text-xs tracking-widest transition-all rounded-xl">
                        <span>👩‍🏫</span> ${ui.adminTeam || "Maintainers"}
                    </button>
                    <button data-tab="archives" class="tab-btn flex-1 py-3 flex items-center justify-center gap-2 font-black uppercase text-xs tracking-widest transition-all rounded-xl">
                        <span>⏳</span> ${ui.adminVersions || "Versions"}
                    </button>
                </div>
            </div>

            <!-- Content Area -->
            <div id="admin-content" class="flex-1 overflow-hidden relative flex flex-col">
                <!-- Dynamic Content -->
            </div>
        </div>`;

        const dismissPanel = () => store.dismissModal();
        this.querySelector('.btn-close-panel-mob')?.addEventListener('click', dismissPanel);
        const xPanel = this.querySelector('.btn-close-panel-x');
        if (xPanel) xPanel.onclick = dismissPanel;

        this.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => {
                const tab = btn.dataset.tab;
                this.updateState({ adminTab: tab });
                if(tab === 'team' || tab === 'proposals') this.loadAdminData();
                if(tab === 'access') { this.loadAdminData(); this.loadFolderTree(); }
                if(tab === 'archives') this.loadReleases();
            };
        });
        
        // Delegate content clicks
        this.addEventListener('click', (e) => this.handleContentClick(e));
        this.addEventListener('input', (e) => this.handleContentInput(e));
    }

    renderLogin() {
        const ui = store.ui;
        this.innerHTML = `
        <div class="flex flex-col h-full bg-slate-50 dark:bg-slate-950 relative rounded-3xl overflow-hidden shadow-2xl">
            <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 flex items-center gap-2 px-4 pt-4 pb-2">
                ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-close-panel-mob' })}
                <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.contribTitle || "Editor Mode"}</h2>
                ${modalWindowCloseXHtml(ui, 'btn-close-panel-x')}
            </div>
            <div class="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto animate-in fade-in zoom-in duration-300">
                <div class="w-24 h-24 bg-black text-white rounded-3xl flex items-center justify-center text-5xl mb-8 shadow-2xl transform -rotate-6">🐙</div>
                <h2 class="text-3xl font-black text-slate-800 dark:text-white mb-2">${ui.contribTitle || "Editor Mode"}</h2>
                <p class="text-lg text-slate-500 mb-10 font-medium leading-relaxed">${ui.contribDesc || "Help us grow the garden."}</p>
                <input id="inp-token" type="password" placeholder="${ui.contribTokenPlaceholder || "ghp_..."}" class="w-full px-6 py-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 mb-4 focus:border-black dark:focus:border-white outline-none transition-colors text-lg font-bold text-center">
                ${this.state.loginError ? `<p class="text-sm text-red-500 font-bold mb-6 animate-pulse bg-red-50 px-4 py-2 rounded-lg">${this.state.loginError}</p>` : ''}
                <button id="btn-login" class="w-full py-4 bg-black dark:bg-white text-white dark:text-black font-black text-xl rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all mb-6">
                    ${this.state.isLoggingIn ? (ui.syncing || 'Connecting...') : (ui.contribConnect || "Enable Editing")}
                </button>
            </div>
        </div>`;
        
        const dismissLogin = () => store.dismissModal();
        this.querySelector('.btn-close-panel-mob')?.addEventListener('click', dismissLogin);
        const xLogin = this.querySelector('.btn-close-panel-x');
        if (xLogin) xLogin.onclick = dismissLogin;
        this.querySelector('#btn-login').onclick = () => this.handleLogin();
    }

    updateContent() {
        if (!this.isInitialized) return;
        // Check login state again in case user logged out
        if (!fileSystem.isLocal && !store.value.githubUser && !this.querySelector('#btn-login')) {
            this.renderLogin();
            return;
        } else if ((fileSystem.isLocal || store.value.githubUser) && this.querySelector('#btn-login')) {
            this.renderSkeleton(); // Switch back to main view
        }

        const sourceName = store.value.activeSource?.name || 'Garden';
        const titleEl = this.querySelector('#repo-title');
        if(titleEl) titleEl.textContent = sourceName;

        // Update Tab Active States
        this.querySelectorAll('.tab-btn').forEach(btn => {
            const isActive = btn.dataset.tab === this.state.adminTab;
            btn.className = `tab-btn flex-1 py-3 flex items-center justify-center gap-2 font-black uppercase text-xs tracking-widest transition-all rounded-xl ${isActive ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`;
        });

        const container = this.querySelector('#admin-content');
        if (!container) return;

        const { adminTab } = this.state;
        if (adminTab === 'access') container.innerHTML = this.getAccessContent();
        else if (adminTab === 'team') container.innerHTML = this.getTeamContent();
        else if (adminTab === 'proposals') container.innerHTML = this.getProposalsContent();
        else if (adminTab === 'archives') container.innerHTML = this.getArchivesContent();
    }

    // --- CONTENT GENERATORS (Strings only) ---
    
    getAccessContent() {
        const { loadingTree, accessTree, selectedFolderPath, adminData, accessRules, isDirty } = this.state;
        const ui = store.ui;
        
        let treeHtml = '';
        if (loadingTree || !accessTree) {
            treeHtml = `<div class="p-8 text-center text-slate-400 text-xs animate-pulse flex flex-col gap-2"><span class="text-2xl">📡</span><span>${ui.loading || "Loading..."}</span></div>`;
        } else {
            treeHtml = `<div class="w-full whitespace-nowrap">${this.renderFolderTree(accessTree)}</div>`;
        }

        let detailsHtml = '';
        if (!selectedFolderPath) {
            detailsHtml = `
            <div class="flex-1 flex flex-col items-center justify-center text-slate-400 text-center p-8">
                <span class="text-6xl mb-4 opacity-10">🗺️</span>
                <p class="text-sm font-bold text-slate-500">${ui.adminSelectFolder || "Select a folder from the list."}</p>
            </div>`;
        } else {
            const folderName = selectedFolderPath === '/' ? (ui.adminRoot || 'Root Territory') : selectedFolderPath.split('/').filter(p => p).pop();
            const folderGuardians = accessRules.filter(r => r.path === selectedFolderPath);
            const userOptions = adminData.users.map(u => `<option value="@${u.login}">@${u.login}</option>`).join('');

            detailsHtml = `
            <div class="flex-1 flex flex-col h-full overflow-hidden">
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">📂</span>
                        <div class="min-w-0">
                            <h3 class="text-lg font-black text-slate-800 dark:text-white truncate">${folderName}</h3>
                            <p class="text-xs font-mono text-slate-400 mt-0.5 truncate max-w-full" title="${selectedFolderPath}">${selectedFolderPath}</p>
                        </div>
                    </div>
                </div>
                
                <div class="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    <div class="mb-8">
                        <div class="flex justify-between items-center mb-3">
                            <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest">${store.ui.adminTeam || 'Maintainers'}</h4>
                            <span class="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-500 font-bold">${folderGuardians.length}</span>
                        </div>
                        
                        ${folderGuardians.length === 0 
                            ? `<div class="p-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center"><p class="text-sm text-slate-400 font-medium">${ui.adminNoMaintainers || "No maintainers assigned."}</p></div>`
                            : `<div class="space-y-2">
                                ${folderGuardians.map(r => `
                                    <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
                                        <div class="flex items-center gap-3">
                                            <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">${r.owner.substring(1,3).toUpperCase()}</div>
                                            <span class="font-bold text-slate-700 dark:text-slate-200 text-sm">${r.owner}</span>
                                        </div>
                                        <button type="button" data-action="revoke-guardian" data-owner="${r.owner}" class="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-sm" title="Revoke" aria-label="Revoke">🗑️</button>
                                    </div>
                                `).join('')}
                               </div>`
                        }
                    </div>
                    
                    <div class="bg-blue-50 dark:bg-blue-900/10 p-5 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                        <label class="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase mb-2 block tracking-wider">${ui.adminGrantAccess || "Grant Access"}</label>
                        <div class="flex gap-2">
                            <div class="relative flex-1">
                                <select id="inp-new-guardian" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none font-bold text-slate-700 dark:text-white appearance-none focus:ring-2 focus:ring-blue-500">
                                    <option value="" disabled selected>${ui.adminSelectContributor || "Select Contributor..."}</option>
                                    ${userOptions}
                                </select>
                                <div class="absolute right-4 top-3.5 pointer-events-none text-slate-400 text-xs">▼</div>
                            </div>
                            <button data-action="add-guardian" class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold text-xs shadow-lg shadow-blue-500/20 transition-transform active:scale-95">${ui.adminAdd || "Add"}</button>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        return `
        <div class="flex flex-col h-full bg-slate-50 dark:bg-slate-900 relative">
            <div class="flex-1 flex flex-col md:flex-row overflow-hidden">
                <div class="w-full md:w-72 md:border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-y-auto overflow-x-auto custom-scrollbar p-3 max-h-[38vh] md:max-h-none shrink-0">
                    <div class="mb-4 px-2"><h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest">${ui.adminMap || "Map"}</h4></div>
                    ${treeHtml}
                </div>
                <div class="flex-1 bg-slate-50 dark:bg-slate-900 overflow-hidden relative flex flex-col min-w-0">
                    ${detailsHtml}
                </div>
            </div>
            ${isDirty ? `
            <div class="absolute bottom-6 right-6 z-40 animate-in slide-in-from-bottom-4 bounce-in">
                <button data-action="save-gov" class="bg-green-600 hover:bg-green-500 text-white px-8 py-4 rounded-full font-black shadow-2xl transition-all flex items-center gap-3 transform hover:scale-105 active:scale-95 ring-4 ring-white dark:ring-slate-800">
                    <span>💾</span> ${ui.adminSaveGov || "Save Rules"}
                </button>
            </div>` : ''}
        </div>`;
    }

    getTeamContent() {
        const { adminData } = this.state;
        const ui = store.ui;
        return `
        <div class="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900">
            <div class="max-w-3xl mx-auto">
                <div class="flex justify-between items-center mb-8">
                    <div><h3 class="font-black text-xl text-slate-800 dark:text-white uppercase">${ui.adminTeam || 'Maintainers'}</h3><p class="text-xs text-slate-500 mt-1">${ui.adminContributors || "Contributors"}</p></div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${adminData.users.map(u => `
                        <div class="flex items-center gap-4 p-5 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                            <img src="${u.avatar}" class="w-14 h-14 rounded-xl border-2 border-slate-100 dark:border-slate-600 shadow-sm">
                            <div>
                                <h4 class="font-bold text-slate-800 dark:text-white text-base">@${u.login}</h4>
                                <span class="text-[10px] font-black bg-blue-100 text-blue-600 px-2 py-0.5 rounded-md uppercase tracking-wide mt-1 inline-block">${u.role}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>`;
    }

    getProposalsContent() {
        const { adminData } = this.state;
        const ui = store.ui;
        return `<div class="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50 dark:bg-slate-900">
            ${adminData.prs.length === 0 ? `
                <div class="flex flex-col items-center justify-center h-64 text-slate-400">
                    <span class="text-6xl mb-4 opacity-20">📭</span>
                    <p class="font-bold">${ui.adminInboxZero || "Inbox Zero"}</p>
                </div>
            ` : 
            adminData.prs.map(pr => `
                <div class="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex justify-between items-center shadow-sm hover:shadow-md transition-shadow group">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-xl flex flex-col items-center justify-center font-bold text-xs border border-blue-100 dark:border-blue-800">
                            <span>PR</span>
                            <span class="text-sm">#${pr.number}</span>
                        </div>
                        <div>
                            <h4 class="font-bold text-sm text-slate-800 dark:text-white group-hover:text-blue-600 transition-colors">${pr.title}</h4>
                            <div class="flex items-center gap-2 mt-1">
                                <img src="${pr.user.avatar_url}" class="w-4 h-4 rounded-full">
                                <p class="text-xs text-slate-500 font-medium">@${pr.user.login}</p>
                            </div>
                        </div>
                    </div>
                    <a href="${pr.html_url}" target="_blank" class="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl text-xs shadow-lg hover:opacity-90 transition-all active:scale-95">${ui.adminReview || "Review"}</a>
                </div>
            `).join('')}
        </div>`;
    }

    getArchivesContent() {
        const { releases, releasesLoading, newVersionName, creatingRelease } = this.state;
        const canWrite = fileSystem.features.canWrite;
        const ui = store.ui;
        
        return `
        <div class="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
            ${canWrite ? `
            <div class="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950/50">
                <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">${ui.adminCreateArchive || "Create Archive Version"}</label>
                <div class="flex gap-2 max-w-lg">
                    <input id="inp-version" type="text" placeholder="e.g. v2.0" class="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:text-white font-mono" value="${newVersionName}">
                    <button data-action="create-release" class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold shadow-lg transition-all text-xs uppercase tracking-wider flex items-center gap-2" ${creatingRelease ? 'disabled' : ''}>
                        ${creatingRelease ? '<span class="animate-spin">⏳</span>' : '<span>+ ' + (ui.releasesCreate || 'Create') + '</span>'}
                    </button>
                </div>
            </div>` : ''}
            
            <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
                <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">${ui.releasesHistory || "Version History"}</h4>
                ${releasesLoading 
                    ? `<div class="p-12 text-center text-slate-400"><div class="animate-spin text-3xl mb-4 opacity-50">⏳</div>${ui.releasesScanning || "Scanning timeline..."}</div>` 
                    : (releases.length === 0 
                        ? `<div class="p-8 text-center text-slate-400 italic text-sm">${ui.adminNoArchives || "No archives found."}</div>`
                        : releases.map(ver => `
                            <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                <div class="flex items-center gap-4">
                                    <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 flex items-center justify-center text-lg">📦</div>
                                    <span class="font-black text-lg text-slate-700 dark:text-slate-200 font-mono">${ver}</span>
                                </div>
                                <div class="flex gap-2">
                                    <button data-action="switch-release" data-ver="${ver}" class="px-5 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white text-slate-600 dark:text-blue-200 text-xs font-bold rounded-xl transition-colors">${ui.releasesLoad || "Load"}</button>
                                    <button data-action="delete-release" data-ver="${ver}" class="w-9 h-9 flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors" title="${ui.releasesDelete || 'Delete'}">🗑️</button>
                                </div>
                            </div>
                        `).join(''))
                }
            </div>
        </div>`;
    }

    // --- EVENT HANDLERS ---
    
    handleContentInput(e) {
        if(e.target.id === 'inp-version') this.state.newVersionName = e.target.value;
    }

    handleContentClick(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        const action = btn.dataset.action;
        
        if (action === 'save-gov') this.saveGovernance();
        if (action === 'add-guardian') {
            const user = this.querySelector('#inp-new-guardian').value;
            this.addGuardianToSelected(user);
        }
        if (action === 'revoke-guardian') {
            this.removeGuardianFromSelected(btn.dataset.owner);
        }
        if (action === 'create-release') this.createRelease();
        if (action === 'switch-release') this.switchToVersion(btn.dataset.ver);
        if (action === 'delete-release') this.deleteRelease(btn.dataset.ver);
    }

    // --- LOGIC METHODS (Copied from original) ---
    
    async loadFolderTree() {
        this.updateState({ loadingTree: true });
        try {
            const flatTree = await fileSystem.getTree('content');
            const folders = flatTree.filter(node => node.type === 'tree').map(node => {
                let p = node.path;
                if (!p.startsWith('/')) p = '/' + p;
                if (!p.endsWith('/')) p = p + '/';
                return p;
            });
            const root = { name: 'Root', path: '/', children: [] };
            folders.forEach(path => {
                const parts = path.split('/').filter(p => p);
                let current = root;
                parts.forEach((part, index) => {
                    let existing = current.children.find(c => c.name === part);
                    if (!existing) {
                        const currentPath = '/' + parts.slice(0, index + 1).join('/') + '/';
                        existing = { name: part, path: currentPath, children: [] };
                        current.children.push(existing);
                    }
                    current = existing;
                });
            });
            const sortNode = (node) => {
                if (node.children) {
                    node.children.sort((a, b) => a.name.localeCompare(b.name));
                    node.children.forEach(sortNode);
                }
            };
            sortNode(root);
            this.updateState({ accessTree: root, loadingTree: false });
        } catch(e) {
            console.error("Error loading folder tree", e);
            this.updateState({ loadingTree: false });
        }
    }

    parseGovernance(rawText) {
        if (!rawText) return [];
        const lines = rawText.split('\n');
        const rules = [];
        lines.forEach(line => {
            const clean = line.trim();
            if (!clean || clean.startsWith('#')) return;
            const parts = clean.split(/\s+/);
            if (parts.length >= 2) {
                let path = parts[0];
                if (!path.startsWith('/')) path = '/' + path;
                if (!path.endsWith('/')) path = path + '/';
                rules.push({ path: path, owner: parts[1] });
            }
        });
        return rules;
    }
    
    toggleFolder(path) {
        const expanded = new Set(this.state.expandedPaths);
        if (expanded.has(path)) expanded.delete(path);
        else expanded.add(path);
        this.updateState({ expandedPaths: expanded });
    }

    selectAccessFolder(path) {
        this.updateState({ selectedFolderPath: path });
    }
    
    addGuardianToSelected(username) {
        const { selectedFolderPath, accessRules } = this.state;
        if (!selectedFolderPath || !username) return;
        const exists = accessRules.some(r => r.path === selectedFolderPath && r.owner === username);
        if (exists) return;
        const newRules = [...accessRules, { path: selectedFolderPath, owner: username }];
        this.updateState({ accessRules: newRules, isDirty: true });
    }
    
    removeGuardianFromSelected(username) {
        const { selectedFolderPath, accessRules } = this.state;
        if (!selectedFolderPath) return;
        const newRules = accessRules.filter(r => !(r.path === selectedFolderPath && r.owner === username));
        this.updateState({ accessRules: newRules, isDirty: true });
    }
    
    async saveGovernance() {
        const { accessRules, adminData } = this.state;
        const ui = store.ui;
        let content = "# ARBORITO GOVERNANCE\n# Define ownership rules here\n\n";
        accessRules.forEach(r => { content += `${r.path} ${r.owner}\n`; });
        try {
            await github.saveCodeOwners(adminData.gov?.path || '.github/CODEOWNERS', content, adminData.gov?.sha);
            store.notify(ui.adminPermissionsUpdated || 'Permissions updated successfully.');
            this.loadAdminData(); 
        } catch(e) {
            store.notify(
                (ui.adminErrorSavingRules || 'Error saving rules: {message}').replace('{message}', e.message),
                true
            );
        }
    }

    async loadReleases() {
        this.updateState({ releasesLoading: true });
        try {
            const tree = await fileSystem.getTree('content/releases');
            const releaseFolders = new Set();
            tree.forEach(node => {
                const parts = node.path.split('/');
                if (parts.length >= 3 && parts[0] === 'content' && parts[1] === 'releases') {
                    releaseFolders.add(parts[2]);
                }
            });
            const list = Array.from(releaseFolders).sort().reverse();
            this.updateState({ releases: list, releasesLoading: false }); 
        } catch (e) {
            this.updateState({ releases: [], releasesLoading: false });
        }
    }

    async createRelease() {
        const name = this.state.newVersionName.trim().replace(/[^a-z0-9\.\-_]/gi, '');
        if (!name) return;
        this.updateState({ creatingRelease: true });
        const ui = store.ui;
        try {
            await fileSystem.createNode('content/releases', name, 'folder');
            this.updateState({ newVersionName: '' });
            await this.loadReleases();
            store.notify((ui.adminVersionCreatedNotify || `Version '{name}' created.`).replace('{name}', name));
        } catch (e) {
            store.notify(
                (ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', e.message),
                true
            );
        } finally {
            this.updateState({ creatingRelease: false });
        }
    }
    
    async deleteRelease(version) {
        if (this._pendingDelete === version) {
             this.updateState({ releasesLoading: true });
             try {
                await fileSystem.deleteNode(`content/releases/${version}`, 'folder');
                await this.loadReleases();
                this._pendingDelete = null;
            } catch (e) {
                const ui = store.ui;
                store.notify(
                    (ui.releasesArchiveDeleteError || 'Error deleting archive: {message}').replace(
                        '{message}',
                        e.message
                    ),
                    true
                );
                this.updateState({ releasesLoading: false });
            }
        } else {
            this._pendingDelete = version;
            store.notify(store.ui.adminTrashConfirmAgain || 'Click trash again to confirm delete.', false);
            setTimeout(() => {
                if(this._pendingDelete === version) this._pendingDelete = null;
            }, 3000);
        }
    }

    switchToVersion(version) {
        const activeSource = store.value.activeSource;
        let dataRoot = activeSource.url;
        if (dataRoot.includes('/data.json')) {
            dataRoot = dataRoot.replace('/data.json', '');
        } else {
            dataRoot = dataRoot.substring(0, dataRoot.lastIndexOf('/'));
        }
        const newUrl = `${dataRoot}/releases/${version}.json`;
        const ui = store.ui;
        store
            .confirm((ui.adminSwitchVersionConfirm || `Switch to '{version}'?`).replace('{version}', version))
            .then((ok) => {
            if (ok) {
                const newSource = {
                    ...activeSource,
                    id: `${activeSource.id}-${version}`,
                    name: `${activeSource.name} (${version})`,
                    url: newUrl,
                    type: 'archive'
                };
                store.loadData(newSource);
                store.dismissModal();
            }
        });
    }

    updateState(partial) {
        this.state = { ...this.state, ...partial };
        this.updateContent();
    }

    async handleLogin() {
        const token = this.querySelector('#inp-token').value.trim();
        if (!token) return;
        this.updateState({ isLoggingIn: true, loginError: null });
        try {
            const user = await github.initialize(token);
            if (user) {
                localStorage.setItem('arborito-gh-token', token);
                store.update({ githubUser: user });
            } else { throw new Error("Invalid Token"); }
        } catch (e) {
            this.updateState({ loginError: "Auth Failed", isLoggingIn: false });
        }
    }

    renderFolderTree(node, depth = 0) {
        const { selectedFolderPath, accessRules, expandedPaths } = this.state;
        const hasRules = accessRules.some(r => r.path === node.path);
        const isSelected = selectedFolderPath === node.path;
        const isExpanded = expandedPaths.has(node.path);
        const hasChildren = node.children && node.children.length > 0;
        const padding = depth * 14 + 8;
        
        return `
        <div class="tree-item group select-none">
            <div class="flex items-center w-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded-lg mb-0.5 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-500/20' : ''}">
                <div style="width: ${padding}px" class="shrink-0 h-8"></div>
                ${hasChildren ? `
                <button class="w-6 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
                        onclick="window.arboritoAdminToggleFolder('${node.path}')">
                    <span class="text-[10px] font-bold transform transition-transform ${isExpanded ? 'rotate-90' : ''}">▶</span>
                </button>
                ` : `<div class="w-6 h-8"></div>`}
                <button class="flex-1 text-left flex items-center gap-2 h-8 pr-2 min-w-0"
                        onclick="window.arboritoAdminSelectFolder('${node.path}')">
                    <span class="text-lg leading-none ${isSelected ? 'text-blue-500' : 'text-slate-400'}">${depth === 0 ? '🌳' : (isExpanded ? '📂' : '📁')}</span>
                    <span class="text-xs font-bold truncate ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-300'}">${node.name}</span>
                    ${hasRules ? `<span class="shrink-0 text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded border border-green-200">🛡️</span>` : ''}
                </button>
            </div>
            ${isExpanded && hasChildren ? `<div class="tree-children">${node.children.map(c => this.renderFolderTree(c, depth + 1)).join('')}</div>` : ''}
        </div>`;
    }
}
customElements.define('arborito-admin-panel', ArboritoAdminPanel);
