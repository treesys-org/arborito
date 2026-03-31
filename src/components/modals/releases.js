import { store } from '../../store.js';
import { fileSystem } from '../../services/filesystem.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

class ArboritoModalReleases extends HTMLElement {
    constructor() {
        super();
        this.state = {
            releases: [],
            loading: true,
            creating: false,
            newVersionName: '',
            deleteTarget: null // ID of version to delete
        };
    }

    connectedCallback() {
        this.render();
        this.loadReleases();
    }

    close(opts = {}) {
        if (this.hasAttribute('embed')) {
            if (opts.returnToMore === false) {
                document.querySelector('arborito-sidebar')?.closeMobileMenuIfOpen?.();
            }
            return;
        }
        store.dismissModal({ returnToMore: opts.returnToMore !== false });
    }

    async loadReleases() {
        this.state.loading = true;
        this.render();

        try {
            // STRATEGY 1: Public Manifest (Fast, Works for Readers)
            // SourceManager already fetched this into store.value.availableReleases
            const publicReleases = store.value.availableReleases || [];
            
            // Map to unified structure
            let releases = publicReleases
                .filter(r => r.type === 'archive')
                .map(r => ({
                    id: r.year || r.name, // Use year/name as display ID
                    name: r.name,
                    url: r.url,
                    isRemote: true
                }));

            // STRATEGY 2: File System Scan (Admin/Editor Mode)
            // Only if we have write access (implies we are editing/admining)
            if (fileSystem.features.canWrite) {
                try {
                    const tree = await fileSystem.getTree('content/releases');
                    const releaseFolders = new Set();
                    tree.forEach(node => {
                        const parts = node.path.split('/');
                        if (parts.length >= 3 && parts[0] === 'content' && parts[1] === 'releases') {
                            releaseFolders.add(parts[2]);
                        }
                    });
                    
                    // Add any folders found that weren't in the manifest
                    // (e.g. newly created but not yet built via builder script)
                    releaseFolders.forEach(folder => {
                        if (!releases.find(r => r.id === folder)) {
                            releases.push({
                                id: folder,
                                name: `${store.ui.releasesSnapshot || 'Snapshot'} ${folder}`,
                                url: null, // Logic will construct path dynamically
                                isRemote: false
                            });
                        }
                    });
                } catch(e) {
                    console.log("FS scan skipped/failed", e);
                }
            }

            // Sort descending (newest first)
            // Simple heuristic: if it looks like a year/date, sort accordingly, else alpha
            this.state.releases = releases.sort((a, b) => b.id.localeCompare(a.id));

        } catch (e) {
            console.warn("Could not load releases:", e);
            this.state.releases = [];
        } finally {
            this.state.loading = false;
            this.render();
        }
    }

    async createRelease() {
        const name = this.state.newVersionName.trim().replace(/[^a-z0-9\.\-_]/gi, '');
        if (!name) return;

        this.state.creating = true;
        this.render();

        try {
            // Create content/releases/{name}/meta.json
            await fileSystem.createNode('content/releases', name, 'folder');
            
            this.state.newVersionName = '';
            await this.loadReleases();
            store.alert(
                (store.ui.releasesVersionCreatedBody || "Version '{name}' folder created.")
                    .replace('{name}', name)
            );
        } catch (e) {
            store.alert(
                (store.ui.releasesVersionCreateError || 'Error creating version: {message}').replace(
                    '{message}',
                    e.message
                )
            );
        } finally {
            this.state.creating = false;
            this.render();
        }
    }
    
    async confirmDelete() {
        if (!this.state.deleteTarget) return;
        
        const version = this.state.deleteTarget;
        this.state.deleteTarget = null; // Close overlay
        this.state.loading = true;
        this.render();

        try {
            await fileSystem.deleteNode(`content/releases/${version}`, 'folder');
            await this.loadReleases();
        } catch (e) {
            store.alert(
                (store.ui.releasesArchiveDeleteError || 'Error deleting archive: {message}').replace(
                    '{message}',
                    e.message
                )
            );
            this.state.loading = false;
            this.render();
        }
    }

