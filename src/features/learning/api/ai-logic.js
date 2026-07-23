import { aiService } from './ai.js';
import { commitLearningState } from '../../../stores/learning-store-actions.js';
import { hasSageAiConsentForInit } from './sage-ai-consent.js';
import {
    sageVoice,
    resolveSageVoiceAutoSpeak,
    isSpeakableAssistantText,
    plainTextForSpeech,
} from './sage-voice.js';
import { stripThinking, stripThinkingStream } from './sage-thinking.js';

const SAGE_STREAM_UI_MS = 90;
const SAGE_STREAM_STALL_MS = 18000;
const SAGE_STREAM_HARD_MS = 120000;
const SAGE_THINKING_STALL_MS = 45000;
import { resolveSageQueryTarget } from './sage-tree-rag.js';
import {
    runSageConstructionCreate,
    describeSageConstructionCreateFailure,
} from './sage-construction-create.js';
import { parseSageConstructionTags } from './sage-construction-tags.js';
import { parseSageConstructToolCall } from './sage-construction-tools.js';
import {
    isNegativeReply,
    isConstructionProceedReply,
    isConstructionConfirmReply,
    isConstructionDeleteIntent,
    describeConstructionDeleteRefuse,
    describeConstructionDone,
    describeConstructionProposal,
    detectConstructionCreateIntent,
    enrichConstructionIntentFromHistory,
    findRecentConstructionCreateIntent,
    extractMoreCount,
    extractConstructionCount,
} from './sage-construction-intent.js';

/** @param {import('./sage-construction-intent.js').SageConstructionProposal | object} intent */
function proposalFromCreateIntent(intent) {
    const proposal = {
        action: intent.action,
        count: Math.max(1, Number(intent.count) || 1),
    };
    if (intent.name) proposal.name = intent.name;
    if (intent.namePrefix) proposal.namePrefix = intent.namePrefix;
    if (intent.nested && Number(intent.nested.count) > 1) {
        proposal.nested = {
            action: intent.nested.action || 'create-folder',
            count: intent.nested.count,
            namePrefix: intent.nested.namePrefix || intent.nested.name || '',
            name: intent.nested.name || '',
        };
    }
    return proposal;
}

