import { store } from '../../store.js';
import { aiService } from '../../services/ai.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { SAGE_OPEN, sageHideDismissButton, ArboritoSageUICore } from './sage-ui-core.js';

export class ArboritoSageUIChat extends ArboritoSageUICore {
    renderSettings() {
        const ui = store.ui;
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        const deskBackdrop = mob ? 'bg-slate-100 dark:bg-slate-950' : 'arborito-sage-desk-scrim';
        this.className = `${SAGE_OPEN} fixed ${mob ? 'z-[135] arborito-sage-mob-frame' : 'inset-0 z-[135]'} flex pointer-events-none ${mob ? 'flex-col items-stretch p-0' : 'items-center justify-center p-4'} ${deskBackdrop}`;

        const isOllamaActive = aiService.config.provider === 'ollama';
        const isBrowserActive = aiService.config.provider === 'browser';
        const progress = store.value.ai.progress || '';
        let browserPullPct = 0;
        const browserPullMatch = progress.match(/(\d+)%/);
        if (browserPullMatch) browserPullPct = Math.min(100, parseInt(browserPullMatch[1], 10));

        let modelsListHtml = '';
        if (this.ollamaConnectionError) {
             modelsListHtml = `<div class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg text-center"><p class="text-xs font-bold text-red-600 dark:text-red-400 mb-1">${ui.sageOllamaConnectionFailed}</p><button type="button" id="btn-retry-ollama" class="px-3 py-1 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200 text-[10px] font-bold rounded transition-colors">${ui.sageRetryShort}</button></div>`;
        } else if (this.ollamaModels.length === 0 && !this.hasTriedLoadingModels) {
             setTimeout(() => this.loadOllamaModels(), 0);
             modelsListHtml = `<div class="text-center p-4 text-slate-400 text-xs animate-pulse">${ui.sageSearchingModels}</div>`;
        } else if (this.ollamaModels.length === 0) {
             modelsListHtml = `<div class="text-center p-4 text-slate-400 text-xs italic">${ui.sageNoModels}</div>`;
        } else {
             modelsListHtml = this.ollamaModels.map(m => `<div class="flex items-center justify-between p-2 rounded-lg border border-slate-100 dark:border-slate-700"><button type="button" class="flex-1 text-left btn-select-model truncate font-mono text-xs text-slate-700 dark:text-slate-300" data-name="${m.name}">${m.name}</button></div>`).join('');
        }

        const activeBadge = `<span class="text-[10px] font-black bg-green-200 text-green-800 dark:bg-green-900/50 dark:text-green-300 px-2 py-1 rounded">${ui.sageBadgeActive}</span>`;
        const activeBadgeOrange = `<span class="text-[10px] font-black bg-orange-200 text-orange-800 dark:bg-orange-900/45 dark:text-orange-200 px-2 py-1 rounded">${ui.sageBadgeActive}</span>`;
        const browserModelSuggestions = [
            // Top picks (mobile-friendly -> heavier)
            'onnx-community/Qwen3-0.6B-ONNX',
            'HuggingFaceTB/SmolLM2-360M-Instruct',
            'onnx-community/SmolLM2-135M-Instruct-ONNX-GQA',
            // Fallbacks / comparison
            'onnx-community/Qwen2.5-0.5B-Instruct-ONNX'
        ];
        const settingsBody = `
                <div class="p-6 space-y-6 ${mob ? 'pb-[max(1.5rem,env(safe-area-inset-bottom))]' : ''}">
                    <div class="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-800/30">
                        <div class="flex items-center justify-between mb-2"><div class="flex items-center gap-2"><span class="text-2xl">🧠</span><p class="text-sm font-bold text-green-700 dark:text-green-400">${ui.sageSettingsBrowserTitle}</p></div>${isBrowserActive ? activeBadge : ''}</div>
                        <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">${ui.sageSettingsBrowserDesc}</p>
                        <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">${ui.sageSettingsHfModelLabel}</label>
                        <input id="inp-browser-model" list="sage-browser-model-suggestions" type="text" class="w-full text-xs p-2 border rounded mb-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100" value="${aiService.config.browserModel}">
                        <datalist id="sage-browser-model-suggestions">
                            ${browserModelSuggestions.map((m) => `<option value="${m}"></option>`).join('')}
                        </datalist>
                        <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mb-4">${ui.sageBrowserModelHint}</p>

                        <div class="grid grid-cols-2 gap-3 mb-4">
                            <div>
                                <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">${ui.sageContextPresetLabel || 'Context preset'}</label>
                                <select id="sel-context-preset" class="w-full text-xs p-2 border rounded bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100">
                                    <option value="micro" ${aiService.config.contextPreset === 'micro' ? 'selected' : ''}>${ui.sageContextPresetMicro || 'Micro (dumb model)'}</option>
                                    <option value="minimal" ${aiService.config.contextPreset === 'minimal' ? 'selected' : ''}>${ui.sageContextPresetMinimal || 'Minimal'}</option>
                                    <option value="balanced" ${aiService.config.contextPreset === 'balanced' ? 'selected' : ''}>${ui.sageContextPresetBalanced || 'Balanced'}</option>
                                </select>
                                <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1">${ui.sageContextPresetHint || 'Controls how much history/evidence is sent to the model.'}</p>
                            </div>
                            <div>
                                <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">${ui.sageMaxNewTokensLabel || 'Max new tokens'}</label>
                                <input id="inp-browser-max-tokens" type="number" min="64" max="1024" step="32" class="w-full text-xs p-2 border rounded bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100" value="${aiService.config.browserMaxNewTokens || 384}">
                                <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1">${ui.sageMaxNewTokensHint || 'Lower = faster and cheaper, but shorter answers.'}</p>
                            </div>
                        </div>

                        ${progress && isBrowserActive ? `<div class="mb-4"><p class="text-[10px] font-bold text-green-600 dark:text-green-400 mb-1">${progress}</p><div class="w-full bg-green-200 dark:bg-green-900/40 rounded-full h-1.5 overflow-hidden"><div class="bg-green-600 dark:bg-green-500 h-full min-w-0 transition-[width] duration-300 ease-out" style="width:${browserPullPct}%"></div></div></div>` : ''}
                        <button type="button" id="btn-use-browser" class="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-xs shadow transition-colors">${ui.sageSettingsActivateBrowser}</button>
                    </div>
                    <div class="h-px bg-slate-200 dark:bg-slate-800"></div>
                    <div class="bg-orange-50 dark:bg-orange-900/10 p-4 rounded-xl border border-orange-100 dark:border-orange-800/30">
                        <div class="flex items-center justify-between mb-2"><div class="flex items-center gap-2"><span class="text-2xl">💻</span><p class="text-sm font-bold text-orange-700 dark:text-orange-400">${ui.sageSettingsOllamaTitle}</p></div>${isOllamaActive ? activeBadgeOrange : ''}</div>
                        <label class="text-[10px] font-bold text-slate-400 uppercase">${ui.sageSettingsHostLabel}</label>
                        <input id="inp-ollama-host" type="text" class="w-full text-xs p-2 border rounded mb-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100" value="${aiService.config.ollamaHost}">
                        <label class="text-[10px] font-bold text-slate-400 uppercase">${ui.sageSettingsModelLabel}</label>
                        <input id="inp-ollama-model" type="text" class="w-full text-xs p-2 border rounded mb-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100" value="${aiService.config.ollamaModel}">
                        <div class="space-y-2"><div class="flex gap-2"><input id="inp-pull-model" type="text" placeholder="${ui.sageOllamaPullPlaceholder}" class="flex-1 text-xs p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"><button type="button" id="btn-pull" class="px-3 py-1 bg-slate-800 dark:bg-slate-600 text-white text-xs font-bold rounded hover:bg-black dark:hover:bg-slate-500">${ui.sagePull}</button></div><p id="pull-status" class="text-[10px] font-mono text-blue-500 h-4">${this.pullStatus}</p><div class="max-h-24 overflow-y-auto custom-scrollbar bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">${modelsListHtml}</div></div>
                        <button type="button" id="btn-use-ollama" class="w-full mt-4 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg text-xs shadow transition-colors">${ui.sageSettingsConnectOllama}</button>
                    </div>
                </div>`;

        this.innerHTML = mob ? `
            <div class="pointer-events-auto flex flex-col h-full max-h-full min-h-0 w-full max-w-[100vw] overflow-hidden animate-in fade-in duration-200">
                <div class="arborito-modal-dock-panel flex flex-col flex-1 min-h-0 h-full overflow-hidden">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${hideDismiss ? '' : modalNavBackHtml(ui, 'arborito-mmenu-back w-11 h-11 shrink-0', { tagClass: 'btn-close' })}
                    <span class="text-2xl shrink-0" aria-hidden="true">⚙️</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.sageConfigTitle}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">${settingsBody}</div>
                </div>
            </div>
        ` : `
            <div class="pointer-events-auto arborito-sage-settings-shell bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col animate-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 items-center gap-2">
                    <span class="text-2xl shrink-0" aria-hidden="true">⚙️</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.sageConfigTitle}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">${settingsBody}</div>
            </div>
        `;
        this.querySelectorAll('.btn-close').forEach((b) => {
            b.onclick = () => this.close();
        });
        this.querySelector('#btn-use-browser').onclick = () => this.saveConfig('browser');
        this.querySelector('#btn-use-ollama').onclick = () => this.saveConfig('ollama');
        this.querySelector('#btn-pull').onclick = () => this.pullModel();
        const btnRetry = this.querySelector('#btn-retry-ollama');
        if (btnRetry) btnRetry.onclick = () => this.loadOllamaModels();
        this.querySelectorAll('.btn-select-model').forEach(b => {
             b.onclick = (e) => this.querySelector('#inp-ollama-model').value = e.currentTarget.dataset.name;
        });
    }