    async switchTo(release) {
        const activeSource = store.value.activeSource;
        let newUrl = release.url;

        // If no URL (from FS scan), construct standard path
        if (!newUrl) {
            let dataRoot = activeSource.url;
            if (dataRoot.includes('/data.json')) {
                dataRoot = dataRoot.replace('/data.json', '');
            } else {
                dataRoot = dataRoot.substring(0, dataRoot.lastIndexOf('/'));
            }
            newUrl = `${dataRoot}/releases/${release.id}.json`;
        }

        const ui = store.ui;
        const proceed = await store.confirm(
            (ui.releasesTravelConfirmBody || `Travel to time period '{id}'?`).replace('{id}', release.id)
        );
        if (proceed) {
            const newSource = {
                ...activeSource,
                id: `${activeSource.id}-${release.id}`,
                name: release.name || `${activeSource.name} (${release.id})`,
                url: newUrl,
                type: 'archive'
            };
            await store.loadData(newSource);
            this.close({ returnToMore: false });
        }
    }
    
    async switchToLive() {
        const releases = store.value.availableReleases || [];
        const rolling = releases.find(r => r.type === 'rolling');
        
        let newUrl = rolling ? rolling.url : store.value.activeSource.url;
        
        // Fallback logic to strip release path
        if (!rolling && store.value.activeSource.type === 'archive') {
             // Try to find the root data.json
             // .../data/releases/2023.json -> .../data/data.json
             let current = store.value.activeSource.url;
             if (current.includes('/releases/')) {
                 newUrl = current.split('/releases/')[0] + '/data.json';
             }
        }

        const newSource = {
            ...store.value.activeSource,
            id: `live-${Date.now()}`,
            name: store.value.activeSource.name.split(' (')[0], // Strip version suffix
            url: newUrl,
            type: 'rolling'
        };
        await store.loadData(newSource);
        this.close({ returnToMore: false });
    }

