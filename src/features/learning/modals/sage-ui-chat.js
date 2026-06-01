import { store } from '../../../core/store.js';
import { aiService } from '../ai.js';
import { isDesktopLlamacppBridgePresent } from '../ai-llamacpp-bridge.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { bindCloseTaps } from '../../../shared/ui/mobile-tap.js';
import { SAGE_OPEN, sageHideDismissButton, ArboritoSageUICore } from './sage-ui-core.js';
import { escHtml } from '../../tree-graph/graph/graph-mobile-shared.js';
export class ArboritoSageUIChat extends ArboritoSageUICore {
    renderSettings() {
        const ui = store.ui;
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        const deskBackdrop = mob ? '' : 'arborito-sage-desk-scrim';
        this.className = mob
            ? this._sageMobHostClass()
            : `${SAGE_OPEN} fixed inset-0 z-[160] flex pointer-events-none items-center justify-center p-4 ${deskBackdrop}`;

        const isDesktop = isDesktopLlamacppBridgePresent();
        const isProviderActive = isDesktop
            ? aiService.config.provider === 'llamacpp'
            : aiService.config.provider === 'browser';
        const progress = store.value.ai.progress || '';
        let providerPullPct = 0;
        const providerPullMatch = progress.match(/(\d+)%/);
        if (providerPullMatch) providerPullPct = Math.min(100, parseInt(providerPullMatch[1], 10));

        const activeBadge = `<span class="arborito-pill arborito-pill--sm arborito-pill--green">${ui.sageBadgeActive}</span>`;
        /* GGUF model suggestions; recommended default is listed first.
           Both desktop and in-browser builds consume the same GGUF model format. */
        const browserModelSuggestions = [
            'bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf',
            'bartowski/Llama-3.2-3B-Instruct-GGUF:Llama-3.2-3B-Instruct-Q4_K_M.gguf',
            'bartowski/SmolLM2-360M-Instruct-GGUF:SmolLM2-360M-Instruct-Q4_K_M.gguf',
            'bartowski/SmolLM2-135M-Instruct-GGUF:SmolLM2-135M-Instruct-Q4_K_M.gguf'
        ];
        const showProgressBar = !!progress;

        const tileIcon = isDesktop ? '🖥️' : '🌐';
        const tileTitle = isDesktop
            ? (ui.sageSettingsDesktopTitle || 'Native (desktop)')
            : ui.sageSettingsBrowserTitle;
        const tileDesc = isDesktop
            ? (ui.sageSettingsDesktopDesc || 'Runs natively on your machine. Uses your CPU and, when available, GPU (Metal/CUDA/Vulkan) for maximum performance.')
            : ui.sageSettingsBrowserDesc;

        const optionalBanner = `
                    <div class="bg-blue-50 dark:bg-blue-900/15 border border-blue-100 dark:border-blue-800/40 p-3 rounded-xl text-xs text-blue-900 dark:text-blue-100 leading-relaxed">
                        ${ui.sageAiOptionalBanner || 'AI in Arborito is fully <strong>optional</strong>. Every lesson, quiz, and game works without it.'}
                    </div>`;

        const settingsBody = `
                <div class="p-6 space-y-6 ${mob ? 'pb-[max(1.5rem,env(safe-area-inset-bottom))]' : ''}">
                    ${optionalBanner}
                    <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed m-0">${ui.sageGamesAiSettingsNote || ui.sageConfigDesc || ''}</p>
                    <div class="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-800/30">
                        <div class="flex items-center justify-between mb-2"><div class="flex items-center gap-2"><span class="text-2xl">${tileIcon}</span><p class="text-sm font-bold text-green-700 dark:text-green-400">${tileTitle}</p></div>${isProviderActive ? activeBadge : ''}</div>
                        <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">${tileDesc}</p>
                        <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">${ui.sageSettingsHfModelLabel}</label>
                        <input id="inp-browser-model" list="sage-browser-model-suggestions" type="text" class="arborito-input arborito-input--compact text-xs mb-2" value="${aiService.config.browserModel}">
                        <datalist id="sage-browser-model-suggestions">
                            ${browserModelSuggestions.map((m) => `<option value="${m}"></option>`).join('')}
                        </datalist>
                        <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mb-4">${ui.sageBrowserModelHint}</p>
                        <p class="text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed mb-4">${ui.sageBrowserModelPublicHint || ''}</p>

                        <div class="grid grid-cols-2 gap-3 mb-4">
                            <div>
                                <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">${ui.sageContextPresetLabel || 'Perfil de contexto'}</label>
                                <select id="sel-context-preset" class="arborito-select arborito-select--compact text-xs">
                                    <option value="micro" ${aiService.config.contextPreset === 'micro' ? 'selected' : ''}>${ui.sageContextPresetMicro || 'Micro (modelos muy pequeños)'}</option>
                                    <option value="minimal" ${aiService.config.contextPreset === 'minimal' ? 'selected' : ''}>${ui.sageContextPresetMinimal || 'Mínimo'}</option>
                                    <option value="balanced" ${aiService.config.contextPreset === 'balanced' ? 'selected' : ''}>${ui.sageContextPresetBalanced || 'Equilibrado'}</option>
                                </select>
                                <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1">${ui.sageContextPresetHint || ''}</p>
                            </div>
                            <div>
                                <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">${ui.sageMaxNewTokensLabel || 'Máx. tokens nuevos'}</label>
                                <input id="inp-browser-max-tokens" type="number" min="64" max="1024" step="32" class="arborito-input arborito-input--compact text-xs" value="${aiService.config.browserMaxNewTokens || 384}">
                                <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1">${ui.sageMaxNewTokensHint || ''}</p>
                            </div>
                        </div>

                        ${showProgressBar ? `<div class="mb-4"><p class="text-[10px] font-bold text-green-600 dark:text-green-400 mb-1">${progress}</p><div class="w-full bg-green-200 dark:bg-green-900/40 rounded-full h-1.5 overflow-hidden"><div class="bg-green-600 dark:bg-green-500 h-full min-w-0 transition-[width] duration-300 ease-out" style="width:${providerPullPct}%"></div></div></div>` : ''}
                        <button type="button" id="btn-use-browser" class="arborito-cta-green w-full py-3 font-bold rounded-lg text-xs shadow transition-colors transition-transform active:scale-[0.98]">${ui.sageSettingsAcceptChanges || 'Aceptar cambios'}</button>
                        <button type="button" id="btn-reset-config" class="w-full mt-2 py-2 rounded-lg text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline-offset-2 hover:underline transition-colors">${ui.sageSettingsRestoreDefaults || 'Restablecer configuración'}</button>
                    </div>
                </div>`;

        const settingsAnim = this._sageEnterAnimClass();
        const settingsHero = this._sageHeroHtml(ui, {
            mob,
            title: escHtml(ui.sageConfigTitle),
            leadingIcon: '<span class="text-2xl shrink-0" aria-hidden="true">⚙️</span>',
            showBack: !hideDismiss,
            showClose: !hideDismiss,
            backTagClass: 'btn-close',
        });
        this.innerHTML = mob
            ? this._sageMobDockPanelHtml(`${settingsHero}<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">${settingsBody}</div>`, settingsAnim)
            : `
            <div class="pointer-events-auto arborito-float-modal-card arborito-float-modal-card--auto-h arborito-sage-settings-shell relative overflow-hidden flex flex-col animate-in zoom-in duration-200">
                ${settingsHero}
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">${settingsBody}</div>
            </div>
        `;
        bindCloseTaps(this, () => this.close());
        this.querySelector('#btn-use-browser').onclick = () => this.saveConfig();
        const resetBtn = this.querySelector('#btn-reset-config');
        if (resetBtn) {
            resetBtn.onclick = () => {
                /* Reset to factory defaults and re-render so inputs reflect new values. */
                aiService.resetConfig();
                this.lastRenderKey = null;
                this.render();
            };
        }
    }