    renderChat() {
        const ui = store.ui;
        const chatArea = this.querySelector('#sage-chat-area');
        
        const aiState = store.value.ai;
        const isArchitect = this.mode === 'architect';
        
        const displayMessages = aiState.messages.length > 0 ? aiState.messages : [{ 
            role: 'assistant', 
            content: isArchitect ? ui.sageArchitectIntro : ui.sageHello 
        }];
        
        const displayStatus = aiState.status;
        const isOllama = aiService.config.provider === 'ollama';
        const isBrowser = aiService.config.provider === 'browser';
        const isThinking = displayStatus === 'thinking' || displayStatus === 'loading';
        
        let sendBtnColor = isArchitect
            ? 'bg-orange-600'
            : isOllama
              ? 'bg-orange-600'
              : isBrowser
                ? 'bg-green-600'
                : 'bg-teal-600';
        let btnIcon = `<svg class="w-5 h-5 translate-x-0.5 -translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>`;
        let btnClass = `w-11 h-11 ${sendBtnColor} text-white rounded-xl hover:opacity-90 transition-all flex items-center justify-center shadow-lg active:scale-95`;

        if (isThinking) {
            btnClass = "w-11 h-11 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all flex items-center justify-center shadow-lg active:scale-95 animate-pulse";
            btnIcon = `<div class="w-4 h-4 bg-white rounded-sm"></div>`; 
        }

        const getMessagesHTML = () => {
             return displayMessages.map(m => {
                let displayContent = m.content;
                let blueprintCard = '';
                const blueprint = this.extractBlueprint(m.content);
                if (blueprint && m.role === 'assistant') {
                    displayContent = displayContent.replace(/```(?:json)?\s*[\s\S]*?\s*```/ig, '');
                    if (displayContent.trim().startsWith('{') && displayContent.trim().endsWith('}')) displayContent = ""; 
                    if (!displayContent.trim()) {
                        displayContent = ui.sageBlueprintStructureMessage;
                    }
                    const cardTitle = blueprint.title || ui.sageBlueprintDefaultTitle;
                    const msgReady = ui.sageBlueprintReady;
                    const btnLabel = ui.sageBuildBtn;
                    blueprintCard = `
                        <div class="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm animate-in fade-in zoom-in duration-300">
                            <div class="bg-slate-50 dark:bg-slate-900 p-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 flex items-center justify-center text-xl">🏗️</div>
                                <div><p class="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">${msgReady}</p><p class="text-[10px] text-slate-500 truncate max-w-[150px]">${cardTitle}</p></div>
                            </div>
                            <button class="btn-construct-blueprint w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors active:bg-green-700" data-msg-index="${displayMessages.indexOf(m)}"><span>🔨</span> ${btnLabel}</button>
                        </div>
                    `;
                }
                let contentHtml = this.formatMessage(displayContent);
                return `
                <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 fade-in duration-300">
                    <div class="max-w-[85%] relative group text-left">
                        <div class="p-3 rounded-2xl text-sm leading-relaxed shadow-sm select-text ${m.role === 'user' ? (sendBtnColor + ' text-white rounded-br-none') : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-none'}">
                            ${contentHtml}
                        </div>
                        ${blueprintCard}
                    </div>
                </div>
             `;
             }).join('') + (isThinking ? 
                `<div class="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-bl-none border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3">
                        <div class="flex gap-1.5">
                            <div class="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                            <div class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay:0.15s"></div>
                            <div class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay:0.3s"></div>
                        </div>
                        <span class="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">${ui.sageThinking}</span>
                    </div>
                </div>` : '');
        };

        if (chatArea) {
            chatArea.innerHTML = getMessagesHTML();
            chatArea.scrollTop = chatArea.scrollHeight;
            this.bindMessageEvents(chatArea);
            
            const btnSubmit = this.querySelector('button[type="submit"]');
            if(btnSubmit) {
                btnSubmit.className = btnClass;
                btnSubmit.innerHTML = btnIcon;
            }
            const inp = this.querySelector('#sage-input');
            if(inp) {
                inp.disabled = isThinking;
                inp.style.opacity = isThinking ? '0.5' : '1';
                inp.style.cursor = isThinking ? 'not-allowed' : 'text';
                if(!isThinking) inp.focus();
            }
            return;
        }

        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        this.className = mob
            ? `${SAGE_OPEN} fixed z-[135] arborito-sage-mob-frame flex flex-col items-stretch pointer-events-none bg-slate-100 dark:bg-slate-950`
            : `${SAGE_OPEN} fixed inset-x-0 bottom-0 z-[135] flex flex-col items-end md:bottom-6 md:right-6 md:w-auto pointer-events-none`;

        let providerName = isBrowser
            ? ui.sageProviderInBrowserCpu
            : isOllama
              ? ui.sageProviderLocalOllama
              : ui.sageProviderNotConfigured;
        if (isArchitect) providerName = ui.sageProviderArchitectMode;

        const sageTitleText = isArchitect ? ui.sageArchitectTitle : ui.sageTitle;
        const sageHeaderMob = `
                <div class="shrink-0 z-10 bg-white/90 dark:bg-slate-900/95 border-b border-slate-200/80 dark:border-slate-700/80">
                    <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-center gap-2">
                        ${hideDismiss ? '' : modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-close' })}
                        <span class="text-2xl shrink-0 leading-none relative inline-flex" aria-hidden="true"><span>🦉</span>${isArchitect ? '<span class="absolute -top-1 -right-2 text-[10px] leading-none" aria-hidden="true">⛑️</span>' : ''}</span>
                        <div class="min-w-0 flex-1">
                            <h2 class="arborito-mmenu-subtitle m-0 leading-tight">${sageTitleText}</h2>
                            <p class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1 truncate"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true"></span>${providerName}</p>
                        </div>
                        ${hideDismiss ? '' : modalWindowCloseXHtml(ui, 'btn-close')}
                    </div>
                    <div class="flex items-center justify-end gap-1.5 px-4 pb-2.5 pt-1">
                        <button type="button" id="btn-clear" class="arborito-mmenu-back w-10 h-10 !rounded-xl" title="${ui.sageClearChat}">🗑️</button>
                        <button type="button" id="btn-settings" class="arborito-mmenu-back w-10 h-10 !rounded-xl" title="${ui.sageSettings}">⚙️</button>
                    </div>
                </div>`;
        const sageHeaderDesk = `
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 z-10 flex flex-wrap items-center gap-2">
                    <span class="text-2xl shrink-0 leading-none relative inline-flex" aria-hidden="true"><span>🦉</span>${isArchitect ? '<span class="absolute -top-1 -right-2 text-[10px] leading-none" aria-hidden="true">⛑️</span>' : ''}</span>
                    <div class="min-w-0 flex-1 basis-[min(100%,12rem)]">
                        <h2 class="arborito-mmenu-subtitle m-0 leading-tight">${sageTitleText}</h2>
                        <p class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1 truncate"><span class="w-1.5 h-1.5 rounded-full ${isArchitect ? 'bg-amber-500' : isOllama ? 'bg-orange-500' : isBrowser ? 'bg-emerald-500' : 'bg-slate-400'} shrink-0" aria-hidden="true"></span>${providerName}</p>
                    </div>
                    <div class="flex items-center gap-1 shrink-0 ml-auto">
                        <button type="button" id="btn-clear" class="arborito-mmenu-back w-10 h-10 !rounded-xl" title="${ui.sageClearChat}">🗑️</button>
                        <button type="button" id="btn-settings" class="arborito-mmenu-back w-10 h-10 !rounded-xl" title="${ui.sageSettings}">⚙️</button>
                        ${hideDismiss ? '' : modalWindowCloseXHtml(ui, 'btn-close')}
                    </div>
                </div>`;

        const sageChatBody = `
                ${mob ? sageHeaderMob : sageHeaderDesk}
                <div id="sage-chat-area" class="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 ${mob ? 'bg-slate-50/90 dark:bg-slate-950' : 'bg-slate-50 dark:bg-slate-950/30'} custom-scrollbar scroll-smooth">
                     ${getMessagesHTML()}
                </div>
                
                ${!isOllama && !isBrowser ? `<div class="px-4 py-1 text-center bg-white/90 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0"><p class="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-widest">${ui.sageAiNotConfigured}</p></div>` : ''}

                ${!isArchitect ? `<div class="px-3 py-2 flex gap-2 overflow-x-auto custom-scrollbar bg-white/95 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0"><button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors border border-blue-100 dark:border-blue-800" data-action="summarize">📝 ${ui.sageBtnSummarize}</button><button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors border border-blue-100 dark:border-blue-800" data-action="explain">🎓 ${ui.sageBtnExplain}</button><button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors border border-blue-100 dark:border-blue-800" data-action="quiz">❓ ${ui.sageBtnQuiz}</button></div>` : ''}

                <form id="sage-form" class="p-3 bg-white/95 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-2 shrink-0 ${mob ? 'pb-[calc(0.75rem+env(safe-area-inset-bottom,20px))]' : 'pb-3'}">
                    <input id="sage-input" type="text" class="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 ${isOllama || isArchitect ? 'focus:ring-orange-500' : 'focus:ring-green-500'} placeholder:text-slate-500 dark:placeholder:text-slate-400 disabled:opacity-50" placeholder="${isArchitect ? ui.sageArchitectPlaceholder : ui.sageInputPlaceholder}" autocomplete="off" ${isThinking ? 'disabled style="cursor:not-allowed; opacity:0.5"' : ''}>
                    <button type="submit" class="${btnClass}">${btnIcon}</button>
                </form>`;

        this.innerHTML = mob
            ? `
            <div class="pointer-events-auto arborito-sage-chat-shell-mob flex flex-col h-full min-h-0 w-full overflow-hidden animate-in slide-in-from-bottom-10 fade-in">
                <div class="arborito-modal-dock-panel flex flex-col flex-1 min-h-0 h-full max-h-full overflow-hidden">
                    ${sageChatBody}
                </div>
            </div>
        `
            : `
            <div class="pointer-events-auto arborito-sage-chat-shell flex flex-col animate-in slide-in-from-bottom-10 fade-in overflow-hidden">
                ${sageChatBody}
            </div>
        `;

        this.querySelectorAll('.btn-close').forEach((b) => {
            b.onclick = () => this.close();
        });
        this.querySelector('#btn-settings').onclick = () => { this.mode = 'settings'; this.render(); };
        this.querySelector('#btn-clear').onclick = () => store.clearSageChat();

        const form = this.querySelector('#sage-form');
        form.onsubmit = (e) => {
             e.preventDefault();
             if (isThinking) { store.abortSage(); return; }
             const inp = this.querySelector('#sage-input');
             if (inp.value.trim()) {
                 if (isArchitect) store.update({ ai: { ...store.value.ai, contextMode: 'architect' } }); 
                 else store.update({ ai: { ...store.value.ai, contextMode: 'normal' } }); 
                 store.chatWithSage(inp.value.trim());
                 inp.value = '';
             }
        };

        this.querySelectorAll('.btn-qa').forEach(btn => {
            btn.onclick = () => this.runQuickAction(btn.dataset.action);
        });

        const area = this.querySelector('#sage-chat-area');
        if(area) {
            area.scrollTop = area.scrollHeight;
            this.bindMessageEvents(area);
        }
    }
    
    bindMessageEvents(container) {
        container.querySelectorAll('.btn-sage-privacy').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                const cur = store.value.modal;
                const fromMobileMore = !!(cur && typeof cur === 'object' && cur.fromMobileMore);
                store.setModal(fromMobileMore ? { type: 'privacy', fromMobileMore: true } : 'privacy');
            }
        });
        container.querySelectorAll('.btn-construct-blueprint').forEach(btn => {
            btn.onclick = (e) => this.handleConstruct(e);
        });
    }

    formatMessage(text) {
        let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
        formatted = formatted.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="text-blue-500 hover:underline inline-flex items-center gap-1 font-bold"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>$1</a>');
        return formatted;
    }
}
