import { aiService } from './ai.js';
import { commitLearningState } from '../../../stores/learning-store-actions.js';
import { hasSageAiConsentForInit } from './sage-ai-consent.js';
import { sageVoice, resolveSageVoiceLocale, plainTextForSpeech, isSpeakableAssistantText, fetchSageVoiceAssetStatus, sageVoiceNeedsDownloadConsent, resolveSageVoiceAutoSpeak, formatSageVoiceError, prefetchSageTtsAssets } from './sage-voice.js';
import { stripThinking } from './sage-thinking.js';
import { resolveSageQueryTarget } from './sage-tree-rag.js';
import { runSageConstructionCreate } from './sage-construction-create.js';
import { parseSageConstructionTags } from './sage-construction-tags.js';
import { isAffirmativeReply, isNegativeReply, describeConstructionDone } from './sage-construction-intent.js';

function formatSageInitError(err) {
    if (!err) return 'Unknown error';
    const parts = [];
    if (err.name && err.name !== 'Error') parts.push(err.name);
    const msg = err.message || (typeof err === 'string' ? err : '');
    if (msg) parts.push(msg);
    if (err.code != null) parts.push(`code ${err.code}`);
    return parts.length ? parts.join(', ') : String(err);
}

export class AILogic {
    constructor(store) {
        this.store = store;
        /** Coalesce llama.cpp progress spam → one store update per animation frame (avoids UI flicker). */
        this._aiProgressRaf = null;
        this._aiProgressPending = null;
        /** Bumped on cancel so in-flight initSage() does not apply stale results. */
        this._sageInitGen = 0;
    }

    _patchAi(aiPatch) {
        const next = { ...this.store.state.ai, ...aiPatch };
        commitLearningState({ ai: next });
    }

    _flushAiProgress() {
        this._aiProgressRaf = null;
        const text = this._aiProgressPending;
        if (text == null) return;
        this._patchAi({ progress: text });
    }

