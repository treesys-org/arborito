
import { store } from '../../store.js';
import { fileSystem } from '../../services/filesystem.js';
import { reconstructArboritoFile } from '../../utils/editor-engine.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

const EMOJIS = ["📄", "📁", "📂", "✨", "🔥", "💡", "🚀", "⭐", "📝", "📌", "🧬", "💻", "🎨", "⚖️", "🧠", "🎓", "🌱", "🌳", "🍎", "🎮"];

class ArboritoModalNodeProperties extends HTMLElement {
    constructor() {
        super();
        this.node = store.value.modal.node;
        this.state = {
            name: this.node.name,
            icon: this.node.icon || '📄',
            description: this.node.description || '',
            loading: true,
            saving: false,
            originalBody: '',
            originalMeta: {}
        };
    }

    async connectedCallback() {
        this.render();
        await this.loadData();
    }

    close() {
        store.dismissModal();
    }

    getTargetPath() {
        let path = this.node.sourcePath;
        
        // Fallback for Root nodes
        if (!path && this.node.type === 'root') {
            const lang = store.value.lang || 'EN';
            path = `content/${lang}`;
        }

        // Safety: Remove leading slash if present (GitHub API dislike)
        if (path && path.startsWith('/')) path = path.substring(1);

        // If it's a container (Folder/Root), target meta.json
        if (this.node.type === 'branch' || this.node.type === 'root') {
            if (path && !path.endsWith('meta.json')) {
                // Ensure no double slash
                path = path.endsWith('/') ? path + 'meta.json' : path + '/meta.json';
            }
        }
        return path;
    }

    async loadData() {
        const targetPath = this.getTargetPath();
        
        try {
            if (!targetPath) throw new Error("Invalid path.");

            // Attempt to fetch from file system (GitHub/Local)
            const fileData = await fileSystem.getFile(this.node.id, targetPath);
            
            this.state.originalBody = fileData.body || '';
            this.state.originalMeta = fileData.meta || {};
            
            // Prioritize file content, fallback to node data
            this.state.name = fileData.meta.title || fileData.meta.name || this.node.name;
            this.state.icon = fileData.meta.icon || this.node.icon || '📄';
            this.state.description = fileData.meta.description || this.node.description || '';
            
        } catch (e) {
            // CRITICAL FIX: If loading fails (404, network, bad path), DO NOT BLOCK.
            // Just warn in console and allow the user to edit using the cached graph data.
            // Saving will recreate/fix the file.
            console.warn(`[NodeProperties] Could not load ${targetPath}. Using graph data.`, e);
            
            // Fallback to what we know from the graph
            this.state.name = this.node.name;
            this.state.icon = this.node.icon || '📄';
            this.state.description = this.node.description || '';
        } finally {
            this.state.loading = false;
            this.render();
        }
    }

    async save() {
        this.state.saving = true;
        this.render();

        try {
            const { name, icon, description, originalMeta, originalBody } = this.state;
            
            // 1. Prepare Metadata
            const newMeta = {
                ...originalMeta,
                title: name,
                icon: icon,
                description: description
            };

            const isFolder = this.node.type === 'branch' || this.node.type === 'root';
            let newContent = '';

            // 2. Prepare Content Payload
            if (isFolder) {
                newContent = JSON.stringify({
                    name: name,
                    icon: icon,
                    description: description,
                    order: originalMeta.order || "99"
                }, null, 2);
            } else {
                newContent = reconstructArboritoFile(newMeta, originalBody);
            }

            // 3. Save
            const targetPath = this.getTargetPath();
            if (!targetPath) throw new Error("Cannot save: Invalid path.");

            const nodePayload = { ...this.node, sourcePath: targetPath };
            
            // Pass null SHA if we failed to load original file (forces overwrite/create)
            // If we did load it, fileSystem.getFile usually attaches SHA to the node implicitly or we ignore it 
            // relying on fileSystem to handle latest HEAD or force update.
            // Ideally we'd pass the SHA from loadData if we had it, but fileSystem.saveFile 
            // handles simple "overwrite" logic usually.
            
            await fileSystem.saveFile(nodePayload, newContent, newMeta, `Update properties: ${name}`);

            // 4. Rename (if needed) - Only if name changed
            if (name !== this.node.name) {
                // Determine original folder path (without meta.json)
                let originalFolderPath = this.node.sourcePath;
                if (originalFolderPath.endsWith('/meta.json')) {
                    originalFolderPath = originalFolderPath.replace('/meta.json', '');
                }
                
                if (originalFolderPath) {
                    await fileSystem.renameNode(originalFolderPath, name, isFolder ? 'folder' : 'file');
                }
            }

            // 5. Reload Graph
            await store.loadData(store.value.activeSource, store.value.lang, false);
            this.close();

        } catch (e) {
            const ui = store.ui;
            store.alert(
                (ui.nodePropertiesSaveError || 'Error saving properties: {message}').replace('{message}', e.message)
            );
            this.state.saving = false;
            this.render();
        }
    }