/** @param {object} proposal */
function createOptsFromProposal(proposal, parentNode, ui) {
    return {
        parentNode,
        ui,
        quiet: true,
        count: proposal.count || 1,
        name: proposal.name || '',
        namePrefix: proposal.namePrefix || '',
        nested: proposal.nested || null,
    };
}

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
        /** Per chat turn — a new send invalidates the previous stream without aborting model init. */
        this._sageChatGen = 0;
        /** Active stream timers / RAF — cleared on abort or completion. */
        this._sageStreamRaf = null;
        this._sageStreamWatchdog = null;
        this._sageStreamStartedAt = 0;
    }

    _clearSageStreamSession() {
        if (this._sageStreamRaf != null) {
            cancelAnimationFrame(this._sageStreamRaf);
            this._sageStreamRaf = null;
        }
        if (this._sageStreamWatchdog != null) {
            clearInterval(this._sageStreamWatchdog);
            this._sageStreamWatchdog = null;
        }
        this._sageStreamStartedAt = 0;
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
        this._sageChatGen += 1;
        this._clearSageStreamSession();
        if (this._aiProgressRaf != null) {
            cancelAnimationFrame(this._aiProgressRaf);
            this._aiProgressRaf = null;
        }
        this._aiProgressPending = null;
        aiService.setCallback(null);
        void aiService.abort();
        try {
            sageVoice.stopSpeaking();
        } catch (_) {}
        let messages = [...(this.store.state.ai.messages || [])];
        const last = messages[messages.length - 1];
        if (last?.role === 'assistant') {
            const text = String(last.content || '').replace(/▌$/, '').trim();
            if (!text) messages = messages.slice(0, -1);
            else messages = [...messages.slice(0, -1), { role: 'assistant', content: text }];
        }
        this._patchAi({
            status: 'ready',
            progress: null,
            messages,
            pendingConstructionProposal: null,
            voiceReply: false,
        });
    }

    clearSageChat() {
        this._sageChatGen += 1;
        this._clearSageStreamSession();
        aiService.setCallback(null);
        void aiService.abort();
        try {
            aiService.consumeSageSessionPatch();
        } catch (_) {}
        try {
            sageVoice.stopSpeaking();
        } catch (_) {}
        const initial = [{ role: 'assistant', content: this.store.ui.sageHello }];
        this._patchAi({
            messages: initial,
            status: 'ready',
            progress: null,
            pendingConstructionProposal: null,
            lastConstructionAction: null,
            sageNavFocus: null,
            voiceReply: false,
        });
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
        const lang = this.store.state.lang || 'EN';
        const constructionMode = !!this.store.state.constructionMode;
        const aiNow = this.store.state.ai || {};
        const pending = aiNow.pendingConstructionProposal || null;
        const lastConstructAction = aiNow.lastConstructionAction || null;
        const currentMsgs = [...(aiNow.messages || []), { role: 'user', content: userText }];
        const userToolCall = constructionMode ? parseSageConstructToolCall(userText) : null;
        const userCreateIntent = constructionMode
            ? (() => {
                  const raw = detectConstructionCreateIntent(userText);
                  if (!raw) return null;
                  return enrichConstructionIntentFromHistory(raw, aiNow.messages || [], userText);
              })()
            : null;
        const moreCount = constructionMode ? extractMoreCount(userText) : null;

        /* No delete tool — refuse clearly (local models invent “I deleted…” too easily). */
        if (constructionMode && isConstructionDeleteIntent(userText)) {
            this._sageChatGen += 1;
            this._patchAi({
                contextMode: 'architect',
                status: 'ready',
                progress: null,
                pendingConstructionProposal: null,
                messages: [
                    ...currentMsgs,
                    { role: 'assistant', content: describeConstructionDeleteRefuse(ui) },
                ],
                voiceReply: false,
            });
            return;
        }

        /* New create request while something was pending → replace proposal (don’t treat as sí). */
        if (constructionMode && pending && userCreateIntent?.action && !userToolCall) {
            const proposal = proposalFromCreateIntent({
                ...userCreateIntent,
                count: userCreateIntent.count || extractConstructionCount(userText) || 1,
            });
            this._sageChatGen += 1;
            this._patchAi({
                contextMode: 'architect',
                status: 'ready',
                progress: null,
                pendingConstructionProposal: proposal,
                messages: [
                    ...currentMsgs,
                    { role: 'assistant', content: describeConstructionProposal(proposal, ui) },
                ],
                voiceReply: false,
            });
            return;
        }

        /* “4 más” after a successful create → propose same action again. */
        if (constructionMode && !pending && moreCount && lastConstructAction) {
            const proposal = { action: lastConstructAction, count: moreCount };
            this._sageChatGen += 1;
            this._patchAi({
                contextMode: 'architect',
                status: 'ready',
                progress: null,
                pendingConstructionProposal: proposal,
                messages: [
                    ...currentMsgs,
                    { role: 'assistant', content: describeConstructionProposal(proposal, ui) },
                ],
                voiceReply: false,
            });
            return;
        }

        /* Pending + sí/detalle/CALL tool → create without asking the model again. */
        if (
            constructionMode &&
            pending &&
            (isConstructionProceedReply(userText, pending) ||
                !!userToolCall ||
                isNegativeReply(userText))
        ) {
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
            const action = pending.action || userToolCall?.tool?.action;
            const count =
                userToolCall?.count
                || pending.count
                || extractConstructionCount(userText)
                || 1;
            const proposal = {
                ...pending,
                action,
                count,
            };
            this._sageChatGen += 1;
            const constructSession = this._sageChatGen;
            this._patchAi({
                pendingConstructionProposal: null,
                contextMode: 'architect',
                status: 'thinking',
                progress: ui.sageConstructWorking || ui.sageThinking || null,
                messages: currentMsgs,
                voiceReply: false,
            });
            const parent = this.store.state.selectedNode || this.store.state.previewNode;
            const created = await runSageConstructionCreate(
                action,
                createOptsFromProposal(proposal, parent, ui)
            );
            if (constructSession !== this._sageChatGen) return;
            const reply = created.ok
                ? describeConstructionDone(proposal, ui, { created: created.created })
                : describeSageConstructionCreateFailure(created.reason, ui);
            this._patchAi({
                pendingConstructionProposal: null,
                lastConstructionAction: created.ok ? action : lastConstructAction,
                contextMode: 'architect',
                status: 'ready',
                messages: [...currentMsgs, { role: 'assistant', content: reply }],
            });
            return;
        }

        /*
         * Explicit user CALL / catalog id only — model otherwise chooses via tools RAG.
         * Do not route on synonym heuristics (diseña/fabricá/…).
         */
        if (constructionMode && !pending && userToolCall?.tool?.action) {
            const proposal = {
                action: userToolCall.tool.action,
                count: userToolCall.count || extractConstructionCount(userText) || 1,
            };
            this._sageChatGen += 1;
            this._patchAi({
                contextMode: 'architect',
                status: 'ready',
                progress: null,
                pendingConstructionProposal: proposal,
                messages: [
                    ...currentMsgs,
                    {
                        role: 'assistant',
                        content: describeConstructionProposal(proposal, ui),
                    },
                ],
                voiceReply: false,
            });
            return;
        }

        /* Clear create ask (“haceme 5 módulos” / nested names) → propose; don’t rely on the model. */
        if (constructionMode && !pending && userCreateIntent?.action) {
            const proposal = proposalFromCreateIntent(userCreateIntent);
            this._sageChatGen += 1;
            this._patchAi({
                contextMode: 'architect',
                status: 'ready',
                progress: null,
                pendingConstructionProposal: proposal,
                messages: [
                    ...currentMsgs,
                    { role: 'assistant', content: describeConstructionProposal(proposal, ui) },
                ],
                voiceReply: false,
            });
            return;
        }

        /*
         * Recovery: model invented a plan without setting pending; user says “no, procede” / “hacelo”.
         * Re-read the last clear create ask and execute it.
         */
        if (constructionMode && !pending && isConstructionConfirmReply(userText)) {
            const priorRaw = findRecentConstructionCreateIntent(aiNow.messages || [], userText);
            const prior = priorRaw
                ? enrichConstructionIntentFromHistory(priorRaw, aiNow.messages || [], userText)
                : null;
            if (prior?.action) {
                const proposal = proposalFromCreateIntent(prior);
                this._sageChatGen += 1;
                const constructSession = this._sageChatGen;
                this._patchAi({
                    pendingConstructionProposal: null,
                    contextMode: 'architect',
                    status: 'thinking',
                    progress: ui.sageConstructWorking || ui.sageThinking || null,
                    messages: currentMsgs,
                    voiceReply: false,
                });
                const parent = this.store.state.selectedNode || this.store.state.previewNode;
                const created = await runSageConstructionCreate(
                    proposal.action,
                    createOptsFromProposal(proposal, parent, ui)
                );
                if (constructSession !== this._sageChatGen) return;
                const reply = created.ok
                    ? describeConstructionDone(proposal, ui, { created: created.created })
                    : describeSageConstructionCreateFailure(created.reason, ui);
                this._patchAi({
                    pendingConstructionProposal: null,
                    lastConstructionAction: created.ok ? proposal.action : lastConstructAction,
                    contextMode: 'architect',
                    status: 'ready',
                    messages: [...currentMsgs, { role: 'assistant', content: reply }],
                });
                return;
            }
        }

        this._sageChatGen += 1;
        const chatSession = this._sageChatGen;

        this._patchAi({
            contextMode: constructionMode ? 'architect' : 'sage-tree',
            status: 'thinking',
            progress: constructionMode
                ? ui.sageConstructThinking || ui.sageThinking || null
                : null,
            messages: currentMsgs,
        });

        this._clearSageStreamSession();
        this._sageStreamStartedAt = Date.now();
        let streamingContent = '';
        let streamDirty = false;
        let lastStreamUiAt = 0;
        let lastStreamChangeAt = Date.now();
        let lastPatchedStream = '';

        const flushStream = (force = false) => {
            this._sageStreamRaf = null;
            if (!streamDirty || chatSession !== this._sageChatGen) return;
            const cleaned = stripThinkingStream(streamingContent);
            if (!String(cleaned || '').trim()) {
                streamDirty = false;
                return;
            }
            const now = Date.now();
            if (!force && now - lastStreamUiAt < SAGE_STREAM_UI_MS) {
                streamDirty = true;
                this._sageStreamRaf = requestAnimationFrame(() => flushStream(false));
                return;
            }
            if (!force && cleaned === lastPatchedStream) {
                streamDirty = false;
                return;
            }
            streamDirty = false;
            lastStreamUiAt = now;
            lastStreamChangeAt = now;
            lastPatchedStream = cleaned;
            const streamingMsgs = [...currentMsgs, { role: 'assistant', content: `${cleaned}▌` }];
            this._patchAi({ status: 'streaming', messages: streamingMsgs });
        };

        const onStream = (partialText) => {
            if (chatSession !== this._sageChatGen) return;
            lastStreamChangeAt = Date.now();
            streamingContent = String(partialText || '');
            streamDirty = true;
            if (this._sageStreamRaf == null) {
                this._sageStreamRaf = requestAnimationFrame(() => flushStream(false));
            }
        };

        const stopStreamWatchdog = () => {
            if (this._sageStreamWatchdog != null) {
                clearInterval(this._sageStreamWatchdog);
                this._sageStreamWatchdog = null;
            }
        };

        const abortStalledStream = (reasonKey) => {
            if (chatSession !== this._sageChatGen) return;
            const uiNow = this.store.ui || {};
            const stallMsg =
                uiNow[reasonKey]
                || uiNow.sageStreamStalled
                || 'The reply stalled and was stopped. Try again or rephrase your question.';
            const partial = stripThinkingStream(streamingContent).replace(/▌$/, '').trim();
            this._clearSageStreamSession();
            aiService.setCallback(null);
            void aiService.abort();
            let messages = [...currentMsgs];
            const tail = partial || stallMsg;
            messages = [...messages, { role: 'assistant', content: tail }];
            if (partial && partial !== stallMsg) {
                messages = [...messages, { role: 'assistant', content: stallMsg }];
            }
            this._patchAi({ status: 'ready', progress: null, messages });
            this._sageChatGen += 1;
        };

        this._sageStreamWatchdog = setInterval(() => {
            if (chatSession !== this._sageChatGen) {
                stopStreamWatchdog();
                return;
            }
            const st = this.store.state.ai?.status;
            if (st !== 'thinking' && st !== 'streaming') {
                stopStreamWatchdog();
                return;
            }
            const now = Date.now();
            if (now - this._sageStreamStartedAt > SAGE_STREAM_HARD_MS) {
                abortStalledStream('sageGenerationTimeout');
                return;
            }
            if (st === 'thinking' && now - this._sageStreamStartedAt > SAGE_THINKING_STALL_MS) {
                abortStalledStream('sageStreamStalled');
                return;
            }
            if (st === 'streaming' && now - lastStreamChangeAt > SAGE_STREAM_STALL_MS) {
                abortStalledStream('sageStreamStalled');
            }
        }, 2000);

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
            /* Always resolve RAG focus — open-lesson content alone must not skip preload. */
            if (this.store.state.data) {
                const query = String(userText || '');
                const { focusNode } = resolveSageQueryTarget(
                    this.store.state.data,
                    query,
                    contextNode,
                    this.store.state.lang || 'EN'
                );
                if (focusNode && String(focusNode.id) !== String(contextNode?.id || '')) {
                    await tryLoadLesson(focusNode);
                }
            }

            // Streaming: throttle UI writes so tokens do not remount the whole chat every frame.
            const responseObj = await aiService.chat(currentMsgs, contextNode, onStream);
            if (chatSession !== this._sageChatGen) return;
            const sessionPatch = aiService.consumeSageSessionPatch?.();
            if (sessionPatch?.sageNavFocus) {
                this._patchAi({ sageNavFocus: sessionPatch.sageNavFocus });
            }
            flushStream(true);
            stopStreamWatchdog();
            this._clearSageStreamSession();
            if (responseObj.rawText === 'Error' || /arborito-sage-error/i.test(String(responseObj.text || ''))) {
                const errPlain = plainTextForSpeech(responseObj.text).replace(/^ERROR\s*/i, '').trim();
                throw new Error(errPlain || 'Chat failed');
            }
            /* Parse construct tags BEFORE stripThinking — strip removes [[SAGE_CONSTRUCT:…]]. */
            let finalText = String(responseObj.text || '');
            let pendingPatch = {};
            if (constructionMode) {
                const parsed = parseSageConstructionTags(finalText);
                finalText = stripThinking(parsed.display || '');
                /* Drop slash-only / junk leftovers some small models emit. */
                if (/^\/+$/.test(finalText.trim())) finalText = '';
                if (parsed.proposal?.phase === 'propose') {
                    const count =
                        parsed.proposal.count
                        || extractConstructionCount(userText)
                        || 1;
                    const proposal = { action: parsed.proposal.action, count };
                    if (!finalText.trim()) {
                        finalText = describeConstructionProposal(proposal, ui);
                    } else if (!/\¿\s*Procedo\s*\?|Proceed\s*\?/i.test(finalText)) {
                        finalText = `${finalText.trim()}\n\n${describeConstructionProposal(proposal, ui)}`;
                    }
                    pendingPatch = { pendingConstructionProposal: proposal };
                } else if (parsed.proposal?.phase === 'execute') {
                    const pendingNow =
                        this.store.state.ai?.pendingConstructionProposal || pending || null;
                    const canExecute =
                        pendingNow &&
                        String(pendingNow.action) === String(parsed.proposal.action);
                    if (canExecute) {
                        this._patchAi({
                            status: 'thinking',
                            progress: ui.sageConstructWorking || ui.sageThinking || null,
                        });
                        const parent = this.store.state.selectedNode || this.store.state.previewNode;
                        const count =
                            parsed.proposal.count
                            || pendingNow.count
                            || extractConstructionCount(userText)
                            || 1;
                        const execProposal = {
                            ...pendingNow,
                            action: parsed.proposal.action,
                            count,
                        };
                        const created = await runSageConstructionCreate(
                            parsed.proposal.action,
                            createOptsFromProposal(execProposal, parent, ui)
                        );
                        if (chatSession !== this._sageChatGen) return;
                        if (created.ok) {
                            finalText =
                                (finalText ? `${finalText}\n\n` : '') +
                                describeConstructionDone(execProposal, ui, {
                                    created: created.created,
                                });
                            pendingPatch = {
                                pendingConstructionProposal: null,
                                lastConstructionAction: parsed.proposal.action,
                            };
                        } else if (!finalText.trim()) {
                            finalText = describeSageConstructionCreateFailure(created.reason, ui);
                            pendingPatch = { pendingConstructionProposal: null };
                        } else {
                            pendingPatch = { pendingConstructionProposal: null };
                        }
                    } else {
                        pendingPatch = {};
                    }
                }
                /* No CALL → no auto-pick by synonyms; the model must choose from the catalog. */
            } else {
                finalText = stripThinking(finalText);
            }

            if (!String(finalText || '').trim()) {
                finalText =
                    ui.sageEmptyReplyFallback ||
                    (lang === 'ES'
                        ? 'No pude armar una respuesta clara. Probá reformular.'
                        : 'I could not form a clear reply. Try rephrasing.');
            }

            if (chatSession !== this._sageChatGen) return;
            if (responseObj.sources && responseObj.sources.length > 0) {
                const sourcesLabel = lang === 'ES' ? 'Fuentes' : 'Sources';
                finalText +=
                    `\n\n**${sourcesLabel}:**\n` +
                    responseObj.sources.map((s) => `• [${s.title}](${s.url})`).join('\n');
            }
            const newMsgs = [...currentMsgs, { role: 'assistant', content: finalText }];
            const wantAutoSpeak =
                resolveSageVoiceAutoSpeak() && isSpeakableAssistantText(finalText, responseObj.rawText);
            /* voiceReply=true → useSageVoice speaks via the same Piper consent path as manual speak. */
            this._patchAi({
                status: 'ready',
                messages: newMsgs,
                voiceReply: !!wantAutoSpeak,
                ...pendingPatch,
            });
        } catch (e) {
            stopStreamWatchdog();
            this._clearSageStreamSession();
            if (chatSession !== this._sageChatGen) return;
            if (e && (e.name === 'AbortError' || e.message === 'Aborted')) return;
            console.error('AI Error masked in Store:', e);
            const uiErr = this.store.ui || {};
            const detail = e.message || e;
            const errorMsg =
                uiErr.sageSystemErrorTpl
                    ? String(uiErr.sageSystemErrorTpl).replace('{error}', String(detail))
                    : this.store.state.lang === 'ES'
                      ? `❌ Error del Sistema: ${detail}`
                      : `❌ System Error: ${detail}`;

            const newMsgs = [...currentMsgs, { role: 'assistant', content: errorMsg }];
            this._patchAi({ status: 'ready', messages: newMsgs, voiceReply: false });
        } finally {
            stopStreamWatchdog();
            this._clearSageStreamSession();
            if (
                chatSession === this._sageChatGen
                && (this.store.state.ai?.status === 'thinking' || this.store.state.ai?.status === 'streaming')
            ) {
                this._patchAi({ status: 'ready' });
            }
        }
    }
}
