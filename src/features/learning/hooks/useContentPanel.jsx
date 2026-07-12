import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLearningStore } from './useLearning.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { createLessonConstructApi } from '../../editor/api/content-lesson-construct/create-api.js';
import { isExamLesson } from '../api/exam-context.js';
import {
    getToc,
    getFilteredToc,
    findFirstIncompleteSectionIndex,
    sectionHasIncompleteQuiz,
    getActiveBlocks,
    computeLessonProgress,
    isTocSectionCompleted,
    getQuizBlocksForSection,
    getExpandedQuestionIdsForExam,
    getExpandedQuestionIdsForSection,
    getTocAccess,
    isTocSectionAccessible,
    appendExamFinalTocItem,
    isExamFinalSectionIndex,
    areAllExamQuestionsFinished,
    getContentTocLength,
    buildExamSectionOpts,
} from '../api/content-toc.js';
import {
    scrollLessonContentToQuiz,
    pulseTocRowAttention
} from '../api/content-panel-scroll.js';
import { stopSpeaking } from '../api/read-aloud.js';
import { parseContent } from '../api/parser.js';
import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { useLessonParse } from './useLessonParse.jsx';
import { getMediaConsentStateFingerprint } from '../../privacy-gdpr/api/third-party-media.js';
import { confirmLeaveIfNeeded, lessonStoreFingerprint } from '../api/content-panel-modals.js';
import {
    hasActiveQuizInProgress,
    getQuizState,
    getQuizBlockById,
    buildStartQuizState,
    buildAnswerQuizPatch,
    evaluateQuizSession,
    hydrateQuizPassRecord,
    makeQuizStateGetter,
    persistLessonReadingPosition,
    hasExamAttemptInProgress,
    RECALL_ADVANCE_DELAY_MS,
    resolveQuizStateForSessionNav,
    sessionAwaitingForQuestion,
} from '../api/content-panel-quiz.js';
import { getExamQuizPresence } from '../api/quiz-status.js';
import {
    advanceQuestionSession,
    backQuestionSession,
    canAdvanceSession,
    createQuestionSession
} from '../api/question-session.js';
import { renameTocSection } from '../api/lesson-toc-mutations.js';
import { resolveLessonOpenSection, clampSectionIndex } from '../api/resolve-lesson-open-section.js';
import { buildTocFromBlocks } from '../api/content-toc.js';
import { useLessonEditor } from '../../editor/index.js';
import {
    saveLessonDraft,
    loadLessonDraft,
    clearLessonDraft,
    draftMatchesSavedContent,
    lessonContentFingerprint,
    isDraftBodyUsable,
} from '../../editor/api/logic/lesson-draft-persist.js';

