import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLearningStore } from './useLearning.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { createLessonConstructApi } from '../../editor/api/content-lesson-construct/create-api.js';
import { isExamLesson } from '../api/exam-context.js';
import {
    getToc,
    getFilteredToc,
    findFirstQuizSectionIndex,
    getActiveBlocks,
    computeLessonProgress,
    isTocSectionCompleted,
    getQuizBlocksForSection
} from '../api/content-toc.js';
import { stopSpeaking } from '../api/read-aloud.js';
import { useLessonParse } from './useLessonParse.jsx';
import { confirmLeaveIfNeeded, lessonStoreFingerprint } from '../api/content-panel-modals.js';
import {
    hasActiveQuizInProgress,
    getQuizState,
    syncQuizSessionForSection,
    getQuizBlockById,
    buildStartQuizState,
    buildAnswerQuizPatch,
    evaluateQuizSession,
    RECALL_ADVANCE_DELAY_MS
} from '../api/content-panel-quiz.js';
import { renameTocSection } from '../api/lesson-toc-mutations.js';
import { useLessonEditor } from '../../editor/index.js';
import {
    saveLessonDraft,
    loadLessonDraft,
    clearLessonDraft,
    draftMatchesSavedContent,
    lessonContentFingerprint
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
        visitedSections: new Set(),
        tocFilter: '',
        quizStates: {},
        quizSession: null,
        lessonDraftLessonId: null,
        lessonBodyMarkdown: null,
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
    const scrollTocOnRenderRef = useRef(false);
    const skipLessonDraftDomCaptureRef = useRef(false);
    const lessonStoreFpRef = useRef(null);
    const lessonEditTourLastFiredForRef = useRef(null);
    const recallAdvanceTimerRef = useRef(null);
    const renderBlocksRef = useRef([]);
    const constructApiRef = useRef(null);
    const scrollToSectionRef = useRef(null);
    const advanceQuizSessionRef = useRef(null);
    const draftAutosaveTimerRef = useRef(null);
    const captureFullDraftBodyRef = useRef(() => null);

    const draftSlice = useMemo(
        () => ({
            currentNode: panel.currentNode,
            lessonDraftLessonId: panel.lessonDraftLessonId,
            lessonBodyMarkdown: panel.lessonBodyMarkdown,
            headerMetaDraft: panel.headerMetaDraft
        }),
        [
            panel.currentNode,
            panel.lessonDraftLessonId,
            panel.lessonBodyMarkdown,
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
                    hasActiveQuizInProgress({ ...panel, isLessonConstructEdit })
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
        async (idx) => {
            if (panel.currentNode && isExamLesson(panel.currentNode) && !panel.examStarted) {
                const contentForParse = parseApi.getContentForTocParse();
                const { blocks, toc } = parseApi.getLessonParseModel(contentForParse, true);
                const quizIdx = findFirstQuizSectionIndex(blocks, toc);
                if (quizIdx >= 0 && idx >= quizIdx) return;
            }
            if (
                idx !== panel.activeSectionIndex &&
                hasActiveQuizInProgress({ ...panel, isLessonConstructEdit })
            ) {
                const ok = await confirmPanelLeaveIfNeeded();
                if (!ok) return;
            }
            const construct = isLessonConstructEdit();
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
                store.recordRecentLesson(panel.currentNode.id, idx, panel.visitedSections);
            }
            if (switchingSection) skipLessonDraftDomCaptureRef.current = true;
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [panel, parseApi, isLessonConstructEdit, patchPanel, scheduleUpdate, confirmPanelLeaveIfNeeded]
    );

    scrollToSectionRef.current = scrollToSection;

    const startTheExam = useCallback(() => {
        if (!panel.currentNode) return;
        const contentForParse = parseApi.getContentForTocParse();
        const { blocks, toc } = parseApi.getLessonParseModel(contentForParse, true);
        const quizIdx = findFirstQuizSectionIndex(blocks, toc);
        if (quizIdx >= 0) {
            patchPanel({ examStarted: true, quizSession: null });
            scrollToSectionRef.current?.(quizIdx);
        }
    }, [panel.currentNode, parseApi, patchPanel]);

    const handleExamPass = useCallback(() => {
        const n = panel.currentNode;
        if (!n) return;
        if (isExamLesson(n) && n.content) {
            const { blocks } = parseApi.getLessonParseModel(n.content, true);
            const quizBlocks = blocks.filter((b) => b.type === 'quiz');
            if (quizBlocks.length) {
                const correct = quizBlocks.filter(
                    (b) => !!getQuizState(panel.quizStates, b.id || 'quiz').correct
                ).length;
                if (correct / quizBlocks.length >= 0.8) persistExamPass();
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
            store.recordRecentLesson(
                panel.currentNode.id,
                panel.activeSectionIndex,
                panel.visitedSections
            );
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

    /* Quiz session must stay aligned with the active section — but syncing via
     * patchPanel inside getLessonRenderData() was a setState-during-render loop
     * ("Too many re-renders" in <Content>). */
    useEffect(() => {
        if (!panel.currentNode) return;
        const contentForParse = parseApi.getContentForTocParse();
        const isExam = isExamLesson(panel.currentNode);
        const { blocks: allBlocks, toc } = parseApi.getLessonParseModel(contentForParse, isExam);
        const sync = syncQuizSessionForSection(
            { ...panel, quizSession: panel.quizSession },
            allBlocks,
            toc
        );
        if (sync.session !== panel.quizSession) {
            patchPanel({ quizSession: sync.session });
        } else if (sync.autoStartId) {
            startQuiz(sync.autoStartId);
        }
    }, [
        panel.currentNode,
        panel.activeSectionIndex,
        panel.quizSession,
        panel.quizStates,
        panel.lessonDraftNonce,
        panel.lessonBodyMarkdown,
        parseApi,
        patchPanel,
        startQuiz
    ]);

    const advanceQuizSession = useCallback(() => {
        const session = panel.quizSession;
        const key = `${panel.currentNode?.id ?? ''}:${panel.activeSectionIndex}`;
        if (!session || session.key !== key) return;
        const next = { ...session, awaitingAdvance: false };
        const nextIdx = session.currentIndex + 1;
        if (nextIdx < session.quizIds.length) {
            next.currentIndex = nextIdx;
            patchPanel({ quizSession: next });
            startQuiz(session.quizIds[nextIdx]);
            return;
        }
        next.finished = true;
        const evalPatch = evaluateQuizSession(
            { ...panel, quizSession: next, persistExamPass },
            next
        );
        patchPanel({ quizSession: next, ...evalPatch });
        lastRenderKeyRef.current = null;
        scheduleUpdate(true);
    }, [panel, patchPanel, startQuiz, persistExamPass, scheduleUpdate]);

    advanceQuizSessionRef.current = advanceQuizSession;

    const answerQuiz = useCallback(
        (id, isCorrect) => {
            contentScrollSnapshotRef.current = contentAreaRef?.current?.scrollTop ?? 0;
            const patch = buildAnswerQuizPatch(
                { ...panel, isLessonConstructEdit, persistExamPass },
                id,
                isCorrect
            );
            if (patch.scheduleRecallAdvance) {
                if (recallAdvanceTimerRef.current) clearTimeout(recallAdvanceTimerRef.current);
                recallAdvanceTimerRef.current = setTimeout(() => {
                    recallAdvanceTimerRef.current = null;
                    advanceQuizSessionRef.current?.();
                }, RECALL_ADVANCE_DELAY_MS);
                delete patch.scheduleRecallAdvance;
            }
            patchPanel(patch);
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [panel, isLessonConstructEdit, persistExamPass, patchPanel, contentAreaRef, scheduleUpdate]
    );

    const completeAndNext = useCallback(() => {
        if (!panel.currentNode) return;
        const contentForParse = parseApi.getContentForTocParse();
        const isExam = isExamLesson(panel.currentNode);
        const { blocks: allBlocks, toc } = parseApi.getLessonParseModel(contentForParse, isExam);
        const idx = panel.activeSectionIndex;
        const item = toc[idx];
        const quizzes = getQuizBlocksForSection(allBlocks, toc, idx);
        if (item?.isQuiz && quizzes.length > 0) {
            const quizPassed = quizzes.every((q) => {
                const st = getQuizState(panel.quizStates, q.id || 'quiz-meta');
                return !!(st && st.finished && st.correct);
            });
            if (!quizPassed) {
                store.notify(
                    store.ui.lessonQuizRequired || 'Answer the quiz correctly before continuing.',
                    true
                );
                return;
            }
        }
        const visited = new Set(panel.visitedSections);
        visited.add(idx);
        patchPanel({ visitedSections: visited });
        if (idx < toc.length - 1) {
            scrollToSection(idx + 1);
            return;
        }
        const allDone = toc.every((_, i) =>
            isTocSectionCompleted(i, toc, allBlocks, visited, (id) => getQuizState(panel.quizStates, id))
        );
        if (!allDone) {
            store.notify(
                store.ui.lessonSectionsIncomplete ||
                    'Mark every section of the outline before completing the lesson.',
                true
            );
            return;
        }
        if (!store.isCompleted(panel.currentNode.id)) {
            store.markComplete(panel.currentNode.id, true);
            store.checkForModuleCompletion(panel.currentNode.id);
        }
        store.closeContent();
    }, [panel, parseApi, patchPanel, scrollToSection]);

    const applyTocRename = useCallback(
        (idx, title) => {
            if (!isLessonConstructEdit()) return;
            constructApiRef.current._captureLessonDraftFromDom?.();
            const body = parseApi.getLessonBodyForToc();
            const next = renameTocSection(body, idx, title, '');
            patchPanel({
                lessonBodyMarkdown: next,
                lessonDraftLessonId: panel.currentNode.id,
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

    const onStoreChange = useCallback(
        (detail) => {
            const newNode = detail.selectedNode;
            const newId = newNode ? newNode.id : null;
            const currentId = panel.currentNode ? panel.currentNode.id : null;

            if (newId !== currentId) {
                parseApi.invalidateLessonParseCache();
                lessonStoreFpRef.current = null;
                if (newNode) {
                    let resume = null;
                    const hint = store.value.lessonOpenHint;
                    const constructEdit =
                        store.value.constructionMode &&
                        (newNode.type === 'leaf' || newNode.type === 'exam');
                    if (hint && typeof hint.index === 'number') {
                        resume = hint;
                        store.update({ lessonOpenHint: null });
                    } else if (hint) {
                        store.update({ lessonOpenHint: null });
                    }
                    if (!constructEdit) {
                        if (!resume) resume = store.getRecentLessonPosition(newNode.id);
                        const visited = new Set(resume?.visited || []);
                        setPanel({
                            ...createInitialPanelState(),
                            currentNode: newNode,
                            activeSectionIndex: resume?.index || 0,
                            visitedSections: visited,
                            isTocVisible: false
                        });
                        store.recordRecentLesson(newNode.id, resume?.index || 0, visited);
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
                                headerMetaDraft: storedDraft.headerMetaDraft ?? null,
                                activeSectionIndex: storedDraft.activeSectionIndex ?? 0,
                                lessonUserHasEdited: true,
                                lessonSaveState: 'idle',
                                lessonLocalDraftState: 'saved',
                                isTocVisible: false
                            });
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
        [panel.currentNode, parseApi, patchPanel, scheduleUpdate]
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
            mediaNonce: panel.mediaConsentNonce
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
        const { blocks: allBlocks, toc, parsedForBlocks } = parseApi.getLessonParseModel(
            contentForParse,
            isExam
        );
        const filteredToc = getFilteredToc(toc, panel.tocFilter);
        renderBlocksRef.current = allBlocks;

        const activeBlocks = getActiveBlocks(allBlocks, toc, panel.activeSectionIndex);
        const quizSectionIndex = isExam ? findFirstQuizSectionIndex(allBlocks, toc) : -1;
        const onExamIntro =
            isExam &&
            quizSectionIndex > -1 &&
            panel.activeSectionIndex < quizSectionIndex &&
            !constructEdit;

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

        const progress =
            toc.length > 0
                ? computeLessonProgress(toc, allBlocks, panel.visitedSections, (id) =>
                      getQuizState(panel.quizStates, id)
                  )
                : 0;

        return {
            allBlocks,
            toc,
            filteredToc,
            activeBlocks,
            progress,
            isExam,
            onExamIntro,
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

    const [tocDropTarget, setTocDropTarget] = useState(null);

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
                store.recordRecentLesson(panel.currentNode.id, panel.activeSectionIndex, visited);
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
        advanceQuizSession,
        startTheExam,
        handleExamPass,
        persistExamPass,
        getLessonRenderData,
        lastRenderSectionRef,
        contentScrollSnapshotRef,
        lessonEditor,
        syncHeaderMetaChange,
        pickHeaderEmoji,
        handleLessonSave,
        contentAreaRef,
        editorRef,
        tocNavRef,
        tocScrollRef,
        tocDropTarget,
        setTocDropTarget,
        applyTocRename,
        handleTocAdd,
        handleTocAddSub,
        handleTocRemove,
        handleTocRenameStart,
        handleTocTickToggle,
        handleConstructSectionClick
    };
}
