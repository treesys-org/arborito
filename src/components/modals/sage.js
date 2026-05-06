import { store } from '../../store.js';
import { aiService, DEFAULT_BROWSER_MODEL } from '../../services/ai.js';
import { ArboritoSageUIChat } from './sage-ui-chat.js';

class ArboritoSage extends ArboritoSageUIChat {
    constructor() {
        super();
        this.isVisible = false;
        this.mode = 'chat'; // 'chat' | 'settings' | 'menu' | 'architect'
        
        // UI State
        this.stableHordeModels = [];
        this.pullStatus = '';
        this.hasTriedLoadingModels = false; 
        this.lastRenderKey = null;
        this.stableHordeConnectionError = false; 
        
        // GDPR Consent (Unified Key)
        this.hasConsent = localStorage.getItem('arborito-ai-consent') === 'true';
        
        // Prevent double-rendering of consent dialog
        this._consentRendered = false;
    }
    
    connectedCallback() {
        this._storeListener = () => this.checkState();
        store.addEventListener('state-change', this._storeListener);
        this.checkState();
    }

    disconnectedCallback() {
        if (this._storeListener) {
            store.removeEventListener('state-change', this._storeListener);
        }
    }

    checkState() {
        const modal = store.value.modal;
        const isSageReq = modal && (modal === 'sage' || modal.type === 'sage');

        if (isSageReq) {
            if (!this.isVisible) {
                this.isVisible = true;
                this.mode = modal.mode || 'chat';
                
                // AUTO-START LOGIC:
                // Only if browser provider, AND user has consented, AND only if idle.
                if (
                    aiService.config.provider === 'browser' &&
                    this.hasConsent &&
                    store.value.ai.status === 'idle'
                ) {
                    // Delay to let UI render before heavy worker initialization
                    setTimeout(() => store.initSage(), 50);
                }
            } 
            else if (modal.mode && modal.mode !== this.mode) {
                this.mode = modal.mode;
            }
            // Re-read consent in case Game Player enabled it
            this.hasConsent = localStorage.getItem('arborito-ai-consent') === 'true';
            // Reset flag if consent is already granted (prevents stuck state)
            if (this.hasConsent) this._consentRendered = false;
            this.render();
        } else {
            if (this.isVisible) {
                this.hide();
            }
        }
    }

    /** Tear down UI only — modal was already cleared or switched by the store. */
    hide() {
        this.isVisible = false;
        this.lastRenderKey = null;
        this.innerHTML = '';
        this.className = '';
        // Reset consent flag so it can be rendered again next time
        this._consentRendered = false;
    }

    /** User dismisses Sage — clear modal in the store. */
    close() {
        this.hide();
        store.dismissModal();
    }

    saveConfig(provider) {
        if (provider === 'stablehorde') {
            let model = this.querySelector('#inp-stablehorde-model').value.trim();
            const apiKey = this.querySelector('#inp-stablehorde-apikey').value.trim();
            // Auto-select first available model if none specified
            if (!model && this.stableHordeModels && this.stableHordeModels.length > 0) {
                model = this.stableHordeModels[0].name;
                console.log('[Sage] Auto-selected Stable Horde model:', model);
            }
            aiService.setConfig({ 
                provider: 'stablehorde', 
                stableHordeModel: model || 'any', // 'any' lets Horde pick
                stableHordeApiKey: apiKey || '0000000000'
            });
        } else if (provider === 'browser') {
            const browserModel = this.querySelector('#inp-browser-model').value.trim();
            const preset = (this.querySelector('#sel-context-preset') ? this.querySelector('#sel-context-preset').value : undefined);
            const maxTokensRaw = (this.querySelector('#inp-browser-max-tokens') ? this.querySelector('#inp-browser-max-tokens').value : undefined);
            aiService.setConfig({ 
                provider: 'browser',
                browserModel: browserModel || DEFAULT_BROWSER_MODEL,
                contextPreset: preset || 'minimal',
                browserMaxNewTokens: maxTokensRaw != null ? Number(maxTokensRaw) : undefined
            });
            // If consent exists, init. If not, the chat view will trigger the consent wall.
            if (this.hasConsent && store.value.ai.status === 'idle') {
                store.initSage();
            }
        }
        this.mode = 'chat';
        this.render();
    }
    
    acceptConsent() {
        this.hasConsent = true;
        localStorage.setItem('arborito-ai-consent', 'true');
        
        // Auto-initialize if in-browser providers (with delay to let UI render)
        if (aiService.config.provider === 'browser') {
            this.render(); // Show loading first
            setTimeout(() => store.initSage(), 100);
        } else {
            this.render();
        }
    }

    async loadStableHordeModels() {
        this.hasTriedLoadingModels = true;
        this.stableHordeConnectionError = false; 
        this.render(); 

        const models = await aiService.listStableHordeModels();
        if (models === null) {
            this.stableHordeConnectionError = true;
            this.stableHordeModels = [];
        } else {
            this.stableHordeModels = models.map(m => ({ name: m.name || m.id }));
        }
        this.render();
    }

    async runQuickAction(action) {
        const ui = store.ui;
        const node = store.value.selectedNode || store.value.previewNode;
        const rawName = ((node && node.name) || '').trim();
        const lesson = rawName || (ui.sageLessonUntitled || 'this lesson');

        const fill = (template, fallback) => {
            const t = template || fallback;
            return t.replace(/\{lesson\}/g, lesson);
        };

        let prompt = '';
        if (action === 'summarize') {
            prompt = fill(
                ui.sagePromptSummarize,
                'Summarize the lesson "{lesson}" in 3 bullet points.'
            );
        }
        if (action === 'explain') {
            prompt = fill(
                ui.sagePromptExplain,
                'Explain the main concept of the lesson "{lesson}" in simple terms.'
            );
        }
        if (action === 'quiz') {
            prompt = fill(
                ui.sagePromptQuiz,
                'Give me a test question about the lesson "{lesson}".'
            );
        }
        if (prompt) store.chatWithSage(prompt);
    }
    
    extractBlueprint(text) {
        if (!text) return null;
        const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (codeBlockMatch) {
            try {
                const potentialJson = codeBlockMatch[1];
                const json = JSON.parse(potentialJson);
                if (json.modules || (json.title && Array.isArray(json.lessons)) || json.languages) return json;
            } catch (e) {}
        }
        const trimmed = text.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}'))) {
            try {
                const json = JSON.parse(trimmed);
                if (json.modules || json.languages) return json;
            } catch (e) {}
        }
        return null;
    }
    
    async handleConstruct(e) {
        const idx = e.currentTarget.dataset.msgIndex;
        const msg = store.value.ai.messages[idx];
        if(!msg) return;

        const json = this.extractBlueprint(msg.content);
        const ui = store.ui;
        if(json) {
            try {
                const activeSource = store.value.activeSource;
                if(activeSource.type !== 'local') {
                    store.alert(ui.sageBuildLocalOnly || 'You can only build in a local garden.');
                    return;
                }
                store.userStore.applyBlueprintToTree(activeSource.id, json);
                await store.loadData(activeSource, true);
                store.notify('✅ ' + (ui.sageGardenConstructed || 'Garden updated!'));
                this.close(); 
            } catch(err) {
                store.alert(
                    (ui.sageBlueprintErrorWithMessage || 'Blueprint error: {message}').replace(
                        '{message}',
                        err.message
                    )
                );
            }
        } else {
            store.alert(ui.sageBlueprintParseError || 'Could not parse blueprint structure.');
        }
    }

}
customElements.define('arborito-sage', ArboritoSage);