    render() {
        const ui = store.ui;
        const embedded = this.hasAttribute('embed');
        const mobile = embedded ? true : shouldShowMobileUI();
        const currentTreeName = store.value.activeSource?.name || "Current Tree";
        const canWrite = fileSystem.features.canWrite;
        
        // Determine active state
        const activeType = store.value.activeSource?.type;
        const activeId = store.value.activeSource?.id;
        
        const isRolling = !activeType || activeType === 'rolling' || activeType === 'local';

        let overlayHtml = '';
        if (this.state.deleteTarget) {
            const deleteTitle = ui.releasesConfirmDeleteTitle || "Delete Snapshot?";
            const deleteBody = (ui.releasesConfirmDeleteBody || "Are you sure you want to remove '{version}'?").replace('{version}', this.state.deleteTarget);
            const overlayRound = mobile ? 'rounded-none' : 'rounded-3xl';
            
            overlayHtml = `
            <div class="absolute inset-0 bg-white/95 dark:bg-slate-900/95 flex items-center justify-center z-[120] animate-in fade-in ${overlayRound}">
                <div class="w-full max-w-xs text-center">
                    <div class="text-4xl mb-4">⚠️</div>
                    <h3 class="text-xl font-black mb-2 dark:text-white">${deleteTitle}</h3>
                    <p class="text-xs text-slate-500 mb-6">${deleteBody}</p>
                    <div class="flex gap-3">
                        <button id="btn-cancel-delete" class="flex-1 py-3 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs uppercase">${ui.cancel || 'Cancel'}</button>
                        <button id="btn-confirm-delete" class="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-xs uppercase shadow-lg hover:scale-105 transition-transform">${ui.graphDelete || 'Delete'}</button>
                    </div>
                </div>
            </div>
            `;
        }

        const panelMod = mobile ? ' arborito-releases-panel--mobile' : '';
        const backdropCls = embedded
            ? ''
            : mobile
              ? 'fixed inset-0 z-[70] flex flex-col bg-slate-950 animate-in fade-in arborito-modal--mobile-fullbleed'
              : 'fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in fade-in arborito-modal-root';
        const panelCls = embedded
            ? 'relative overflow-hidden flex flex-col cursor-auto w-full flex-1 min-h-0 min-w-0 h-full border-0 shadow-none rounded-none bg-white dark:bg-slate-900'
            : mobile
              ? 'relative overflow-hidden flex flex-col cursor-auto w-full flex-1 min-h-0 border-0 shadow-none rounded-none'
              : 'arborito-float-modal-card bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300';
        const listPad = mobile ? 'arborito-releases-scroll p-3 space-y-3' : 'p-6 space-y-6';
        const livePad = mobile ? 'p-3.5' : 'p-5';
        const liveRound = mobile ? 'rounded-xl' : 'rounded-2xl';
        const rowPl = mobile ? 'arborito-releases-row-wrap relative' : 'relative pl-12';
        const dotLive = mobile ? 'arborito-releases-timeline-dot hidden' : `absolute arborito-releases-timeline-dot arborito-releases-timeline-dot--live top-6 w-4 h-4 rounded-full border-2 ${isRolling ? 'bg-green-500 border-green-200 dark:border-green-900' : 'bg-slate-200 border-white dark:bg-slate-700 dark:border-slate-800'} z-10`;
        const snapDot = (isActive) => mobile ? 'hidden' : `absolute arborito-releases-timeline-dot arborito-releases-timeline-dot--snap top-7 w-3 h-3 rounded-full ${isActive ? 'bg-blue-500 ring-4 ring-blue-100 dark:ring-blue-900/30' : 'bg-slate-300 dark:bg-slate-700'} z-10`;

        const embedMeta = embedded
            ? `<div class="px-3 pt-2 pb-1.5 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
                    <p class="text-[11px] text-slate-500 dark:text-slate-400 font-semibold truncate">${currentTreeName}</p>
                </div>`
            : '';

        const heroBlock = embedded
            ? ''
            : mobile
              ? `
                <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-center gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-release-back' })}
                    <div class="min-w-0 flex-1">
                        <h2 class="arborito-mmenu-subtitle m-0 leading-tight">${ui.releasesTimeline || "Timeline"}</h2>
                        <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 font-semibold">${currentTreeName}</p>
                    </div>
                    ${modalWindowCloseXHtml(ui, 'btn-release-close')}
                </div>`
              : `
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-release-back' })}
                    <div class="min-w-0 flex-1">
                        <h2 class="arborito-mmenu-subtitle m-0 leading-tight">${ui.releasesTimeline || "Timeline"}</h2>
                        <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 font-semibold">${currentTreeName}</p>
                    </div>
                    ${modalWindowCloseXHtml(ui, 'btn-release-close')}
                </div>`;

        const panelInner = `
            <div id="modal-panel" class="${panelCls} arborito-releases-panel${panelMod}">
                ${embedMeta}
                ${heroBlock}

                <div class="relative flex-1 overflow-hidden flex flex-col min-h-0 isolate">
                    
                    ${canWrite ? `
                    <div class="arborito-releases-admin ${mobile ? 'px-3 py-3' : 'p-6'} border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
                        <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">${ui.releasesTag || "Tag New Version"}</label>
                        <div class="flex ${mobile ? 'flex-col' : 'flex-row'} gap-2 max-w-lg">
                            <input id="inp-version" type="text" placeholder="${ui.releasesVersionPlaceholder || 'e.g. v2.0'}" class="flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 font-mono" value="${this.state.newVersionName}">
                            <button id="btn-create" type="button" class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-blue-500/20 active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 shrink-0" ${this.state.creating ? 'disabled' : ''}>
                                ${this.state.creating ? '<span class="animate-spin">⏳</span>' : `<span>+ ${ui.releasesCreate || "Create"}</span>`}
                            </button>
                        </div>
                    </div>
                    ` : ''}

                    <div class="flex-1 overflow-y-auto custom-scrollbar ${listPad} min-h-0 relative z-0">
                        ${mobile ? '' : '<div class="arborito-releases-timeline-spine absolute top-0 bottom-0 w-0.5 bg-slate-100 dark:bg-slate-800 -z-10" aria-hidden="true"></div>'}

                        <div class="${rowPl}">
                            <div class="${dotLive}"></div>
                            
                            <div class="arborito-releases-live-card ${livePad} ${liveRound} border-2 ${isRolling ? 'border-green-500 bg-green-50 dark:bg-green-900/10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'} flex flex-wrap justify-between items-center gap-2 transition-all">
                                <div class="flex items-center gap-3 min-w-0">
                                    <div class="w-10 h-10 rounded-xl ${isRolling ? 'bg-green-100 text-green-600 dark:bg-green-900/35 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'} flex items-center justify-center font-bold text-xl shrink-0">
                                        🌊
                                    </div>
                                    <div class="min-w-0">
                                        <h4 class="font-bold ${mobile ? 'text-sm' : 'text-base'} text-slate-800 dark:text-white">${ui.releasesLive || "Live / Rolling"}</h4>
                                        <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">${ui.releasesLatest || "Latest Updates"}</p>
                                    </div>
                                </div>
                                ${isRolling 
                                    ? `<span class="text-[10px] font-black bg-green-200 text-green-800 dark:bg-green-900/50 dark:text-green-300 px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0">${ui.releasesActive || "ACTIVE"}</span>` 
                                    : `<button type="button" id="btn-live" class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-xl shadow transition-colors uppercase tracking-wider shrink-0">${ui.releasesSwitch || "Switch"}</button>`
                                }
                            </div>
                        </div>

