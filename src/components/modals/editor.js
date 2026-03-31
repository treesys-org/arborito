import { store } from '../../store.js';
import { ArboritoEditorLogic, EMOJI_DATA } from './editor-logic.js';

class ArboritoEditor extends ArboritoEditorLogic {
    renderEditor(bodyHTML) {
        const ui = store.ui;
        const isConstruct = store.value.constructionMode;
        
        // Full screen focused overlay
        this.className = `fixed inset-0 z-[120] w-full h-full bg-slate-950 flex items-center justify-center p-0 md:p-6 transition-opacity duration-300 pointer-events-auto`;
        
        const bgClass = 'bg-white dark:bg-slate-900';
        const textClass = 'text-slate-800 dark:text-white';
        const inputClass =
            'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/80';
        const editorBg = 'bg-white dark:bg-slate-900 shadow-inner';
        const proseClass = 'prose prose-slate dark:prose-invert mx-auto max-w-3xl';

        const pathDisplay = this.node.sourcePath || ui.editorPathNewFile;

        const panelTitle = this.isMetaJson
            ? (ui.editorMetaWarning ? ui.editorPanelFolderProperties : ui.editorPanelFolder)
            : ui.editorTitle;
        const saveLabel = this.isMetaJson ? ui.editorBtnSave : ui.editorLocalSave;
        const saveStateText =
            this.saveState === 'saving'
                ? ui.editorSaving
                : this.saveState === 'saved'
                  ? ui.editorSaved
                  : ui.editorReady;

        const bodyContent = this.isMetaJson
            ? `<div class="p-8 text-center text-slate-400 italic border-2 border-dashed border-slate-500 rounded-xl">
                 <span class="text-4xl block mb-2">📂</span>
                 ${ui.editorMetaWarning}<br><span class="text-xs">${ui.editorMetaEditHint}</span>
               </div>`
            : bodyHTML;

        this.innerHTML = `
        <div class="flex flex-col w-full h-full md:rounded-2xl shadow-2xl overflow-hidden border ${isConstruct ? 'border-amber-400/50 dark:border-amber-500/35 ring-1 ring-amber-400/20' : 'border-slate-200 dark:border-slate-700'} ${bgClass} ${textClass} relative">
            
            <!-- AI PROMPT OVERLAY (Internal) -->
            <div id="ai-prompt-overlay" class="hidden absolute inset-0 z-50 flex items-center justify-center bg-slate-950 animate-in fade-in">
                <div class="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-2xl w-full max-w-md border border-purple-500/50">
                    <h3 class="text-lg font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2"><span class="text-2xl">✨</span> ${ui.editorMagicDraft}</h3>
                    <p class="text-sm text-slate-500 mb-4">${ui.editorMagicDraftPrompt}</p>
                    <input id="inp-ai-prompt" type="text" class="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold mb-4 focus:ring-2 focus:ring-purple-500 outline-none dark:text-white" placeholder="${ui.editorMagicDraftExample}">
                    <div class="flex gap-3">
                        <button id="btn-cancel-ai" class="flex-1 py-2 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg font-bold text-xs uppercase">${ui.editorCancelLoading}</button>
                        <button id="btn-run-ai" class="flex-1 py-2 bg-purple-600 text-white rounded-lg font-bold text-xs uppercase hover:bg-purple-500">${ui.editorDraftButton}</button>
                    </div>
                </div>
            </div>

            <!-- HEADER -->
            <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shrink-0 bg-slate-50 dark:bg-slate-900 z-20">
                <div class="flex items-center gap-3 overflow-hidden min-w-0">
                    <span class="text-2xl shrink-0" aria-hidden="true">${isConstruct ? '🏗️' : '✏️'}</span>
                    <div class="min-w-0">
                        <div class="text-[10px] uppercase font-bold tracking-widest flex items-center gap-2 flex-wrap">
                            ${isConstruct ? `<span class="rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 px-2 py-0.5 border border-amber-300/60 dark:border-amber-500/30">${ui.navConstruct}</span>` : ''}
                            <span class="text-slate-500 dark:text-slate-400">${panelTitle}</span>
                        </div>
                        <div class="text-xs font-bold truncate text-slate-700 dark:text-slate-200 mt-0.5" title="${pathDisplay}">${pathDisplay}</div>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span id="editor-save-status" class="text-[10px] uppercase tracking-wide font-black text-slate-500 dark:text-slate-400">${saveStateText}</span>
                    <button id="btn-submit" class="bg-green-600 hover:bg-green-500 text-white px-5 py-2 rounded-lg text-sm font-bold uppercase tracking-wider shadow-lg flex items-center gap-2 transition-all active:scale-95">
                        <span>💾</span> <span class="hidden sm:inline">${saveLabel}</span>
                    </button>
                    <button type="button" id="btn-cancel" class="arborito-mmenu-back w-10 h-10 shrink-0" aria-label="${ui.navBack}">←</button>
                </div>
            </div>

            <!-- TOOLBAR (Docked below header) -->
            ${!this.isMetaJson ? `
            <div class="flex flex-wrap gap-2 items-center px-4 py-2 border-b border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 z-10 shrink-0">
                <button id="btn-undo" class="tool-btn w-8 h-8 flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 opacity-50 transition-colors" disabled>↩</button>
                <div class="w-px h-6 bg-slate-400/30 mx-1"></div>
                <button class="tool-btn px-3 py-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 font-bold text-sm transition-colors" data-cmd="bold">B</button>
                <button class="tool-btn px-3 py-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 italic text-sm transition-colors" data-cmd="italic">I</button>
                <button class="tool-btn px-3 py-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 font-black text-sm uppercase transition-colors" data-cmd="formatBlock" data-val="H2" title="${ui.editorTitleAttrH2}">${ui.editorToolbarSubHeader}</button>
                <details class="ml-1">
                    <summary class="list-none cursor-pointer px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs font-bold uppercase text-slate-600 dark:text-slate-300">${ui.editorToolbarMore}</summary>
                    <div class="absolute mt-2 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl flex flex-wrap gap-2 z-30">
                        <button class="tool-btn px-3 py-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 font-black text-sm uppercase transition-colors" data-cmd="formatBlock" data-val="H1" title="${ui.editorTitleAttrH1}">${ui.editorToolbarTitleButton}</button>
                        <button class="tool-btn px-3 py-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 font-bold text-[10px] uppercase transition-colors" data-cmd="formatBlock" data-val="H3" title="${ui.editorTitleAttrH3}">${ui.editorToolbarTopicButton}</button>
                        <button class="block-btn px-3 py-1.5 bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30 rounded text-xs font-bold uppercase hover:bg-green-500/20 transition-colors" data-type="quiz">+ ${ui.quizLabel}</button>
                        <button class="block-btn px-3 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded text-xs font-bold uppercase hover:bg-blue-500/20 transition-colors" data-type="section">+ ${ui.editorBlockAddSection}</button>
                        <button class="block-btn px-3 py-1.5 bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30 rounded text-xs font-bold uppercase hover:bg-sky-500/20 transition-colors" data-type="subsection">+ ${ui.editorBlockAddSubsection}</button>
                        <button class="block-btn px-3 py-1.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 rounded text-xs font-bold uppercase hover:bg-orange-500/20 transition-colors" data-type="callout">+ ${ui.editorBlockAddNote}</button>
                        <button class="block-btn px-3 py-1.5 bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-500/30 rounded text-xs font-black uppercase hover:bg-orange-500/20 transition-colors" data-type="game">+ ${ui.editorBlockGame || 'Game'}</button>
                    </div>
                </details>
                <button id="btn-magic-draft" class="ml-auto px-3 py-1.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 rounded text-xs font-bold uppercase hover:bg-purple-500/20 flex items-center gap-1 transition-colors">
                    <span>✨</span> ${ui.editorToolbarMagicAi}
                </button>
            </div>` : ''}
            
            <div class="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6">
                <!-- Inner Container to constrain content width -->
                <div class="max-w-5xl mx-auto w-full space-y-6">
                    
                    <!-- METADATA GRID -->
                    <div class="grid grid-cols-12 gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-800/25">
                         <div class="col-span-3 sm:col-span-2 relative">
                             <label class="text-[9px] uppercase font-bold opacity-50 block mb-1">${ui.editorLabelIcon}</label>
                             <button id="btn-emoji" class="w-full h-10 rounded text-xl flex items-center justify-center hover:brightness-110 transition-colors ${inputClass}">${this.meta.icon}</button>
                             <div id="emoji-picker" class="hidden absolute top-12 left-0 w-64 bg-slate-800 shadow-2xl rounded border border-slate-600 z-50 p-2 h-48 overflow-y-auto custom-scrollbar">
                                ${Object.entries(EMOJI_DATA).map(([catKey, emojis]) => `
                                    <div class="text-[9px] font-bold text-slate-400 mt-1 mb-1 px-1 uppercase">${ui[catKey]}</div>
                                    <div class="grid grid-cols-6 gap-1">
                                        ${emojis.map(e => `<button class="emoji-btn hover:bg-white/10 rounded p-1 text-lg">${e}</button>`).join('')}
                                    </div>
                                `).join('')}
                             </div>
                         </div>
                         <div class="col-span-9 sm:col-span-10">
                             <label class="text-[9px] uppercase font-bold opacity-50 block mb-1">${ui.editorLabelTitle}</label>
                             <input id="meta-title" class="w-full h-10 px-3 rounded outline-none ${inputClass}" value="${this.meta.title}" placeholder="${ui.editorBlockPlaceholder}">
                         </div>
                         <div class="col-span-4 sm:col-span-3">
                             <label class="text-[9px] uppercase font-bold opacity-50 block mb-1">${ui.editorLabelOrder}</label>
                             <input id="meta-order" type="number" class="w-full h-8 px-2 rounded text-xs outline-none ${inputClass}" value="${this.meta.order}">
                         </div>
                         <div class="col-span-8 sm:col-span-9">
                             <label class="text-[9px] uppercase font-bold opacity-50 block mb-1">${ui.editorLabelDesc}</label>
                             <input id="meta-desc" class="w-full h-8 px-2 rounded text-xs outline-none ${inputClass}" value="${this.meta.description}" placeholder="${ui.editorMetaDescPlaceholder}">
                         </div>
                    </div>
                    
                    <!-- VISUAL EDITOR -->
                    <div id="visual-editor" 
                         class="w-full min-h-[68vh] p-6 md:p-8 outline-none ${editorBg} ${proseClass} rounded-xl text-base shadow-sm leading-7" 
                         contenteditable="${!this.isMetaJson}" 
                         spellcheck="false">
                         ${bodyContent}
                    </div>
                    
                    <div class="h-20"></div> <!-- Scroll Spacer -->
                </div>
            </div>
        </div>`;
        
        this.bindEvents();
        this.updateUndoButton();
    }