function lessonDraftStateSig(node, lessonDraftLessonId, lessonBodyMarkdown, lessonDraftNonce) {
    const id = node?.id ?? '';
    if (lessonDraftLessonId !== id || lessonBodyMarkdown == null) return '';
    const s = lessonBodyMarkdown;
    let h = 0;
    const lim = Math.min(s.length, 1200);
    for (let i = 0; i < lim; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return `${s.length}:${h}:${lessonDraftNonce}`;
}

function createInitialPanelState() {
    return {
        currentNode: null,
        isTocVisible: false,
        activeSectionIndex: 0,
        examStarted: false,
        examShowResults: false,
        quizAttentionNonce: 0,
        blockSessions: {},
        visitedSections: new Set(),
        tocFilter: '',
        quizStates: {},
        quizPassRecord: {},
        lessonDraftLessonId: null,
        lessonBodyMarkdown: null,
        lessonConstructDraft: false,
        lessonDraftNonce: 0,
        lessonUserHasEdited: false,
        lessonSaveState: 'idle',
        lessonLocalDraftState: 'none',
        lessonHistoryStack: [],
        tocInlineEditIdx: null,
        headerMetaDraft: null,
        headerMetaSaving: false,
        careFeedbackMsg: null,
        mediaDeclinedLessonId: null,
        mediaConsentNonce: 0,
        mediaConsentForceOpen: false,
        lessonMagicGenerating: false
    };
}

/** Main content panel state + actions (replaces ArboritoContent + content-mixins). */
export function useContentPanel({ rootRef, contentAreaRef, editorRef, tocNavRef, tocScrollRef }) {
    const store = useLearningStore();
    const [panel, setPanel] = useState(createInitialPanelState);
    const [, bumpRender] = useState(0);
    const lastRenderKeyRef = useRef(null);
    const lastRenderSectionRef = useRef(null);
    const contentScrollSnapshotRef = useRef(null);
    const pendingTocAttentionIdxRef = useRef(null);
    const pendingQuizScrollRef = useRef(false);
    const scrollTocOnRenderRef = useRef(false);
    const skipLessonDraftDomCaptureRef = useRef(false);
    const lessonStoreFpRef = useRef(null);
    const lessonEditTourLastFiredForRef = useRef(null);
    const recallAdvanceTimerRef = useRef(null);
    const renderBlocksRef = useRef([]);
    const constructApiRef = useRef(null);
    const scrollToSectionRef = useRef(null);
    const draftAutosaveTimerRef = useRef(null);
    const captureFullDraftBodyRef = useRef(() => null);

    const draftSlice = useMemo(
        () => ({
            currentNode: panel.currentNode,
            lessonDraftLessonId: panel.lessonDraftLessonId,
            lessonBodyMarkdown: panel.lessonBodyMarkdown,
            lessonConstructDraft: panel.lessonConstructDraft,
            headerMetaDraft: panel.headerMetaDraft
        }),
        [
            panel.currentNode,
            panel.lessonDraftLessonId,
            panel.lessonBodyMarkdown,
            panel.lessonConstructDraft,
            panel.headerMetaDraft
        ]
    );

    const parseApi = useLessonParse(draftSlice);

    const scheduleUpdate = useCallback((immediate = false) => {
        const paint = () => bumpRender((n) => n + 1);
        if (immediate) paint();
        else requestAnimationFrame(paint);
    }, []);

    const patchPanel = useCallback((partial) => {
        setPanel((prev) => ({ ...prev, ...partial }));
    }, []);

    const isLessonConstructEdit = useCallback(() => {
        const n = panel.currentNode;
        return (
            !!store.value.constructionMode &&
            fileSystem.features.canWrite &&
            n &&
            (n.type === 'leaf' || n.type === 'exam')
        );
    }, [panel.currentNode]);

    const scheduleDraftAutosave = useCallback(() => {
        if (!isLessonConstructEdit()) return;
        clearTimeout(draftAutosaveTimerRef.current);
        draftAutosaveTimerRef.current = setTimeout(() => {
            const node = panel.currentNode;
            const sourceId = store.value.activeSource?.id;
            if (!node || !sourceId) return;
            const snap = captureFullDraftBodyRef.current?.();
            if (!snap?.bodyMarkdown) return;
            saveLessonDraft({
                sourceId,
                nodeId: node.id,
                bodyMarkdown: snap.bodyMarkdown,
                headerMetaDraft: snap.headerMetaDraft ?? panel.headerMetaDraft,
                activeSectionIndex: panel.activeSectionIndex,
                baseContentFp: lessonContentFingerprint(node.content)
            });
            patchPanel({ lessonLocalDraftState: 'saved' });
        }, 1200);
    }, [
        isLessonConstructEdit,
        panel.currentNode,
        panel.activeSectionIndex,
        panel.headerMetaDraft,
        patchPanel
    ]);

    const lessonEditor = useLessonEditor({
        editorRef,
        panel,
        patchPanel,
        isLessonConstructEdit,
        getLessonBodyForToc: parseApi.getLessonBodyForToc,
        invalidateLessonParseCache: parseApi.invalidateLessonParseCache,
        scheduleDraftAutosave
    });

    captureFullDraftBodyRef.current = lessonEditor.captureFullDraftBody;

    useEffect(() => {
        return () => clearTimeout(draftAutosaveTimerRef.current);
    }, []);

    useEffect(() => {
        const node = panel.currentNode;
        if (!node || !isLessonConstructEdit()) return;
        if (!panel.lessonConstructDraft || panel.lessonBodyMarkdown == null) return;
        if (isDraftBodyUsable(panel.lessonBodyMarkdown, node.content || '')) return;
        const sourceId = store.value.activeSource?.id;
        if (sourceId != null) clearLessonDraft(sourceId, node.id);
        parseApi.invalidateLessonParseCache();
        patchPanel({
            lessonBodyMarkdown: null,
            lessonDraftLessonId: null,
            lessonConstructDraft: false,
            lessonUserHasEdited: false,
            lessonLocalDraftState: 'none',
        });
        lastRenderKeyRef.current = null;
    }, [
        panel.currentNode?.id,
        panel.lessonConstructDraft,
        panel.lessonBodyMarkdown,
        isLessonConstructEdit,
        parseApi,
        patchPanel,
        store.value.activeSource?.id,
    ]);

    const isLessonDirty = useCallback(() => {
        if (!panel.currentNode || !isLessonConstructEdit()) return false;
        return !!panel.lessonUserHasEdited;
    }, [panel.currentNode, panel.lessonUserHasEdited, isLessonConstructEdit]);

    const confirmPanelLeaveIfNeeded = useCallback(async () => {
        return confirmLeaveIfNeeded(
            {
                ...panel,
                isLessonConstructEdit,
                isLessonDirty,
                hasActiveQuizInProgress: () =>
                    hasActiveQuizInProgress({ ...panel, isLessonConstructEdit }),
                hasExamAttemptInProgress: () =>
                    hasExamAttemptInProgress({ ...panel, isLessonConstructEdit }),
            },
            { saveLesson: () => constructApiRef.current?._saveLessonShell?.() }
        );
    }, [panel, isLessonConstructEdit, isLessonDirty]);

    const persistExamPass = useCallback(() => {
        if (!panel.currentNode || !isExamLesson(panel.currentNode)) return;
        store.markComplete(panel.currentNode.id, true);
        store.markExamExemptSiblingLeaves(panel.currentNode.id);
        store.checkForModuleCompletion(panel.currentNode.id);
    }, [panel.currentNode]);

    const buildConstructCtx = useCallback(() => {
        return {
            ...panel,
            lastRenderKey: lastRenderKeyRef.current,
            _lastRenderSection: lastRenderSectionRef.current,
            _contentScrollSnapshot: contentScrollSnapshotRef.current,
            _pendingTocAttentionIdx: pendingTocAttentionIdxRef.current,
            _scrollTocOnRender: scrollTocOnRenderRef.current,
            _skipLessonDraftDomCapture: skipLessonDraftDomCaptureRef.current,
            _renderBlocks: renderBlocksRef.current,
            _lessonStoreFp: lessonStoreFpRef.current,
            _lessonEditTourLastFiredFor: lessonEditTourLastFiredForRef.current,
            _lessonUserHasEdited: panel.lessonUserHasEdited,
            _lessonDraftLessonId: panel.lessonDraftLessonId,
            _lessonBodyMarkdown: panel.lessonBodyMarkdown,
            _lessonDraftNonce: panel.lessonDraftNonce,
            _lessonSaveState: panel.lessonSaveState,
            _lessonHistoryStack: panel.lessonHistoryStack,
            _tocInlineEditIdx: panel.tocInlineEditIdx,
            _headerMetaDraft: panel.headerMetaDraft,
            _headerMetaSaving: panel.headerMetaSaving,
            _careFeedbackMsg: panel.careFeedbackMsg,
            _lessonMagicGenerating: panel.lessonMagicGenerating,
            getEditorEl: lessonEditor.getEditorEl,
            scheduleUpdate,
            render: () => scheduleUpdate(true),
            isLessonConstructEdit,
            _isLessonConstructEdit: isLessonConstructEdit,
            _isLessonDirty: isLessonDirty,
            hasActiveQuizInProgress: () => hasActiveQuizInProgress({ ...panel, isLessonConstructEdit }),
            confirmLeaveIfNeeded: confirmPanelLeaveIfNeeded,
            getQuizState: (id) => getQuizState(panel.quizStates, id),
            getContentForTocParse: parseApi.getContentForTocParse,
            _getContentForTocParse: parseApi.getContentForTocParse,
            _getLessonBodyForToc: parseApi.getLessonBodyForToc,
            _getLessonParseModel: parseApi.getLessonParseModel,
            _invalidateLessonParseCache: parseApi.invalidateLessonParseCache,
            persistExamPass,
            _persistExamPass: persistExamPass
        };
    }, [panel, scheduleUpdate, isLessonConstructEdit, isLessonDirty, parseApi, persistExamPass, lessonEditor.getEditorEl, confirmPanelLeaveIfNeeded]);

    const refreshConstructApi = useCallback(() => {
        constructApiRef.current = createLessonConstructApi(buildConstructCtx(), {
            patchPanel,
            scheduleUpdate,
            lessonEditorMethods: lessonEditor.bridgeMethods
        });
    }, [buildConstructCtx, patchPanel, scheduleUpdate, lessonEditor.bridgeMethods]);

    if (!constructApiRef.current) {
        refreshConstructApi();
    }

    useEffect(() => {
        refreshConstructApi();
    });

    const scrollToSection = useCallback(
        async (idx, opts = {}) => {
            const visitedForPersist = opts.visitedSections ?? panel.visitedSections;
            const contentForParse = parseApi.getContentForTocParse();
            const isExam = panel.currentNode && isExamLesson(panel.currentNode);
            const { blocks, toc } = parseApi.getLessonParseModel(contentForParse, !!isExam);
            const tocAccess = getTocAccess(!!isExam, panel.examStarted);
            const sectionOpts = isExam
                ? buildExamSectionOpts({
                      examStarted: panel.examStarted,
                      examShowResults: panel.examShowResults,
                  })
                : {};
            const construct = isLessonConstructEdit();
            const getQuizStateFn = makeQuizStateGetter(panel.quizStates, panel.quizPassRecord);
            if (
                !construct &&
                !isTocSectionAccessible(
                    tocAccess,
                    idx,
                    toc,
                    blocks,
                    panel.visitedSections,
                    getQuizStateFn,
                    sectionOpts
                )
            ) {
                return;
            }
            if (
                idx !== panel.activeSectionIndex &&
                !construct &&
                !(isExam && panel.examStarted) &&
                hasActiveQuizInProgress({ ...panel, isLessonConstructEdit })
            ) {
                const ok = await confirmPanelLeaveIfNeeded();
                if (!ok) return;
            }
            const switchingSection = construct && idx !== panel.activeSectionIndex;
            if (switchingSection) constructApiRef.current._flushConstructSectionToBody?.();
            const sectionChanging = idx !== panel.activeSectionIndex;
            patchPanel({ activeSectionIndex: idx });
            if (sectionChanging) scrollTocOnRenderRef.current = true;
            if (panel.currentNode) {
                const bookmark = store.getBookmark(panel.currentNode.id, panel.currentNode.content);
                if (bookmark && bookmark.index === idx) {
                    const toc = getToc({ content: panel.currentNode.content });
                    store.saveBookmark(panel.currentNode.id, panel.currentNode.content, idx, panel.visitedSections, {
                        manual: true,
                        sectionTitle: String(toc[idx]?.text || bookmark.sectionTitle || '').trim()
                    });
                }
                persistLessonReadingPosition(store, {
                    nodeId: panel.currentNode.id,
                    index: idx,
                    visitedSections: visitedForPersist,
                    contentRaw: panel.currentNode.content,
                    quizPassRecord: panel.quizPassRecord,
                    isExam: !!isExam,
                });
            }
            if (switchingSection) skipLessonDraftDomCaptureRef.current = true;
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [panel, parseApi, isLessonConstructEdit, patchPanel, scheduleUpdate, confirmPanelLeaveIfNeeded]
    );

    scrollToSectionRef.current = scrollToSection;

    const handleExamPass = useCallback(() => {
        const n = panel.currentNode;
        if (!n) return;
        if (isExamLesson(n) && n.content) {
            const { blocks } = parseApi.getLessonParseModel(n.content, true);
            const questionIds = getExpandedQuestionIdsForExam(blocks);
            if (questionIds.length) {
                const correct = questionIds.filter((id) => !!getQuizState(panel.quizStates, id).correct).length;
                if (correct / questionIds.length >= 0.8) persistExamPass();
            }
        }
        const parent = n.parentId ? store.findNode(n.parentId) : null;
        const moduleId =
            parent && (parent.type === 'branch' || parent.type === 'root') ? parent.id : n.id;
        store.setModal({ type: 'certificate', moduleId });
    }, [panel.currentNode, panel.quizStates, parseApi, persistExamPass]);

    const handleClose = useCallback(async () => {
        const ok = await confirmPanelLeaveIfNeeded();
        if (!ok) return;
        if (panel.currentNode) {
            const bookmark = store.getBookmark(panel.currentNode.id, panel.currentNode.content);
            if (bookmark && bookmark.index === panel.activeSectionIndex) {
                const toc = getToc({ content: panel.currentNode.content });
                store.saveBookmark(
                    panel.currentNode.id,
                    panel.currentNode.content,
                    panel.activeSectionIndex,
                    panel.visitedSections,
                    {
                        manual: true,
                        sectionTitle: String(toc[panel.activeSectionIndex]?.text || '').trim()
                    }
                );
            }
            persistLessonReadingPosition(store, {
                nodeId: panel.currentNode.id,
                index: panel.activeSectionIndex,
                visitedSections: panel.visitedSections,
                contentRaw: panel.currentNode.content,
                quizPassRecord: panel.quizPassRecord,
                isExam: isExamLesson(panel.currentNode),
            });
        }
        stopSpeaking();
        store.closeContent();
    }, [panel, confirmPanelLeaveIfNeeded]);

    const toggleToc = useCallback(() => {
        patchPanel({ isTocVisible: !panel.isTocVisible });
        lastRenderKeyRef.current = null;
        scheduleUpdate(true);
    }, [panel.isTocVisible, patchPanel, scheduleUpdate]);

    const toggleBookmark = useCallback(() => {
        if (!panel.currentNode) return;
        const bookmark = store.getBookmark(panel.currentNode.id, panel.currentNode.content);
        if (bookmark && bookmark.index === panel.activeSectionIndex) {
            store.removeBookmark(panel.currentNode.id);
        } else {
            const toc = getToc({ content: panel.currentNode.content });
            store.saveBookmark(
                panel.currentNode.id,
                panel.currentNode.content,
                panel.activeSectionIndex,
                panel.visitedSections,
                {
                    manual: true,
                    sectionTitle: String(toc[panel.activeSectionIndex]?.text || '').trim()
                }
            );
        }
        lastRenderKeyRef.current = null;
        scheduleUpdate(true);
    }, [panel, scheduleUpdate]);

    const startQuiz = useCallback(
        (id) => {
            contentScrollSnapshotRef.current = contentAreaRef?.current?.scrollTop ?? 0;
            const block = getQuizBlockById(
                { ...panel, getContentForTocParse: parseApi.getContentForTocParse },
                id
            );
            const prev = getQuizState(panel.quizStates, id);
            patchPanel({
                quizStates: { ...panel.quizStates, [id]: buildStartQuizState(id, block, prev) }
            });
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [panel, parseApi, patchPanel, contentAreaRef, scheduleUpdate]
    );

    const startTheExam = useCallback(() => {
        if (!panel.currentNode) return;
        patchPanel({
            examStarted: true,
            examShowResults: false,
            activeSectionIndex: 0,
            visitedSections: new Set([0]),
            quizAttentionNonce: (panel.quizAttentionNonce || 0) + 1,
            quizStates: {},
            blockSessions: {},
            lessonBodyMarkdown: null,
            lessonDraftLessonId: null,
            lessonConstructDraft: false,
        });
        parseApi.invalidateLessonParseCache();
        scrollTocOnRenderRef.current = true;
        lastRenderKeyRef.current = null;
        scheduleUpdate(true);
    }, [panel.currentNode, panel.quizAttentionNonce, parseApi, patchPanel, scheduleUpdate]);

    const resetExamAttempt = useCallback(() => {
        if (!panel.currentNode) return;
        patchPanel({
            examStarted: true,
            examShowResults: false,
            activeSectionIndex: 0,
            visitedSections: new Set([0]),
            quizStates: {},
            blockSessions: {},
            quizPassRecord: {},
        });
        scrollTocOnRenderRef.current = true;
        lastRenderKeyRef.current = null;
        scheduleUpdate(true);
    }, [panel.currentNode, parseApi, patchPanel, scheduleUpdate]);

    const startBlockQuiz = useCallback(
        (blockKey, questionIds, opts = {}) => {
            if (!blockKey || !questionIds?.length) return;
            const ctx = { ...panel, getContentForTocParse: parseApi.getContentForTocParse };
            const nextQuizStates = { ...panel.quizStates };
            if (opts.retry) {
                for (const id of questionIds) delete nextQuizStates[id];
            }
            const firstId = questionIds[0];
            if (firstId) {
                const block = getQuizBlockById(ctx, firstId);
                const prev = getQuizState(nextQuizStates, firstId);
                nextQuizStates[firstId] = buildStartQuizState(firstId, block, prev);
            }
            const session = createQuestionSession(blockKey, questionIds);
            patchPanel({
                quizStates: nextQuizStates,
                blockSessions: { ...panel.blockSessions, [blockKey]: session },
                quizAttentionNonce: (panel.quizAttentionNonce || 0) + 1,
            });
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
            queueMicrotask(() => scrollLessonContentToQuiz(contentAreaRef?.current));
        },
        [panel, parseApi, patchPanel, scheduleUpdate, contentAreaRef]
    );

    const advanceBlockSession = useCallback(
        (blockKey) => {
            if (recallAdvanceTimerRef.current) {
                clearTimeout(recallAdvanceTimerRef.current);
                recallAdvanceTimerRef.current = null;
            }
            const session = panel.blockSessions?.[blockKey];
            if (!session || !canAdvanceSession(session)) return;
            const next = advanceQuestionSession(session);
            if (!next) return;
            if (!next.finished) {
                const nextId = next.quizIds[next.currentIndex];
                const ctx = { ...panel, getContentForTocParse: parseApi.getContentForTocParse };
                const nextQuizStates = { ...panel.quizStates };
                if (nextId) {
                    const block = getQuizBlockById(ctx, nextId);
                    nextQuizStates[nextId] = resolveQuizStateForSessionNav(nextQuizStates, nextId, block);
                }
                const awaitingAdvance = nextId
                    ? sessionAwaitingForQuestion(nextQuizStates, nextId)
                    : false;
                patchPanel({
                    blockSessions: {
                        ...panel.blockSessions,
                        [blockKey]: { ...next, awaitingAdvance },
                    },
                    quizStates: nextQuizStates,
                });
                lastRenderKeyRef.current = null;
                scheduleUpdate(true);
                return;
            }
            const evalPatch = evaluateQuizSession(
                {
                    ...panel,
                    blockSessions: { ...panel.blockSessions, [blockKey]: next },
                },
                next
            );
            const visited = new Set(panel.visitedSections);
            visited.add(panel.activeSectionIndex);
            patchPanel({
                blockSessions: { ...panel.blockSessions, [blockKey]: next },
                visitedSections: visited,
                ...evalPatch,
            });
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [panel, parseApi, patchPanel, persistExamPass, scheduleUpdate]
    );

    const backBlockSession = useCallback(
        (blockKey) => {
            const session = panel.blockSessions?.[blockKey];
            if (!session) return;
            const prev = backQuestionSession(session);
            if (!prev || prev === session) return;
            const id = prev.quizIds[prev.currentIndex];
            const ctx = { ...panel, getContentForTocParse: parseApi.getContentForTocParse };
            const nextQuizStates = { ...panel.quizStates };
            if (id) {
                const block = getQuizBlockById(ctx, id);
                nextQuizStates[id] = resolveQuizStateForSessionNav(nextQuizStates, id, block);
            }
            const awaitingAdvance = id ? sessionAwaitingForQuestion(nextQuizStates, id) : false;
            patchPanel({
                blockSessions: {
                    ...panel.blockSessions,
                    [blockKey]: { ...prev, awaitingAdvance },
                },
                quizStates: nextQuizStates,
            });
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [panel, parseApi, patchPanel, scheduleUpdate]
    );

    const dismissBlockSession = useCallback(
        (blockKey) => {
            if (!blockKey) return;
            const next = { ...panel.blockSessions };
            delete next[blockKey];
            patchPanel({ blockSessions: next });
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [panel.blockSessions, patchPanel, scheduleUpdate]
    );

    const answerQuiz = useCallback(
        (id, isCorrect) => {
            contentScrollSnapshotRef.current = contentAreaRef?.current?.scrollTop ?? 0;
            const patch = buildAnswerQuizPatch(
                { ...panel, isLessonConstructEdit, persistExamPass },
                id,
                isCorrect
            );
            if (patch.scheduleRecallAdvance) {
                const { blockKey } = patch.scheduleRecallAdvance;
                if (recallAdvanceTimerRef.current) clearTimeout(recallAdvanceTimerRef.current);
                recallAdvanceTimerRef.current = setTimeout(() => {
                    recallAdvanceTimerRef.current = null;
                    if (blockKey) advanceBlockSession(blockKey);
                }, RECALL_ADVANCE_DELAY_MS);
                delete patch.scheduleRecallAdvance;
            }
            patchPanel(patch);
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [panel, isLessonConstructEdit, persistExamPass, patchPanel, contentAreaRef, scheduleUpdate, advanceBlockSession]
    );

    const focusPendingSection = useCallback(
        (targetIdx, { scrollQuiz = false } = {}) => {
            if (targetIdx < 0) return;
            pendingTocAttentionIdxRef.current = targetIdx;
            if (scrollQuiz) pendingQuizScrollRef.current = true;
            if (targetIdx !== panel.activeSectionIndex) {
                scrollToSection(targetIdx);
                return;
            }
            pulseTocRowAttention(tocNavRef?.current, targetIdx);
            if (scrollQuiz) {
                scrollLessonContentToQuiz(contentAreaRef?.current);
                patchPanel({ quizAttentionNonce: (panel.quizAttentionNonce || 0) + 1 });
            }
            pendingTocAttentionIdxRef.current = null;
            pendingQuizScrollRef.current = false;
        },
        [panel.activeSectionIndex, scrollToSection, contentAreaRef, tocNavRef]
    );

    const completeAndNext = useCallback(() => {
        if (!panel.currentNode) return;
        const contentForParse = parseApi.getContentForTocParse();
        const isExam = isExamLesson(panel.currentNode);
        const sectionOpts = isExam
            ? buildExamSectionOpts({
                  examStarted: panel.examStarted,
                  examShowResults: panel.examShowResults,
              })
            : {};
        const { blocks: allBlocks, toc: rawToc } = parseApi.getLessonParseModel(contentForParse, isExam);
        const toc = isExam ? appendExamFinalTocItem(rawToc, true) : rawToc;
        const idx = panel.activeSectionIndex;
        const questionIds = getExpandedQuestionIdsForSection(allBlocks, toc, idx);
        const getQuizStateFn = makeQuizStateGetter(panel.quizStates, panel.quizPassRecord);
        const focusFirstIncomplete = (pendingIdx) => {
            if (pendingIdx < 0) return;
            const scrollQuiz = sectionHasIncompleteQuiz(
                pendingIdx,
                allBlocks,
                toc,
                getQuizStateFn,
                sectionOpts
            );
            focusPendingSection(pendingIdx, { scrollQuiz });
        };
        if (isExamFinalSectionIndex(toc, idx)) return;
        if (questionIds.length > 0) {
            const quizOk = isExam
                ? questionIds.every((qid) => {
                      const st = getQuizStateFn(qid);
                      return !!(st && st.finished);
                  })
                : questionIds.every((qid) => {
                      const st = getQuizStateFn(qid);
                      return !!(st && st.finished && st.correct);
                  });
            if (!quizOk) {
                store.notify(
                    store.ui.lessonQuizRequired || 'Answer the quiz correctly before continuing.',
                    true
                );
                focusPendingSection(idx, { scrollQuiz: true });
                return;
            }
        }
        const visited = new Set(panel.visitedSections);
        visited.add(idx);
        const contentLen = getContentTocLength(toc);
        if (idx < contentLen - 1) {
            patchPanel({ visitedSections: visited, examShowResults: false });
            scrollToSection(idx + 1, { visitedSections: visited });
            return;
        }
        if (isExam && panel.examStarted && idx === contentLen - 1) {
            if (!areAllExamQuestionsFinished(allBlocks, getQuizStateFn)) {
                store.notify(
                    store.ui.examCompleteAllQuizzes ||
                        store.ui.lessonQuizRequired ||
                        'Answer every exam question before viewing results.',
                    true
                );
                const pendingIdx = findFirstIncompleteSectionIndex(
                    toc,
                    allBlocks,
                    visited,
                    getQuizStateFn,
                    sectionOpts
                );
                focusFirstIncomplete(pendingIdx);
                return;
            }
            const finalIdx = toc.length - 1;
            visited.add(finalIdx);
            patchPanel({
                visitedSections: visited,
                examShowResults: true,
                activeSectionIndex: finalIdx,
            });
            scrollTocOnRenderRef.current = true;
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
            return;
        }
        const allDone = toc
            .slice(0, contentLen)
            .every((_, i) =>
                isTocSectionCompleted(i, toc, allBlocks, visited, getQuizStateFn, sectionOpts)
            );
        if (!allDone) {
            store.notify(
                store.ui.lessonSectionsIncomplete ||
                    'Mark every section of the outline before completing the lesson.',
                true
            );
            const pendingIdx = findFirstIncompleteSectionIndex(
                toc,
                allBlocks,
                visited,
                getQuizStateFn,
                sectionOpts
            );
            focusFirstIncomplete(pendingIdx);
            return;
        }
        if (isExam && panel.examStarted) {
            if (!areAllExamQuestionsFinished(allBlocks, getQuizStateFn)) {
                const pendingIdx = findFirstIncompleteSectionIndex(
                    toc,
                    allBlocks,
                    visited,
                    getQuizStateFn,
                    sectionOpts
                );
                focusFirstIncomplete(pendingIdx);
                return;
            }
            patchPanel({ visitedSections: visited, examShowResults: true, activeSectionIndex: toc.length - 1 });
            return;
        }
        patchPanel({ visitedSections: visited });
        if (!store.isCompleted(panel.currentNode.id)) {
            store.markComplete(panel.currentNode.id, true);
            store.checkForModuleCompletion(panel.currentNode.id);
        }
        store.closeContent();
    }, [panel, parseApi, patchPanel, scrollToSection, focusPendingSection]);

    const applyTocRename = useCallback(
        (idx, title) => {
            if (!isLessonConstructEdit()) return;
            constructApiRef.current._captureLessonDraftFromDom?.();
            const body = parseApi.getLessonBodyForToc();
            const next = renameTocSection(body, idx, title, '');
            patchPanel({
                lessonBodyMarkdown: next,
                lessonDraftLessonId: panel.currentNode.id,
                lessonConstructDraft: true,
                lessonDraftNonce: panel.lessonDraftNonce + 1,
                tocInlineEditIdx: null,
                lessonUserHasEdited: true
            });
            skipLessonDraftDomCaptureRef.current = true;
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [isLessonConstructEdit, parseApi, panel, patchPanel, scheduleUpdate]
    );

    const fireLessonEditTourEnter = useCallback((nodeId) => {
        if (nodeId == null || lessonEditTourLastFiredForRef.current === nodeId) return;
        lessonEditTourLastFiredForRef.current = nodeId;
        queueMicrotask(() => {
            try {
                window.dispatchEvent(new CustomEvent('arborito-lesson-edit-enter'));
            } catch {
                /* ignore */
            }
        });
    }, []);

    const onStoreChange = useCallback(
        (detail) => {
            const newNode = detail.selectedNode;
            const newId = newNode ? newNode.id : null;
            const currentId = panel.currentNode ? panel.currentNode.id : null;

            if (newId !== currentId) {
                parseApi.invalidateLessonParseCache();
                lessonStoreFpRef.current = null;
                if (newNode) {
                    let openHint = null;
                    const hint = store.value.lessonOpenHint;
                    const constructEdit =
                        store.value.constructionMode &&
                        (newNode.type === 'leaf' || newNode.type === 'exam');
                    if (hint && typeof hint.index === 'number') {
                        openHint = hint;
                        store.update({ lessonOpenHint: null });
                    } else if (hint) {
                        store.update({ lessonOpenHint: null });
                    }
                    if (!constructEdit) {
                        let tocLength = 0;
                        try {
                            if (newNode.content) {
                                const parsed = parseArboritoFile(newNode.content);
                                const rawBlocks = parseContent(parsed.body || newNode.content);
                                tocLength = buildTocFromBlocks(rawBlocks).length;
                            }
                        } catch {
                            tocLength = 0;
                        }
                        const isExamNode = isExamLesson(newNode);
                        const recent = store.getRecentLessonPosition(newNode.id, newNode.content);
                        let { index, visited } = resolveLessonOpenSection({
                            hint: openHint,
                            recent,
                            tocLength,
                        });
                        const quizPassRecord = isExamNode
                            ? {}
                            : hydrateQuizPassRecord(recent?.quizPassed);
                        const sourceId = store.value.activeSource?.id;
                        if (isExamNode) {
                            index = 0;
                            visited = new Set();
                        }
                        setPanel({
                            ...createInitialPanelState(),
                            currentNode: newNode,
                            activeSectionIndex: index,
                            visitedSections: visited,
                            quizPassRecord: isExamNode ? {} : quizPassRecord,
                            examStarted: false,
                            examShowResults: false,
                            quizStates: {},
                            blockSessions: {},
                            isTocVisible: false,
                        });
                        parseApi.invalidateLessonParseCache();
                        scrollTocOnRenderRef.current = true;
                        persistLessonReadingPosition(store, {
                            nodeId: newNode.id,
                            index,
                            visitedSections: visited,
                            contentRaw: newNode.content,
                            quizPassRecord: isExamNode ? {} : quizPassRecord,
                            isExam: isExamNode,
                        });
                    } else {
                        const sourceId = store.value.activeSource?.id;
                        const storedDraft =
                            sourceId != null ? loadLessonDraft(sourceId, newNode.id) : null;
                        const restoreDraft =
                            storedDraft &&
                            draftMatchesSavedContent(storedDraft, newNode.content || '');
                        if (restoreDraft) {
                            setPanel({
                                ...createInitialPanelState(),
                                currentNode: newNode,
                                lessonBodyMarkdown: storedDraft.bodyMarkdown,
                                lessonDraftLessonId: newNode.id,
                                lessonConstructDraft: true,
                                headerMetaDraft: storedDraft.headerMetaDraft ?? null,
                                activeSectionIndex: storedDraft.activeSectionIndex ?? 0,
                                lessonUserHasEdited: true,
                                lessonSaveState: 'idle',
                                lessonLocalDraftState: 'saved',
                                isTocVisible: false
                            });
                            fireLessonEditTourEnter(newNode.id);
                            queueMicrotask(() => {
                                store.notify(
                                    store.ui.editorDraftRestored ||
                                        'Recuperamos un borrador de este dispositivo.',
                                    false
                                );
                            });
                        } else {
                            if (sourceId != null) clearLessonDraft(sourceId, newNode.id);
                            setPanel({
                                ...createInitialPanelState(),
                                currentNode: newNode,
                                lessonSaveState: 'saved',
                                isTocVisible: false
                            });
                            fireLessonEditTourEnter(newNode.id);
                        }
                    }
                } else {
                    lessonEditTourLastFiredForRef.current = null;
                    try {
                        window.dispatchEvent(new CustomEvent('arborito-lesson-edit-cancel'));
                    } catch {
                        /* ignore */
                    }
                    setPanel(createInitialPanelState());
                }
                lastRenderKeyRef.current = null;
                scheduleUpdate(true);
                return;
            }
            if (newId != null && newNode && currentId === newId && newNode !== panel.currentNode) {
                parseApi.invalidateLessonParseCache();
                patchPanel({ currentNode: newNode, headerMetaDraft: null });
                lastRenderKeyRef.current = null;
                scheduleUpdate(true);
            }
            const fp = lessonStoreFingerprint(panel.currentNode, detail);
            if (fp && fp === lessonStoreFpRef.current) return;
            lessonStoreFpRef.current = fp;
            scheduleUpdate();
        },
        [panel.currentNode, parseApi, patchPanel, scheduleUpdate, fireLessonEditTourEnter]
    );

    useEffect(() => {
        onStoreChange(store.value);
        const handler = (ev) => onStoreChange(ev.detail);
        store.addEventListener('state-change', handler);
        return () => store.removeEventListener('state-change', handler);
    }, [onStoreChange]);

    const apiRef = useRef({});

    const syncApiRef = useCallback(() => {
        const api = apiRef.current;
        api.scheduleUpdate = scheduleUpdate;
        api.currentNode = panel.currentNode;
        api.confirmLeaveIfNeeded = confirmPanelLeaveIfNeeded;
        api._isLessonDirty = isLessonDirty;
        api.hasActiveQuizInProgress = () =>
            hasActiveQuizInProgress({ ...panel, isLessonConstructEdit });
        api.hasExamAttemptInProgress = () =>
            hasExamAttemptInProgress({ ...panel, isLessonConstructEdit });
        api.resolveAppCloseIfNeeded = async () =>
            (await confirmPanelLeaveIfNeeded()) ? 'proceed' : 'cancel';
        api.render = () => scheduleUpdate(true);
        api.renderKey = lastRenderKeyRef.current;
        Object.defineProperty(api, 'lastRenderKey', {
            get: () => lastRenderKeyRef.current,
            set: (v) => {
                lastRenderKeyRef.current = v;
            },
            configurable: true
        });
    }, [panel, scheduleUpdate, isLessonConstructEdit, isLessonDirty, rootRef, confirmPanelLeaveIfNeeded]);

    syncApiRef();

    const computeRenderKey = useCallback(() => {
        const n = panel.currentNode;
        const lessonBookmark = n ? store.getBookmark(n.id, n.content) : null;
        const isBookmarkedHere = !!(lessonBookmark && lessonBookmark.index === panel.activeSectionIndex);
        const constructEdit = isLessonConstructEdit();
        const nodeSurfaceKey = n
            ? `${n.icon ?? ''}\u0001${(n.content || '').length}\u0001${(n.name || '').trim()}`
            : null;
        return JSON.stringify({
            id: n ? n.id : null,
            nodeSurfaceKey,
            tocVisible: panel.isTocVisible,
            section: panel.activeSectionIndex,
            examStarted: panel.examStarted,
            blockSessions: panel.blockSessions,
            quizzes: panel.quizStates,
            completed: n ? store.isCompleted(n.id) : false,
            visitedCount: panel.visitedSections.size,
            bookmarked: isBookmarkedHere,
            bookmarkSection: lessonBookmark ? lessonBookmark.index : null,
            theme: store.value.theme,
            sourceId: store.value.activeSource?.id || null,
            constructionMode: store.value.constructionMode,
            constructEdit,
            tocInlineEditIdx: panel.tocInlineEditIdx,
            lessonDraftNonce: panel.lessonDraftNonce,
            lessonDraftSig: lessonDraftStateSig(
                n,
                panel.lessonDraftLessonId,
                panel.lessonBodyMarkdown,
                panel.lessonDraftNonce
            ),
            mediaDeclined: panel.mediaDeclinedLessonId,
            mediaNonce: panel.mediaConsentNonce,
            mediaConsentFp: getMediaConsentStateFingerprint(),
            mediaConsentForceOpen: panel.mediaConsentForceOpen
        });
    }, [panel, isLessonConstructEdit]);

    const getLessonRenderData = useCallback(() => {
        const stateKey = computeRenderKey();
        const isSameKey = stateKey === lastRenderKeyRef.current && panel.currentNode;
        if (!isSameKey) lastRenderKeyRef.current = stateKey;

        if (!panel.currentNode) return { empty: true };

        const constructEdit = isLessonConstructEdit();
        /* DOM → draft capture runs on section switch / save (scrollToSection,
         * _flushConstructSectionToBody). Calling it here during render caused
         * patchPanel → infinite re-renders when opening a lesson in construction. */

        const contentForParse = parseApi.getContentForTocParse();
        const isExam = isExamLesson(panel.currentNode);
        const { blocks: allBlocks, toc: rawToc, parsedForBlocks } = parseApi.getLessonParseModel(
            contentForParse,
            isExam
        );
        const toc = isExam && !constructEdit ? appendExamFinalTocItem(rawToc, true) : rawToc;
        const filteredToc = getFilteredToc(toc, panel.tocFilter);
        renderBlocksRef.current = allBlocks;

        const activeBlocks = getActiveBlocks(allBlocks, toc, panel.activeSectionIndex);
        const examAwaitingStart = isExam && !panel.examStarted && !constructEdit;
        const bodyMd = parseApi.getLessonBodyForToc();
        const quizPresence = getExamQuizPresence(bodyMd, allBlocks);
        const hasExamQuizzes = quizPresence.hasAnyQuizFence;
        const onExamIntro = examAwaitingStart;
        const examPreStart = examAwaitingStart;
        const tocAccess = getTocAccess(isExam, panel.examStarted);

        let lessonHeaderTitleValue = '';
        let lessonHeaderDescValue = '';
        if (constructEdit) {
            lessonHeaderTitleValue = (panel.currentNode.name || '').trim();
            lessonHeaderDescValue = String(
                parsedForBlocks.meta.description || panel.currentNode.description || ''
            ).trim();
            if (panel.headerMetaDraft?.nodeId === panel.currentNode.id) {
                if (panel.headerMetaDraft.title != null) lessonHeaderTitleValue = panel.headerMetaDraft.title;
                if (panel.headerMetaDraft.description != null) {
                    lessonHeaderDescValue = panel.headerMetaDraft.description;
                }
            }
        }

        const sectionOpts = isExam
            ? buildExamSectionOpts({
                  examStarted: panel.examStarted,
                  examShowResults: panel.examShowResults,
              })
            : {};
        const progress =
            toc.length > 0
                ? computeLessonProgress(
                      toc,
                      allBlocks,
                      panel.visitedSections,
                      makeQuizStateGetter(panel.quizStates, panel.quizPassRecord),
                      sectionOpts
                  )
                : 0;

        return {
            allBlocks,
            toc,
            filteredToc,
            activeBlocks,
            progress,
            isExam,
            hasExamQuizzes,
            onExamIntro,
            examPreStart,
            examShowResults: !!panel.examShowResults,
            tocAccess,
            constructEdit,
            lessonHeaderTitleValue,
            lessonHeaderDescValue,
            skipRepaint: isSameKey
        };
    }, [
        computeRenderKey,
        panel,
        isLessonConstructEdit,
        parseApi
    ]);

    const syncHeaderMetaChange = useCallback(
        (partial) => {
            const nodeId = panel.currentNode?.id;
            if (nodeId == null) return;
            const draft =
                panel.headerMetaDraft?.nodeId === nodeId
                    ? { ...panel.headerMetaDraft }
                    : { nodeId };
            if (partial.title !== undefined) draft.title = partial.title;
            if (partial.description !== undefined) draft.description = partial.description;
            patchPanel({ headerMetaDraft: draft, lessonUserHasEdited: true, lessonLocalDraftState: 'pending' });
            scheduleDraftAutosave();
        },
        [panel.currentNode, panel.headerMetaDraft, patchPanel, scheduleDraftAutosave]
    );

    const pickHeaderEmoji = useCallback(async (icon) => {
        await constructApiRef.current?._saveLessonHeaderIcon?.(icon);
    }, []);

    const handleLessonSave = useCallback(() => {
        void constructApiRef.current?._saveLessonShell?.();
    }, []);

    const handleTocMove = useCallback((idx, action) => {
        constructApiRef.current?._lessonTocMoveAt?.(idx, action);
    }, []);

    const handleTocAdd = useCallback(() => {
        constructApiRef.current?._lessonTocAdd?.();
    }, []);

    const handleTocAddSub = useCallback((idx) => {
        constructApiRef.current?._lessonTocAddSubAt?.(idx);
    }, []);

    const handleTocRemove = useCallback((idx) => {
        constructApiRef.current?._lessonTocRemoveAt?.(idx);
    }, []);

    const handleTocRenameStart = useCallback(
        (idx) => {
            patchPanel({ tocInlineEditIdx: idx });
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [patchPanel, scheduleUpdate]
    );

    const handleTocTickToggle = useCallback(
        (idx) => {
            if (panel.currentNode && isExamLesson(panel.currentNode) && panel.examStarted) return;
            const visited = new Set(panel.visitedSections);
            if (visited.has(idx)) {
                visited.delete(idx);
                if (panel.currentNode && store.isCompleted(panel.currentNode.id)) {
                    store.markComplete(panel.currentNode.id, false);
                }
            } else {
                visited.add(idx);
            }
            if (panel.currentNode) {
                persistLessonReadingPosition(store, {
                    nodeId: panel.currentNode.id,
                    index: panel.activeSectionIndex,
                    visitedSections: visited,
                    contentRaw: panel.currentNode.content,
                    quizPassRecord: panel.quizPassRecord,
                    isExam: isExamLesson(panel.currentNode),
                });
            }
            patchPanel({ visitedSections: visited });
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [panel, patchPanel, scheduleUpdate]
    );

    const handleConstructSectionClick = useCallback(
        (idx) => {
            if (idx === panel.activeSectionIndex) {
                const savedTop = contentAreaRef?.current?.scrollTop ?? 0;
                patchPanel({ isTocVisible: false });
                lastRenderKeyRef.current = null;
                scheduleUpdate(true);
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const ca = contentAreaRef?.current;
                        if (ca) ca.scrollTop = savedTop;
                    });
                });
                return;
            }
            patchPanel({ isTocVisible: false });
            scrollToSection(idx);
        },
        [panel.activeSectionIndex, contentAreaRef, patchPanel, scheduleUpdate, scrollToSection]
    );

    return {
        panel,
        constructApiRef,
        apiRef,
        parseApi,
        scheduleUpdate,
        patchPanel,
        isLessonConstructEdit,
        handleClose,
        toggleToc,
        toggleBookmark,
        scrollToSection,
        completeAndNext,
        startQuiz,
        answerQuiz,
        startBlockQuiz,
        advanceBlockSession,
        backBlockSession,
        dismissBlockSession,
        startTheExam,
        resetExamAttempt,
        handleExamPass,
        persistExamPass,
        getLessonRenderData,
        lastRenderSectionRef,
        contentScrollSnapshotRef,
        pendingQuizScrollRef,
        pendingTocAttentionIdxRef,
        scrollTocOnRenderRef,
        lessonEditor,
        syncHeaderMetaChange,
        pickHeaderEmoji,
        handleLessonSave,
        contentAreaRef,
        editorRef,
        tocNavRef,
        tocScrollRef,
        applyTocRename,
        handleTocAdd,
        handleTocAddSub,
        handleTocRemove,
        handleTocMove,
        handleTocRenameStart,
        handleTocTickToggle,
        handleConstructSectionClick
    };
}
