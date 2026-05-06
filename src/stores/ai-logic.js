import { aiService } from '../services/ai.js';

export class AILogic {
    constructor(store) {
        this.store = store;
        /** Coalesce HF/transformers progress spam → one store update per animation frame (avoids UI flicker). */
        this._aiProgressRaf = null;
        this._aiProgressPending = null;
    }

    _flushAiProgress() {
        this._aiProgressRaf = null;
        const text = this._aiProgressPending;
        if (text == null) return;
        this.store.update({ ai: { ...this.store.state.ai, progress: text } });
    }

    async initSage() {
        // Prevent infinite re-init loops if already busy
        if (this.store.state.ai.status === 'loading' || this.store.state.ai.status === 'thinking') return;

        if (this._aiProgressRaf != null) {
            cancelAnimationFrame(this._aiProgressRaf);
            this._aiProgressRaf = null;
        }
        this._aiProgressPending = null;

        this.store.update({ ai: { ...this.store.state.ai, status: 'loading', progress: '0%' } });
        
        aiService.setCallback((progressReport) => {
            const line = (progressReport && progressReport.text);
            this._aiProgressPending = line == null ? '' : String(line);
            if (this._aiProgressRaf != null) return;
            this._aiProgressRaf = requestAnimationFrame(() => this._flushAiProgress());
        });
        
        try {
            await aiService.initialize();
            
            // Only add greeting AFTER successful init and if chat is empty
            let currentMsgs = [...this.store.state.ai.messages];
            if (currentMsgs.length === 0) {
                currentMsgs.push({ role: 'assistant', content: this.store.ui.sageHello });
            }
            
            this.store.update({ ai: { ...this.store.state.ai, status: 'ready', messages: currentMsgs } });
        } catch (e) {
            console.error(e);
            this.store.update({ ai: { ...this.store.state.ai, status: 'error', progress: e.message } });
        } finally {
            if (this._aiProgressRaf != null) {
                cancelAnimationFrame(this._aiProgressRaf);
                this._aiProgressRaf = null;
            }
            this._aiProgressPending = null;
        }
    }

    abortSage() {
        aiService.abort();
        this.store.update({ ai: { ...this.store.state.ai, status: 'ready' } });
    }

    clearSageChat() {
        const initial = [{ role: 'assistant', content: this.store.ui.sageHello }];
        this.store.update({ ai: { ...this.store.state.ai, messages: initial, status: 'ready' } });
    }

    async chatWithSage(userText) {
        if (!this.store.state.modal || this.store.state.modal.type !== 'sage') {
            this.store.setModal({ type: 'sage' });
        }

        const currentMsgs = [...this.store.state.ai.messages, { role: 'user', content: userText }];
        
        // Critical: Clear progress so the "Thinking" spinner appears instead of old status text
        this.store.update({ ai: { ...this.store.state.ai, status: 'thinking', progress: null, messages: currentMsgs } });

        try {
            let contextNode = this.store.state.selectedNode || this.store.state.previewNode;
            // Handle unloaded context content
            if (
                contextNode &&
                !contextNode.content &&
                (contextNode.contentPath ||
                    (contextNode.treeLazyContent && contextNode.treeContentKey))
            ) {
                try {
                    await this.store.loadNodeContent(contextNode);
                } catch(err) {
                    console.warn("Could not load context for AI:", err);
                }
            }

            // Streaming: actualizar mensaje progresivamente
            let streamingContent = '';
            const onStream = (partialText) => {
                streamingContent = partialText;
                const streamingMsgs = [...currentMsgs, { role: 'assistant', content: partialText + '▌' }];
                this.store.update({ ai: { ...this.store.state.ai, status: 'streaming', messages: streamingMsgs } });
            };
            
            const responseObj = await aiService.chat(currentMsgs, contextNode, onStream);
            let finalText = responseObj.text;
            
            if (responseObj.sources && responseObj.sources.length > 0) {
                finalText += `\n\n**Sources:**\n` + responseObj.sources.map(s => `• [${s.title}](${s.url})`).join('\n');
            }
            const newMsgs = [...currentMsgs, { role: 'assistant', content: finalText }];
            this.store.update({ ai: { ...this.store.state.ai, status: 'ready', messages: newMsgs } });
        } catch (e) {
            // CRITICAL: SHOW THE REAL ERROR TO THE USER
            console.error("AI Error masked in Store:", e);
            const errorMsg = this.store.state.lang === 'ES' 
                ? `❌ Error del Sistema: ${e.message || e}` 
                : `❌ System Error: ${e.message || e}`;
            
            const newMsgs = [...currentMsgs, { role: 'assistant', content: errorMsg }];
            this.store.update({ ai: { ...this.store.state.ai, status: 'ready', messages: newMsgs } });
        }
    }
}