    render() {
        if (this.state.loading) {
            this.innerHTML = `<div class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950"><div class="animate-spin text-4xl">⏳</div></div>`;
            return;
        }

        const isSaving = this.state.saving;

        const ui = store.ui;
        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in fade-in arborito-modal-root">
            <div class="arborito-float-modal-card arborito-float-modal-card--auto-h arborito-float-modal-card--md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 items-center gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-nodep-back' })}
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">Node Properties</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-nodep-x')}
                </div>

                <div class="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    <!-- Icon & Name Row -->
                    <div class="flex gap-3">
                        <div class="relative group">
                            <button id="btn-icon" class="w-12 h-12 text-2xl bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" title="Change Icon">
                                ${this.state.icon}
                            </button>
                            <!-- Mini Picker on Hover -->
                            <div class="hidden group-hover:flex absolute top-14 left-0 w-64 bg-white dark:bg-slate-800 shadow-xl rounded-xl border border-slate-200 dark:border-slate-700 p-2 flex-wrap gap-1 z-50">
                                ${EMOJIS.map(e => `<button class="btn-emoji w-8 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-lg">${e}</button>`).join('')}
                            </div>
                        </div>
                        <div class="flex-1">
                            <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Name</label>
                            <input id="inp-name" type="text" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" value="${this.state.name}">
                        </div>
                    </div>

                    <!-- Description -->
                    <div>
                        <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Description</label>
                        <textarea id="inp-desc" class="w-full h-24 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-600 dark:text-slate-300 outline-none focus:ring-2 focus:ring-purple-500 resize-none">${this.state.description}</textarea>
                    </div>
                </div>

                <div class="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex gap-3">
                    <button type="button" class="btn-nodep-cancel flex-1 py-3 text-slate-500 dark:text-slate-400 font-bold text-sm hover:text-slate-800 dark:hover:text-white transition-colors">Cancel</button>
                    <button id="btn-save" class="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all text-sm flex items-center justify-center gap-2" ${isSaving ? 'disabled' : ''}>
                        ${isSaving ? '<span class="animate-spin">⏳</span> Saving...' : '<span>💾</span> Save Changes'}
                    </button>
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-nodep-back')?.addEventListener('click', () => this.close());
        this.querySelectorAll('.btn-nodep-x').forEach((b) => (b.onclick = () => this.close()));
        const nc = this.querySelector('.btn-nodep-cancel');
        if (nc) nc.onclick = () => this.close();
        
        const btnSave = this.querySelector('#btn-save');
        if(btnSave) {
            btnSave.onclick = () => {
                this.state.name = this.querySelector('#inp-name').value;
                this.state.description = this.querySelector('#inp-desc').value;
                this.save();
            };
        }

        this.querySelectorAll('.btn-emoji').forEach(b => {
            b.onclick = (e) => {
                this.state.icon = e.currentTarget.textContent;
                this.render();
            };
        });
    }
}

customElements.define('arborito-modal-node-properties', ArboritoModalNodeProperties);