    bindEvents() {
        this.querySelector('#btn-cancel').onclick = () => this.closeEditor();
        this.querySelector('#btn-submit').onclick = () => this.submitChanges();
        
        const btnDraft = this.querySelector('#btn-magic-draft');
        if (btnDraft) btnDraft.onclick = () => this.toggleAiPrompt();
        
        const btnCancelAi = this.querySelector('#btn-cancel-ai');
        if (btnCancelAi) btnCancelAi.onclick = () => this.toggleAiPrompt();
        
        const btnRunAi = this.querySelector('#btn-run-ai');
        if (btnRunAi) btnRunAi.onclick = () => {
            const val = this.querySelector('#inp-ai-prompt').value;
            if(val) this.runDraft(val);
        };
        
        const btnUndo = this.querySelector('#btn-undo');
        if (btnUndo) btnUndo.onclick = () => this.undo();
        
        this.querySelector('#btn-emoji').onclick = (e) => {
            e.stopPropagation();
            this.toggleEmojiPicker();
        };
        
        this.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.selectEmoji(e.currentTarget.textContent);
            };
        });
        
        this.querySelectorAll('.tool-btn').forEach(btn => {
            btn.onclick = () => this.execCmd(btn.dataset.cmd, btn.dataset.val);
        });
        this.querySelectorAll('.block-btn').forEach(btn => {
            btn.onclick = () => this.insertBlock(btn.dataset.type);
        });
        const editor = this.querySelector('#visual-editor');
        if (editor) {
            editor.addEventListener('input', () => {
                if (this.saveState !== 'saving') {
                    this.saveState = 'idle';
                    this.updateSaveStateUI();
                }
            });
        }
        
        // Hide emoji picker on outside click
        this.onclick = (e) => {
            if(!e.target.closest('#emoji-picker') && !e.target.closest('#btn-emoji')) {
                const p = this.querySelector('#emoji-picker');
                if(p) p.classList.add('hidden');
            }
        };

        // Game block topic picker (populate + add/clear)
        const buildTopicOptions = () => {
            const sel = this.node;
            if (!sel) return [];
            // Determine module context: nearest branch/root parent (or self if already branch/root)
            const findModule = () => {
                let cur = sel;
                if (cur.type === 'branch' || cur.type === 'root') return cur;
                while (cur && cur.parentId) {
                    const p = store.findNode(cur.parentId);
                    if (!p) break;
                    if (p.type === 'branch' || p.type === 'root') return p;
                    cur = p;
                }
                return sel.parentId ? store.findNode(sel.parentId) : sel;
            };
            const moduleNode = findModule();
            if (!moduleNode) return [];
            const out = [];
            const walk = (n) => {
                if (!n) return;
                if (n.type === 'leaf') {
                    // Filter out "game item" leaves (heuristic: content has @game:)
                    const c = String(n.content || '');
                    if (/^\s*@game:\s*/m.test(c.slice(0, 8000))) return;
                    out.push({ id: String(n.id), name: String(n.name || n.id) });
                    return;
                }
                if (n.type === 'branch' || n.type === 'root') {
                    // Also allow selecting whole sub-branches
                    out.push({ id: String(n.id), name: String(n.name || n.id) });
                }
                if (n.type === 'exam') return;
                if (Array.isArray(n.children)) n.children.forEach(walk);
            };
            walk(moduleNode);
            return out;
        };

        const syncGameBlocks = () => {
            const options = buildTopicOptions();
            const optHtml =
                options
                    .map(
                        (o) =>
                            `<option value="${String(o.id).replace(/"/g, '&quot;')}">${String(o.name)
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')} (${o.id})</option>`
                    )
                    .join('');

            const manualGames = (store.userStore?.state?.installedGames || []).map((g) => ({
                id: String(g.id || ''),
                name: String(g.name || 'Game'),
                url: String(g.url || ''),
                icon: String(g.icon || '🎮'),
                isManual: true
            }));
            const discoveredGames = Array.isArray(this._editorDiscoveredGames)
                ? this._editorDiscoveredGames
                : [];
            const games = [...discoveredGames, ...manualGames];
            const gamesHtml = games
                .filter((g) => g.id && g.url)
                .map(
                    (g) =>
                        `<option value="${g.id.replace(/"/g, '&quot;')}" data-url="${g.url
                            .replace(/"/g, '&quot;')}" data-name="${g.name.replace(/"/g, '&quot;')}" data-icon="${g.icon.replace(/"/g, '&quot;')}">${
                            g.icon
                        } ${g.name}${g.isManual ? '' : ' · repo'}</option>`
                )
                .join('');

            this.querySelectorAll('.arborito-game-edit').forEach((block) => {
                const existingSel = block.querySelector('.game-existing-select');
                if (existingSel && !existingSel.dataset._populated) {
                    existingSel.insertAdjacentHTML('beforeend', gamesHtml);
                    existingSel.dataset._populated = 'true';
                }

                const select = block.querySelector('.game-topic-select');
                if (select && !select.dataset._populated) {
                    select.insertAdjacentHTML('beforeend', optHtml);
                    select.dataset._populated = 'true';
                }
                const listEl = block.querySelector('.game-topics-list');
                const inp = block.querySelector('.game-topics-input');
                const urlInp = block.querySelector('.game-url-input');
                const labelInp = block.querySelector('.game-label-input');
                const updateList = () => {
                    const ui = store.ui;
                    const val = inp ? inp.value : '';
                    const ids = String(val).split(',').map((s) => s.trim()).filter(Boolean);
                    if (listEl) listEl.textContent = ids.length ? ids.join(', ') : (ui.editorBlockGameTopicsNone || 'No topics selected');
                };
                updateList();

                const useBtn = block.querySelector('.game-existing-use');
                if (useBtn && !useBtn.dataset._bound) {
                    useBtn.dataset._bound = 'true';
                    useBtn.onclick = (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        const opt = existingSel?.selectedOptions?.[0];
                        const url = opt?.dataset?.url || '';
                        const name = opt?.dataset?.name || '';
                        if (urlInp && url) urlInp.value = url;
                        if (labelInp && name && !labelInp.value.trim()) labelInp.value = name;
                    };
                }

                const btnAdd = block.querySelector('.game-topic-add');
                if (btnAdd && !btnAdd.dataset._bound) {
                    btnAdd.dataset._bound = 'true';
                    btnAdd.onclick = (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        if (!inp || !select) return;
                        const pick = String(select.value || '').trim();
                        if (!pick) return;
                        const cur = String(inp.value || '').split(',').map((s) => s.trim()).filter(Boolean);

                        // Expand branch/root selections into their leaf children
                        const addIds = [];
                        const node = store.findNode(pick);
                        const visit = (n) => {
                            if (!n) return;
                            if (n.type === 'leaf') {
                                const id = String(n.id);
                                // Skip game-only leaves
                                const c = String(n.content || '');
                                if (/^\s*@game:\s*/m.test(c.slice(0, 8000))) return;
                                addIds.push(id);
                                return;
                            }
                            if (n.type === 'exam') return;
                            if (Array.isArray(n.children)) n.children.forEach(visit);
                        };
                        if (node && (node.type === 'branch' || node.type === 'root')) {
                            visit(node);
                        } else if (node && node.type === 'leaf') {
                            addIds.push(String(node.id));
                        } else if (!node) {
                            // Fallback: if node not found, at least add the raw id
                            addIds.push(pick);
                        }

                        addIds.forEach((id) => {
                            if (!cur.includes(id)) cur.push(id);
                        });

                        inp.value = cur.join(',');
                        block.dataset.topics = inp.value;
                        updateList();
                    };
                }

                const btnClear = block.querySelector('.game-topic-clear');
                if (btnClear && !btnClear.dataset._bound) {
                    btnClear.dataset._bound = 'true';
                    btnClear.onclick = (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        if (inp) inp.value = '';
                        block.dataset.topics = '';
                        updateList();
                    };
                }
            });
        };

        const fetchDiscoveredGames = async () => {
            if (this._editorDiscoveredGamesLoading) return;
            this._editorDiscoveredGamesLoading = true;
            try {
                const repos = store.userStore?.state?.gameRepos || [];
                const all = [];
                const jobs = repos.map(async (repo) => {
                    try {
                        const res = await fetch(repo.url, { cache: 'no-cache' });
                        if (!res.ok) return;
                        const games = await res.json();
                        const repoBase = repo.url.substring(0, repo.url.lastIndexOf('/') + 1);
                        const normalize = (path) => {
                            if (!path) return '';
                            if (path.startsWith('http') || path.startsWith('//')) return path;
                            if (path.startsWith('./')) return repoBase + path.substring(2);
                            if (path.startsWith('/')) return repoBase + path.substring(1);
                            return repoBase + path;
                        };
                        games.forEach((g) => {
                            all.push({
                                id: `${repo.id}:${g.id || g.path || g.url || normalize(g.path || g.url || '')}`,
                                name: String(g.name || g.title || 'Game'),
                                url: normalize(g.path || g.url),
                                icon: String(g.icon || '🎮'),
                                isManual: false
                            });
                        });
                    } catch {
                        /* ignore repo errors in editor */
                    }
                });
                await Promise.all(jobs);
                this._editorDiscoveredGames = all;
                syncGameBlocks();
            } finally {
                this._editorDiscoveredGamesLoading = false;
            }
        };

        // Defer once so DOM is ready, then hydrate discovered games in background
        queueMicrotask(() => {
            syncGameBlocks();
            void fetchDiscoveredGames();
        });
    }
}
customElements.define('arborito-editor', ArboritoEditor);