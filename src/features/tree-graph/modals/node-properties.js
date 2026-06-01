
import { store } from '../../../core/store.js';
import { fileSystem } from '../../backup-export/filesystem.js';
import { parseArboritoFile } from '../../editor/editor-engine.js';
import { getNodeMetaTargetPath, persistNodeMetaProperties } from '../node-meta-persist.js';
import { NODE_PROPERTY_EMOJIS } from '../node-property-emojis.js';
import { escAttr } from '../../../shared/lib/html-escape.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { loadingHtml } from '../../../shared/ui/loading.js';

/* Strict superset of `escHtml` (also escapes `'`) — safe for both content and
 * single-quoted attribute values used by the modal templates below. */
const escHtml = escAttr;

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
        if (typeof document !== 'undefined') {
            document.documentElement.classList.add('arborito-node-properties-modal-open');
        }
        this.render();
        await this.loadData();
    }

    close() {
        store.dismissModal();
    }

    async loadData() {
        const targetPath = getNodeMetaTargetPath(this.node, store.value.lang);

        if (!targetPath) {
            if (this.node.type === 'branch' || this.node.type === 'root') {
                this.state.originalMeta = {};
                this.state.originalBody = '';
            } else {
                const parsed = parseArboritoFile(this.node.content || '');
                this.state.originalBody = parsed.body || '';
                this.state.originalMeta = parsed.meta || {};
            }
            this.state.name = this.node.name;
            this.state.icon = this.node.icon || '📄';
            this.state.description = this.node.description || '';
            this.state.loading = false;
            this.render();
            return;
        }

        try {
            // Attempt to fetch from file system (remote or local)
            const fileData = await fileSystem.getFile(this.node.id, targetPath);

            this.state.originalBody = fileData.body || '';
            this.state.originalMeta = fileData.meta || {};

            // Prioritize file content, fallback to node data
            this.state.name = fileData.meta.title || this.node.name;
            this.state.icon = fileData.meta.icon || this.node.icon || '📄';
            this.state.description = fileData.meta.description || this.node.description || '';
        } catch (e) {
            // CRITICAL FIX: If loading fails (404, network, bad path), DO NOT BLOCK.
            // Just warn in console and allow the user to edit using the cached graph data.
            // Saving will recreate/fix the file.
            console.warn(`[NodeProperties] Could not load ${targetPath}. Using graph data.`, e);

            const parsed = parseArboritoFile(this.node.content || '');
            this.state.originalBody =
                this.node.type === 'branch' || this.node.type === 'root' ? '' : parsed.body || '';
            this.state.originalMeta = parsed.meta || {};

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
        const nameInp = this.querySelector('#inp-name');
        const name = (nameInp && nameInp.value).trim() || '';
        
        if (!name) {
            const ui = store.ui;
            if (nameInp) {
                nameInp.focus();
                nameInp.classList.add('arborito-input-required-empty');
                setTimeout(() => nameInp.classList.remove('arborito-input-required-empty'), 3000);
            }
            store.notify(ui.lessonNameRequired || ui.graphPromptLessonName || 'Name is required.', true);
            return;
        }

        this.state.saving = true;
        this.render();

        try {
            const { icon, description, originalMeta, originalBody } = this.state;

            await persistNodeMetaProperties(
                { fileSystem, store },
                {
                    node: this.node,
                    name,
                    icon,
                    description,
                    originalMeta,
                    originalBody
                }
            );
            
            // Show success state briefly before closing
            this.state.saving = false;
            this.state.saved = true;
            this.render();
            setTimeout(() => this.close(), 800);

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
            this.innerHTML = modalShellHtml({
                bodyHtml: loadingHtml({ variant: 'fullbleed', size: 'lg' }),
                scrim: 'black',
                enter: 'fade-fast',
                bareBackdrop: true,
            });
            return;
        }

        const isSaving = this.state.saving;
        const isSaved = this.state.saved;

        const ui = store.ui;
        const nameAttr = escAttr(this.state.name);
        const descHtml = escHtml(this.state.description);
        
        const saveBtnContent = isSaved 
            ? '<span>✅</span> Saved' 
            : isSaving 
                ? '<span class="animate-spin">⏳</span> Saving...' 
                : '<span>💾</span> Save Changes';
        
        const saveBtnClass = isSaved
            ? 'bg-emerald-600 text-white opacity-90 cursor-default'
            : isSaving
                ? 'bg-purple-400 text-white cursor-wait'
                : 'arborito-cta-purple active:scale-95';

        const bodyHtml = `
                ${modalHeroHtml(ui, { title: 'Node Properties', backTagClass: 'btn-nodep-back', closeTagClass: 'btn-nodep-x' })}

                <div class="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    <!-- Icon & Name Row -->
                    <div class="flex gap-3">
                        <div class="relative group">
                            <button id="btn-icon" class="w-12 h-12 text-2xl bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" title="Change Icon">
                                ${this.state.icon}
                            </button>
                            <!-- Mini Picker on Hover -->
                            <div class="hidden group-hover:flex absolute top-14 left-0 w-64 bg-white dark:bg-slate-800 shadow-xl rounded-xl border border-slate-200 dark:border-slate-700 p-2 flex-wrap gap-1 z-50">
                                ${NODE_PROPERTY_EMOJIS.map(e => `<button class="btn-emoji w-8 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-lg">${e}</button>`).join('')}
                            </div>
                        </div>
                        <div class="flex-1">
                            <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Name</label>
                            <input id="inp-name" type="text" class="arborito-input arborito-input--compact font-bold" value="${nameAttr}" ${isSaving || isSaved ? 'disabled' : ''}>
                        </div>
                    </div>

                    <!-- Description -->
                    <div>
                        <label class="text-[10px] font-bold text-slate-400 uppercase block mb-1">Description</label>
                        <textarea id="inp-desc" class="arborito-input arborito-textarea h-24 resize-none" ${isSaving || isSaved ? 'disabled' : ''}>${descHtml}</textarea>
                    </div>
                </div>

                <div class="arborito-modal-footer arborito-modal-footer--bg-flat">
                    <div class="arborito-action-row">
                        <button type="button" class="btn-nodep-cancel py-3 text-slate-500 dark:text-slate-400 font-bold text-sm hover:text-slate-800 dark:hover:text-white transition-colors" ${isSaving || isSaved ? 'disabled' : ''}>Cancel</button>
                        <button id="btn-save" class="py-3 font-bold rounded-xl shadow-lg transition-all text-sm flex items-center justify-center gap-2 ${saveBtnClass}" ${isSaving || isSaved ? 'disabled' : ''}>
                            ${saveBtnContent}
                        </button>
                    </div>
                </div>`;
        this.innerHTML = modalShellHtml({
            bodyHtml,
            panelSize: 'auto-h',
            panelClass: 'arborito-float-modal-card--md transition-all duration-300',
        });

        const btnN = this.querySelector('.btn-nodep-back'); if (btnN) btnN.addEventListener('click', () => this.close());
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

    disconnectedCallback() {
        if (typeof document !== 'undefined') {
            document.documentElement.classList.remove('arborito-node-properties-modal-open');
        }
    }
}

customElements.define('arborito-modal-node-properties', ArboritoModalNodeProperties);