    runQuickAction(action) {
        const ui = store.ui;
        const node = store.value.selectedNode || store.value.previewNode;
        const title = node?.name || '';
        let msg = '';
        if (action === 'summarize') {
            msg = (ui.sageQuickSummarize || 'Summarize this lesson: {title}').replace('{title}', title);
        } else if (action === 'explain') {
            msg = (ui.sageQuickExplain || 'Explain this topic clearly: {title}').replace('{title}', title);
        } else if (action === 'quiz') {
            msg = ui.sageQuickQuiz || 'Ask me a practice question from this lesson.';
        }
        if (!msg) return;
        store.update({ ai: { ...store.value.ai, contextMode: 'sage-tree' } });
        store.chatWithSage(msg);
    }

    renderChat() {
        const ui = store.ui;
        const chatArea = this.querySelector('#sage-chat-area');
        
        const aiState = store.value.ai;
        
        const displayMessages = aiState.messages.length > 0 ? aiState.messages : [{ 
            role: 'assistant', 
            content: ui.sageDynamicHello || ui.sageHello 
        }];
        
        const displayStatus = aiState.status;
        const isLlamacpp = aiService.config.provider === 'llamacpp';
        const isBrowser = aiService.config.provider === 'browser';
        const isProviderReady = isLlamacpp || isBrowser;
        const isThinking = displayStatus === 'thinking' || displayStatus === 'loading';
        const isStreaming = displayStatus === 'streaming';

        let sendBtnColor = isLlamacpp ? 'bg-emerald-600' : (isBrowser ? 'bg-purple-600' : 'bg-slate-500');
        let btnIcon = `<svg class="w-5 h-5 translate-x-0.5 -translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>`;
        let btnClass = `w-11 h-11 ${sendBtnColor} text-white rounded-xl hover:opacity-90 transition-all flex items-center justify-center shadow-lg active:scale-95`;

        if (isThinking) {
            btnClass = "w-11 h-11 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all flex items-center justify-center shadow-lg active:scale-95 animate-pulse";
            btnIcon = `<div class="w-4 h-4 bg-white rounded-sm"></div>`; 
        } else if (isStreaming) {
            btnClass = "w-11 h-11 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all flex items-center justify-center shadow-lg active:scale-95";
            btnIcon = `<div class="flex gap-0.5"><div class="w-1.5 h-1.5 bg-white rounded-full animate-bounce"></div><div class="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style="animation-delay:0.1s"></div></div>`; 
        }

        const getMessagesHTML = () => {
             return displayMessages.map(m => {
                let displayContent = m.content;
                let hasCursor = false;
                let contentForFormat = displayContent;
                if (isStreaming && m.role === 'assistant' && displayContent.endsWith('▌')) {
                    hasCursor = true;
                    contentForFormat = displayContent.slice(0, -1);
                }
                let contentHtml = this.formatMessage(contentForFormat);
                if (hasCursor) {
                    contentHtml += '<span class="inline-block w-2 h-4 bg-current ml-0.5 animate-pulse"></span>';
                }
                return `
                <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 fade-in duration-300">
                    <div class="max-w-[85%] relative group text-left">
                        <div class="p-3 rounded-2xl text-sm leading-relaxed shadow-sm select-text ${m.role === 'user' ? (sendBtnColor + ' text-white rounded-br-none') : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-none'}">
                            ${contentHtml}
                        </div>
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
                        <span class="arborito-eyebrow arborito-eyebrow--md">${escHtml(ui.sageThinking)}</span>
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
                const isBusy = isThinking || isStreaming;
                inp.disabled = isBusy;
                inp.style.opacity = isBusy ? '0.5' : '1';
                inp.style.cursor = isBusy ? 'not-allowed' : 'text';
                if(!isBusy) inp.focus();
            }
            return;
        }

        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        this.className = mob
            ? this._sageMobHostClass(!!store.value.constructionMode)
            : `${SAGE_OPEN} fixed inset-x-0 bottom-0 z-[160] flex flex-col items-end md:bottom-6 md:right-6 md:w-auto pointer-events-none`;

        let providerName;
        if (isLlamacpp) {
            providerName = ui.sageProviderDesktopNative || 'Native (desktop)';
        } else if (isBrowser) {
            providerName = ui.sageProviderInBrowserCpu;
        } else {
            providerName = ui.sageProviderNotConfigured;
        }
        const sageTitleText = ui.sageTitle;
        const sageSubtitle =
            `<span class="inline-flex items-center gap-1 truncate"><span class="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" aria-hidden="true"></span>${ui.sageExperimentalBadge || providerName}</span>`;
        const sageTrailing =
            this._sageModeToggleHtml(ui) +
            `<div class="flex items-center gap-1 shrink-0 ml-auto">` +
                `<button type="button" id="btn-clear" class="arborito-icon-btn arborito-icon-btn--md" title="${ui.sageClearChat}">🗑️</button>` +
                `<button type="button" id="btn-settings" class="arborito-icon-btn arborito-icon-btn--md" title="${ui.sageSettings}">⚙️</button>` +
            `</div>`;
        const sageHero = this._sageHeroHtml(ui, {
            mob,
            title: escHtml(sageTitleText),
            subtitle: sageSubtitle,
            trailingHtml: sageTrailing,
            showBack: !hideDismiss,
            showClose: !hideDismiss,
            backTagClass: 'btn-close',
        });

        const sageChatStack = `
                <p class="text-[9px] text-amber-700/90 dark:text-amber-300/90 px-3 py-1.5 m-0 border-t border-amber-100 dark:border-amber-900/30 bg-amber-50/80 dark:bg-amber-950/20 leading-snug shrink-0">${escHtml(ui.sageExperimentalChatNote || '')}</p>
                <div id="sage-chat-area" class="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 ${mob ? 'bg-slate-50/90 dark:bg-slate-950' : 'bg-slate-50 dark:bg-slate-950/30'} custom-scrollbar scroll-smooth">
                     ${getMessagesHTML()}
                </div>
                ${!isProviderReady ? `<div class="px-4 py-1 text-center bg-white/90 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0"><p class="arborito-eyebrow arborito-eyebrow--sm">${ui.sageAiNotConfigured}</p></div>` : ''}
                <div class="sage-chat-quick-actions px-3 py-2 flex gap-2 overflow-x-auto custom-scrollbar bg-white/95 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0"><button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors border border-blue-100 dark:border-blue-800" data-action="summarize">📝 ${ui.sageBtnSummarize}</button><button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors border border-blue-100 dark:border-blue-800" data-action="explain">🎓 ${ui.sageBtnExplain}</button><button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors border border-blue-100 dark:border-blue-800" data-action="quiz">❓ ${ui.sageBtnQuiz}</button></div>
                <form id="sage-form" class="p-3 bg-white/95 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-2 shrink-0 ${mob ? 'pb-[calc(0.75rem+env(safe-area-inset-bottom,20px))]' : 'pb-3'}">
                    <input id="sage-input" type="text" class="arborito-input flex-1 border-none disabled:opacity-50" placeholder="${ui.sageInputPlaceholder}" autocomplete="off" ${(isThinking || isStreaming) ? 'disabled style="cursor:not-allowed; opacity:0.5"' : ''}>
                    <button type="submit" class="${btnClass}">${btnIcon}</button>
                </form>`;

        const sageChatBody = mob
            ? `${sageHero}<div class="arborito-sage-chat-stack flex flex-col flex-1 min-h-0 overflow-hidden min-w-0">${sageChatStack}</div>`
            : `${sageHero}${sageChatStack}`;

        const chatAnim = this._sageEnterAnimClass();
        this.innerHTML = mob
            ? this._sageMobDockPanelHtml(sageChatBody, chatAnim, ' arborito-sage-chat-shell-mob')
            : `
            <div class="pointer-events-auto arborito-sage-chat-shell flex flex-col animate-in slide-in-from-bottom-10 fade-in overflow-hidden">
                ${sageChatBody}
            </div>
        `;

        bindCloseTaps(this, () => this.close());
        this.querySelector('#btn-settings').onclick = () => { this.mode = 'settings'; this.render(); };
        this.querySelector('#btn-clear').onclick = () => store.clearSageChat();

        const form = this.querySelector('#sage-form');
        form.onsubmit = (e) => {
             e.preventDefault();
             if (isThinking || isStreaming) { store.abortSage(); return; }
             const inp = this.querySelector('#sage-input');
             if (inp.value.trim()) {
                 store.update({ ai: { ...store.value.ai, contextMode: 'sage-tree' } });
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
        this._wireSageModeToggle();
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
    }

    formatMessage(text) {
        let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
        formatted = formatted.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="text-blue-500 hover:underline inline-flex items-center gap-1 font-bold"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>$1</a>');
        return formatted;
    }
}
