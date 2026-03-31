import { store } from '../../store.js';
import { aiService } from '../../services/ai.js';
import { ArboritoSageUIChat } from './sage-ui-chat.js';

class ArboritoSage extends ArboritoSageUIChat {
    constructor() {
        super();
        this.isVisible = false;
        this.mode = 'chat'; // 'chat' | 'settings' | 'menu' | 'architect'
        
        // UI State
        this.ollamaModels = [];
        this.pullStatus = '';
        this.hasTriedLoadingModels = false; 
        this.lastRenderKey = null;
        this.ollamaConnectionError = false; 
        
        // GDPR Consent (Unified Key)
        this.hasConsent = localStorage.getItem('arborito-ai-consent') === 'true';
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
                    store.initSage();
                }
            } 
            else if (modal.mode && modal.mode !== this.mode) {
                this.mode = modal.mode;
            }
            // Re-read consent in case Game Player enabled it
            this.hasConsent = localStorage.getItem('arborito-ai-consent') === 'true';
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
    }

    /** User dismisses Sage — clear modal in the store. */
    close() {
        this.hide();
        store.dismissModal();
    }

    saveConfig(provider) {
        if (provider === 'ollama') {
            const model = this.querySelector('#inp-ollama-model').value.trim();
            const host = this.querySelector('#inp-ollama-host').value.trim();
            if (model) {
                aiService.setConfig({ 
                    provider: 'ollama', 
                    ollamaModel: model,
                    ollamaHost: host || 'http://127.0.0.1:11434'
                });
            }
        } else if (provider === 'browser') {
            const browserModel = this.querySelector('#inp-browser-model').value.trim();
            const preset = this.querySelector('#sel-context-preset')?.value;
            const maxTokensRaw = this.querySelector('#inp-browser-max-tokens')?.value;
            aiService.setConfig({ 
                provider: 'browser',
                browserModel: browserModel || 'onnx-community/Qwen2.5-0.5B-Instruct-ONNX',
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
        
        // Auto-initialize if in-browser providers
        if (aiService.config.provider === 'browser') {
            store.initSage();
        }
        this.render();
    }

    async loadOllamaModels() {
        this.hasTriedLoadingModels = true;
        this.ollamaConnectionError = false; 
        this.render(); 

        const models = await aiService.listOllamaModels();
        if (models === null) {
            this.ollamaConnectionError = true;
            this.ollamaModels = [];
        } else {
            this.ollamaModels = models;
        }
        this.render();
    }
    
    async pullModel() {
        const ui = store.ui;
        const name = this.querySelector('#inp-pull-model').value.trim();
        if(!name) return;

        this.pullStatus = ui.sageStatusDownload || 'Downloading...';
        this.render();

        const success = await aiService.pullOllamaModel(name, (status) => {
            this.pullStatus = status;
            const statusEl = this.querySelector('#pull-status');
            if(statusEl) statusEl.textContent = status;
        });

        this.pullStatus = success ? (ui.sageOllamaDone || 'Done!') : (ui.sageOllamaError || 'Error.');
        await this.loadOllamaModels();
        if(success) {
            this.querySelector('#inp-ollama-model').value = name;
        }
    }

    async runQuickAction(action) {
        const ui = store.ui;
        const node = store.value.selectedNode || store.value.previewNode;
        const rawName = (node?.name || '').trim();
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
                await store.loadData(activeSource, store.value.lang, true);
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