                        ${this.state.loading 
                            ? `<div class="py-10 text-center text-slate-400"><div class="animate-spin text-2xl mb-3 opacity-50">⏳</div><span class="text-sm">${ui.releasesScanning || "Scanning timeline..."}</span></div>` 
                            : (this.state.releases.length === 0 
                                ? `<div class="${mobile ? '' : 'pl-12'} py-4 text-slate-400 italic text-sm">${ui.releasesEmpty || "No historical snapshots found."}</div>`
                                : this.state.releases.map((rel, idx) => {
                                    const isActive = activeType === 'archive' && activeId && activeId.includes(rel.id);
                                    return `
                                    <div class="${rowPl} animate-in slide-in-from-bottom-2 fade-in" style="animation-delay: ${idx * 50}ms">
                                        <div class="${snapDot(isActive)}"></div>
                                        
                                        <div class="arborito-releases-snap-card ${isActive ? 'arborito-releases-snap-card--active ' : ''}${mobile ? 'flex flex-col' : 'flex flex-row items-center justify-between'} gap-3 p-3 bg-white dark:bg-slate-900 border ${isActive ? 'border-blue-500' : 'border-slate-100 dark:border-slate-800'} ${mobile ? 'rounded-xl' : 'rounded-2xl'} group hover:border-blue-300 dark:hover:border-blue-700 transition-all">
                                            <div class="flex items-center gap-3 min-w-0">
                                                <div class="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 flex items-center justify-center text-lg border border-slate-100 dark:border-slate-700 shrink-0">📦</div>
                                                <div class="min-w-0">
                                                    <h4 class="font-bold ${mobile ? 'text-sm' : 'text-base'} text-slate-700 dark:text-slate-200 font-mono tracking-tight">${rel.id}</h4>
                                                    <p class="text-[11px] text-slate-400 mt-0.5">${ui.releasesSnapshot || "Snapshot"}</p>
                                                </div>
                                            </div>
                                            
                                            <div class="flex flex-wrap gap-2 items-center justify-end">
                                                ${isActive 
                                                    ? `<span class="text-[10px] font-black text-blue-500 uppercase tracking-wider bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">${ui.releasesViewing || "Viewing"}</span>` 
                                                    : `<button type="button" class="btn-switch px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500 text-slate-600 dark:text-blue-200 text-xs font-bold rounded-xl transition-colors uppercase tracking-wider" data-idx="${idx}">${ui.releasesLoad || "Load"}</button>`
                                                }
                                                
                                                <button type="button" class="btn-delete-release w-10 h-10 flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors" data-id="${rel.id}" title="${ui.releasesDelete || 'Delete Archive'}" aria-label="${ui.releasesDelete || 'Delete'}">🗑️</button>
                                            </div>
                                        </div>
                                    </div>
                                `;
                                }).join(''))
                        }
                    </div>
                    ${overlayHtml}
                </div>
            </div>`;

        this.innerHTML = embedded
            ? `<div class="arborito-releases-embed-root flex flex-col flex-1 min-h-0 w-full h-full min-w-0 overflow-hidden">${panelInner}</div>`
            : `<div id="modal-backdrop" class="${backdropCls}">${panelInner}</div>`;

        const closeReleases = () => this.close();
        this.querySelectorAll('.btn-release-back, .btn-release-close').forEach((b) => {
            b.onclick = closeReleases;
        });
        
        const btnCreate = this.querySelector('#btn-create');
        if(btnCreate) btnCreate.onclick = () => this.createRelease();
        
        const btnLive = this.querySelector('#btn-live');
        if(btnLive) btnLive.onclick = () => this.switchToLive();

        const inp = this.querySelector('#inp-version');
        if(inp) inp.oninput = (e) => this.state.newVersionName = e.target.value;

        this.querySelectorAll('.btn-switch').forEach(b => {
            b.onclick = (e) => this.switchTo(this.state.releases[e.currentTarget.dataset.idx]);
        });
        
        this.querySelectorAll('.btn-delete-release').forEach(b => {
            b.onclick = (e) => {
                this.state.deleteTarget = e.currentTarget.dataset.id;
                this.render();
            };
        });
        
        const btnConfirmDelete = this.querySelector('#btn-confirm-delete');
        if (btnConfirmDelete) btnConfirmDelete.onclick = () => this.confirmDelete();
        
        const btnCancelDelete = this.querySelector('#btn-cancel-delete');
        if (btnCancelDelete) btnCancelDelete.onclick = () => {
            this.state.deleteTarget = null;
            this.render();
        };
    }
}

customElements.define('arborito-modal-releases', ArboritoModalReleases);