    async initSage() {
        // Prevent infinite re-init loops if already busy
        if (this.store.state.ai.status === 'loading' || this.store.state.ai.status === 'streaming' || this.store.state.ai.status === 'thinking') return;
        if (!hasSageAiConsentForInit()) return;

        if (this._aiProgressRaf != null) {
            cancelAnimationFrame(this._aiProgressRaf);
            this._aiProgressRaf = null;
        }
        this._aiProgressPending = null;

        const sessionId = this._sageInitGen;
        const starting = this.store.ui.sageLoadingProgressStarting || 'Starting…';
        this._patchAi({ status: 'loading', progress: starting });
        
        aiService.setCallback((progressReport) => {
            if (sessionId !== this._sageInitGen) return;
            const line = (progressReport && progressReport.text);
            this._aiProgressPending = line == null ? '' : String(line);
            if (this._aiProgressRaf != null) return;
            this._aiProgressRaf = requestAnimationFrame(() => this._flushAiProgress());
        });
        
        try {
            await aiService.initialize();
            if (sessionId !== this._sageInitGen) return;
            
            // Only add greeting AFTER successful init and if chat is empty
            let currentMsgs = [...this.store.state.ai.messages];
            if (currentMsgs.length === 0) {
                currentMsgs.push({ role: 'assistant', content: this.store.ui.sageHello });
            }
            
            this._patchAi({ status: 'ready', progress: null, messages: currentMsgs });
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('arborito-sage-ready'));
            }
        } catch (e) {
            if (sessionId !== this._sageInitGen) return;
            if (e && (e.name === 'AbortError' || e.message === 'Aborted')) return;
            console.error(e);
            const detail = formatSageInitError(e);
            const errMsg = this.store.state.lang === 'ES'
                ? `❌ No se pudo cargar el modelo (llama.cpp nativo):\n${detail}`
                : `❌ Could not load model (native llama.cpp):\n${detail}`;
            this._patchAi({
                status: 'ready',
                progress: null,
                messages: [{ role: 'assistant', content: errMsg }],
            });
        } finally {
            if (this._aiProgressRaf != null) {
                cancelAnimationFrame(this._aiProgressRaf);
                this._aiProgressRaf = null;
            }
            this._aiProgressPending = null;
        }
    }

    abortSage() {
        this._sageInitGen += 1;
        if (this._aiProgressRaf != null) {
            cancelAnimationFrame(this._aiProgressRaf);
            this._aiProgressRaf = null;
        }
        this._aiProgressPending = null;
        aiService.setCallback(null);
        void aiService.abort();
        this._patchAi({ status: 'ready', progress: null });
    }

    clearSageChat() {
        const initial = [{ role: 'assistant', content: this.store.ui.sageHello }];
        this._patchAi({ messages: initial, status: 'ready' });
    }

    async chatWithSage(userText) {
        if (!this.store.state.modal || this.store.state.modal.type !== 'sage') {
            this.store.setModal({ type: 'sage' });
        }

        if (aiService.config.provider === 'llamacpp' && !aiService.llamacppReady) {
            const sessionBefore = this._sageInitGen;
            await this.initSage();
            if (sessionBefore !== this._sageInitGen) return;
            if (this.store.state.ai.status !== 'ready') return;
        } else if (aiService.config.provider === 'expert-api' && !aiService.expertReady) {
            const sessionBefore = this._sageInitGen;
            await this.initSage();
            if (sessionBefore !== this._sageInitGen) return;
            if (this.store.state.ai.status !== 'ready') return;
        }

        const ui = this.store.ui || {};
        const constructionMode = !!this.store.state.constructionMode;
        const aiNow = this.store.state.ai || {};
        const pending = aiNow.pendingConstructionProposal || null;
        const currentMsgs = [...(aiNow.messages || []), { role: 'user', content: userText }];

        if (constructionMode && pending && (isAffirmativeReply(userText) || isNegativeReply(userText))) {
            if (isNegativeReply(userText)) {
                this._patchAi({
                    pendingConstructionProposal: null,
                    contextMode: 'architect',
                    status: 'ready',
                    messages: [
                        ...currentMsgs,
                        {
                            role: 'assistant',
                            content: ui.sageConstructCancelled || 'OK, I will not create anything.',
                        },
                    ],
                });
                return;
            }
            const parent = this.store.state.selectedNode || this.store.state.previewNode;
            const ok = await runSageConstructionCreate(pending.action, { parentNode: parent, ui });
            const reply = ok
                ? describeConstructionDone(pending, ui)
                : ui.sageConstructNeedModule ||
                  'Select a module on the map first, then ask me again.';
            this._patchAi({
                pendingConstructionProposal: null,
                contextMode: 'architect',
                status: 'ready',
                messages: [...currentMsgs, { role: 'assistant', content: reply }],
            });
            return;
        }

        this._patchAi({
            contextMode: constructionMode ? 'architect' : 'sage-tree',
            status: 'thinking',
            progress: null,
            messages: currentMsgs,
        });

        let streamRaf = null;
        try {
            let contextNode = this.store.state.selectedNode || this.store.state.previewNode;
            if (contextNode && contextNode.type !== 'leaf' && contextNode.type !== 'exam') {
                const preview = this.store.state.previewNode;
                if (preview && (preview.type === 'leaf' || preview.type === 'exam')) {
                    contextNode = preview;
                }
            }
            // Handle unloaded context content (open lesson or RAG-matched lesson)
            const tryLoadLesson = async (node) => {
                if (
                    !node ||
                    node.content ||
                    (!node.contentPath && !(node.treeLazyContent && node.treeContentKey))
                ) {
                    return node;
                }
                try {
                    await this.store.loadNodeContent(node);
                    const refreshed =
                        this.store.state.selectedNode ||
                        this.store.state.previewNode;
                    if (refreshed && String(refreshed.id) === String(node.id)) {
                        return refreshed;
                    }
                    return node;
                } catch (err) {
                    console.warn('Could not load context for AI:', err);
                    return node;
                }
            };
            contextNode = await tryLoadLesson(contextNode);
            if (!contextNode?.content && this.store.state.data) {
                const query = String(userText || '');
                const { focusNode } = resolveSageQueryTarget(
                    this.store.state.data,
                    query,
                    contextNode,
                    this.store.state.lang || 'EN'
                );
                if (focusNode && focusNode.id !== contextNode?.id) {
                    contextNode = await tryLoadLesson(focusNode);
                }
            }

            // Streaming: update assistant bubble progressively (one store write per frame).
            let streamingContent = '';
            let streamDirty = false;
            const flushStream = () => {
                streamRaf = null;
                if (!streamDirty) return;
                streamDirty = false;
                const cleaned = stripThinking(streamingContent);
                if (!String(cleaned || '').trim()) return;
                const streamingMsgs = [...currentMsgs, { role: 'assistant', content: `${cleaned}▌` }];
                this._patchAi({ status: 'streaming', messages: streamingMsgs });
            };
            const onStream = (partialText) => {
                streamingContent = String(partialText || '');
                if (!String(stripThinking(streamingContent) || '').trim()) return;
                streamDirty = true;
                if (streamRaf == null) {
                    streamRaf = requestAnimationFrame(flushStream);
                }
            };
            
            const responseObj = await aiService.chat(currentMsgs, contextNode, onStream);
            if (streamRaf) {
                cancelAnimationFrame(streamRaf);
                flushStream();
                streamRaf = null;
            }
            if (responseObj.rawText === 'Error' || /arborito-sage-error/i.test(String(responseObj.text || ''))) {
                const errPlain = plainTextForSpeech(responseObj.text).replace(/^ERROR\s*/i, '').trim();
                throw new Error(errPlain || 'Chat failed');
            }
            let finalText = stripThinking(responseObj.text);
            let pendingPatch = {};
            if (constructionMode) {
                const parsed = parseSageConstructionTags(finalText);
                finalText = parsed.display || finalText;
                if (parsed.proposal?.phase === 'propose') {
                    pendingPatch = { pendingConstructionProposal: { action: parsed.proposal.action } };
                } else if (parsed.proposal?.phase === 'execute') {
                    const parent = this.store.state.selectedNode || this.store.state.previewNode;
                    const ok = await runSageConstructionCreate(parsed.proposal.action, {
                        parentNode: parent,
                        ui,
                    });
                    if (ok) {
                        finalText =
                            (finalText ? `${finalText}\n\n` : '') +
                            describeConstructionDone({ action: parsed.proposal.action }, ui);
                    } else if (!finalText.trim()) {
                        finalText =
                            ui.sageConstructNeedModule ||
                            'Select a module on the map first, then ask me again.';
                    }
                    pendingPatch = { pendingConstructionProposal: null };
                }
            }
            
            if (responseObj.sources && responseObj.sources.length > 0) {
                finalText += `\n\n**Sources:**\n` + responseObj.sources.map(s => `• [${s.title}](${s.url})`).join('\n');
            }
            const newMsgs = [...currentMsgs, { role: 'assistant', content: finalText }];
            const shouldSpeak = resolveSageVoiceAutoSpeak();
            this._patchAi({ status: 'ready', messages: newMsgs, voiceReply: false, ...pendingPatch });
            if (shouldSpeak && isSpeakableAssistantText(finalText, responseObj.rawText)) {
                try {
                    const voiceStatus = await fetchSageVoiceAssetStatus(resolveSageVoiceLocale());
                    if (sageVoiceNeedsDownloadConsent(voiceStatus, { forTts: true })) {
                        // User must accept Piper download from chat/settings first.
                    } else {
                        if (voiceStatus?.needsTtsDownload) {
                            await prefetchSageTtsAssets(resolveSageVoiceLocale());
                        }
                        await sageVoice.speak(plainTextForSpeech(finalText), resolveSageVoiceLocale(), { forcePiper: true });
                    }
                } catch (e) {
                    console.warn('Sage voice playback failed:', e);
                    const ui = this.store.state.ui || {};
                    const errMsg = formatSageVoiceError(e, 'tts', ui);
                    this._patchAi({
                        messages: [...newMsgs, { role: 'assistant', content: errMsg }],
                    });
                }
            }
        } catch (e) {
            if (streamRaf) cancelAnimationFrame(streamRaf);
            // CRITICAL: SHOW THE REAL ERROR TO THE USER
            console.error("AI Error masked in Store:", e);
            const errorMsg = this.store.state.lang === 'ES' 
                ? `❌ Error del Sistema: ${e.message || e}` 
                : `❌ System Error: ${e.message || e}`;
            
            const newMsgs = [...currentMsgs, { role: 'assistant', content: errorMsg }];
            this._patchAi({ status: 'ready', messages: newMsgs });
        }
    }
}
