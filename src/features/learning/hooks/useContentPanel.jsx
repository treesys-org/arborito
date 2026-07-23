import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLearningStore } from './useLearning.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { createLessonConstructApi } from '../../editor/api/content-lesson-construct/create-api.js';
import { isExamLesson } from '../api/exam-context.js';
import { getToc, getExpandedQuestionIdsForExam } from '../api/content-toc.js';
import { stopSpeaking } from '../api/read-aloud.js';
import { useLessonParse } from './useLessonParse.jsx';
import { confirmLeaveIfNeeded } from '../api/content-panel-modals.js';
import {
    hasActiveQuizInProgress,
    getQuizState,
    persistLessonReadingPosition,
    hasExamAttemptInProgress,
} from '../api/content-panel-quiz.js';
import { useLessonEditor } from '../../editor/index.js';
import {
    saveLessonDraft,
    lessonContentFingerprint,
} from '../../editor/api/logic/lesson-draft-persist.js';
import { clearSyncLessonDraftBody } from '../../editor/api/logic/lesson-sync-draft-body.js';
import { clearConstructEditorDomSeed } from '../../editor/api/logic/lesson-construct-capture.js';
import { createInitialPanelState } from './useContentPanel-state.js';
import { useContentPanelQuizActions } from './useContentPanelQuizActions.js';
import { useContentPanelNavigation } from './useContentPanelNavigation.js';
import { useContentPanelStoreSync } from './useContentPanelStoreSync.js';
import { useContentPanelRender } from './useContentPanelRender.js';
import { useContentPanelTocActions } from './useContentPanelTocActions.js';

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
    const lessonStoreFpRef = useRef(null);
    const lessonBoundSourceIdRef = useRef(store.value.activeSource?.id ?? '');
    const lessonEditTourLastFiredForRef = useRef(null);
    const recallAdvanceTimerRef = useRef(null);
    const renderBlocksRef = useRef([]);
    const constructApiRef = useRef(null);
    const scrollToSectionRef = useRef(null);
    const draftAutosaveTimerRef = useRef(null);
    const captureFullDraftBodyRef = useRef(() => null);
    const panelLiveRef = useRef(panel);
    panelLiveRef.current = panel;

    const draftSlice = useMemo(
        () => ({
            currentNode: panel.currentNode,
            lessonDraftLessonId: panel.lessonDraftLessonId,
            lessonBodyMarkdown: panel.lessonBodyMarkdown,
            lessonConstructDraft: panel.lessonConstructDraft,
            headerMetaDraft: panel.headerMetaDraft,
        }),
        [
            panel.currentNode,
            panel.lessonDraftLessonId,
            panel.lessonBodyMarkdown,
            panel.lessonConstructDraft,
            panel.headerMetaDraft,
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

    const cancelDraftAutosave = useCallback(() => {
        clearTimeout(draftAutosaveTimerRef.current);
        draftAutosaveTimerRef.current = null;
    }, []);

    const scheduleDraftAutosave = useCallback(() => {
        if (!isLessonConstructEdit()) return;
        cancelDraftAutosave();
        draftAutosaveTimerRef.current = setTimeout(() => {
            const live = panelLiveRef.current;
            if (live.lessonSaveState === 'saving') return;
            const ed = editorRef?.current;
            const domDirty = !!(ed && ed.dataset?.arboritoEditorDirty === '1');
            if (!live.lessonUserHasEdited && !domDirty) return;
            const node = live.currentNode;
            const sourceId = store.value.activeSource?.id;
            if (!node || !sourceId) return;
            const snap = captureFullDraftBodyRef.current?.();
            if (!snap || snap.bodyMarkdown == null) return;
            saveLessonDraft({
                sourceId,
                nodeId: node.id,
                bodyMarkdown: snap.bodyMarkdown,
                headerMetaDraft: snap.headerMetaDraft ?? live.headerMetaDraft,
                activeSectionIndex: live.activeSectionIndex,
                baseContentFp: lessonContentFingerprint(node.content),
                curriculumLang: store.getCurrentContentLangKey?.() || store.value.curriculumEditLang || store.value.lang
            });
            patchPanel({ lessonLocalDraftState: 'saved' });
        }, 1200);
    }, [isLessonConstructEdit, patchPanel, cancelDraftAutosave, editorRef]);

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
        return () => cancelDraftAutosave();
    }, [cancelDraftAutosave]);

    const isLessonDirty = useCallback(() => {
        if (!panel.currentNode || !isLessonConstructEdit()) return false;
        if (panel.lessonUserHasEdited) return true;
        const ed = lessonEditor.getEditorEl?.();
        return !!(ed && ed.dataset?.arboritoEditorDirty === '1');
    }, [panel.currentNode, panel.lessonUserHasEdited, isLessonConstructEdit, lessonEditor]);

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
                onDiscardLessonEdits: () => {
                    cancelDraftAutosave();
                    clearConstructEditorDomSeed(lessonEditor.getEditorEl?.());
                    clearSyncLessonDraftBody(panel.currentNode?.id);
                    patchPanel({
                        lessonBodyMarkdown: null,
                        lessonDraftLessonId: null,
                        lessonConstructDraft: false,
                        lessonUserHasEdited: false,
                        lessonLocalDraftState: 'none',
                        headerMetaDraft: null,
                        lessonHistoryStack: [],
                        lessonHistoryRedoStack: [],
                    });
                },
                getEditorEl: () => lessonEditor.getEditorEl?.() || null,
            },
            { saveLesson: () => constructApiRef.current?._saveLessonShell?.() }
        );
    }, [panel, isLessonConstructEdit, isLessonDirty, lessonEditor, patchPanel, cancelDraftAutosave]);

    const persistExamPass = useCallback(() => {
        if (!panel.currentNode || !isExamLesson(panel.currentNode)) return;
        store.markComplete(panel.currentNode.id, true);
        store.markExamExemptSiblingLeaves(panel.currentNode.id);
        store.checkForModuleCompletion(panel.currentNode.id);
    }, [panel.currentNode]);

    const buildConstructCtx = useCallback(() => {
        const ctx = {
            ...panel,
            lastRenderKey: lastRenderKeyRef.current,
            _lastRenderSection: lastRenderSectionRef.current,
            _contentScrollSnapshot: contentScrollSnapshotRef.current,
            _pendingTocAttentionIdx: pendingTocAttentionIdxRef.current,
            _scrollTocOnRender: scrollTocOnRenderRef.current,
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
            _getLessonBodyForToc: parseApi.getLessonBodyForToc,
            _getLessonParseModel: parseApi.getLessonParseModel,
            _invalidateLessonParseCache: parseApi.invalidateLessonParseCache,
            persistExamPass,
            _persistExamPass: persistExamPass,
            _cancelDraftAutosave: cancelDraftAutosave,
        };
        return ctx;
    }, [panel, scheduleUpdate, isLessonConstructEdit, isLessonDirty, parseApi, persistExamPass, lessonEditor.getEditorEl, confirmPanelLeaveIfNeeded, cancelDraftAutosave]);

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

    const { scrollToSection, completeAndNext } = useContentPanelNavigation({
        panel,
        patchPanel,
        parseApi,
        scheduleUpdate,
        isLessonConstructEdit,
        confirmPanelLeaveIfNeeded,
        panelLiveRef,
        constructApiRef,
        contentScrollSnapshotRef,
        scrollTocOnRenderRef,
        lastRenderKeyRef,
        pendingTocAttentionIdxRef,
        pendingQuizScrollRef,
        contentAreaRef,
        tocNavRef,
        scrollToSectionRef,
    });

    const quizActions = useContentPanelQuizActions({
        panel,
        patchPanel,
        parseApi,
        scheduleUpdate,
        contentAreaRef,
        isLessonConstructEdit,
        persistExamPass,
        recallAdvanceTimerRef,
        contentScrollSnapshotRef,
        lastRenderKeyRef,
        scrollTocOnRenderRef,
    });

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
        store.closeContent({ skipConfirm: true });
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

    useContentPanelStoreSync({
        panel,
        setPanel,
        patchPanel,
        parseApi,
        scheduleUpdate,
        cancelDraftAutosave,
        lessonEditor,
        constructApiRef,
        contentScrollSnapshotRef,
        lastRenderSectionRef,
        lastRenderKeyRef,
        lessonStoreFpRef,
        lessonBoundSourceIdRef,
        lessonEditTourLastFiredForRef,
        scrollTocOnRenderRef,
    });

    const apiRef = useRef({});

    const syncApiRef = useCallback(() => {
        const api = apiRef.current;
        api.scheduleUpdate = scheduleUpdate;
        api.currentNode = panel.currentNode;
        api.confirmLeaveIfNeeded = confirmPanelLeaveIfNeeded;
        api._isLessonDirty = isLessonDirty;
        api.captureLiveConstructBody = () => {
            if (!isLessonConstructEdit() || !panel.currentNode) return null;
            return constructApiRef.current?._captureLiveBodyMarkdown?.() ?? null;
        };
        api.activeSectionIndex = panel.activeSectionIndex;
        api.headerMetaDraft = panel.headerMetaDraft;
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
    }, [panel, scheduleUpdate, isLessonConstructEdit, isLessonDirty, confirmPanelLeaveIfNeeded]);

    syncApiRef();

    const { getLessonRenderData } = useContentPanelRender({
        panel,
        isLessonConstructEdit,
        parseApi,
        lastRenderKeyRef,
        renderBlocksRef,
    });

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

    const tocActions = useContentPanelTocActions({
        panel,
        patchPanel,
        scheduleUpdate,
        constructApiRef,
        contentAreaRef,
        scrollToSection,
        lastRenderKeyRef,
    });

    return {
        panel,
        constructApiRef,
        apiRef,
        parseApi,
        scheduleUpdate,
        patchPanel,
        isLessonConstructEdit,
        isLessonDirty,
        handleClose,
        toggleToc,
        toggleBookmark,
        scrollToSection,
        completeAndNext,
        startQuiz: quizActions.startQuiz,
        answerQuiz: quizActions.answerQuiz,
        startBlockQuiz: quizActions.startBlockQuiz,
        advanceBlockSession: quizActions.advanceBlockSession,
        backBlockSession: quizActions.backBlockSession,
        dismissBlockSession: quizActions.dismissBlockSession,
        startTheExam: quizActions.startTheExam,
        resetExamAttempt: quizActions.resetExamAttempt,
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
        applyTocRename: tocActions.applyTocRename,
        handleTocAdd: tocActions.handleTocAdd,
        handleTocAddSub: tocActions.handleTocAddSub,
        handleTocRemove: tocActions.handleTocRemove,
        handleTocMove: tocActions.handleTocMove,
        handleTocDragTo: tocActions.handleTocDragTo,
        handleTocRenameStart: tocActions.handleTocRenameStart,
        handleTocTickToggle: tocActions.handleTocTickToggle,
        handleConstructSectionClick: tocActions.handleConstructSectionClick,
    };
}
