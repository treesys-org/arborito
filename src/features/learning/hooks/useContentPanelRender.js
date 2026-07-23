import { useCallback } from 'react';
import { useLearningStore } from './useLearning.js';
import { isExamLesson } from '../api/exam-context.js';
import {
    getFilteredToc,
    getActiveBlocks,
    computeLessonProgress,
    appendExamFinalTocItem,
    buildExamSectionOpts,
    getTocAccess,
} from '../api/content-toc.js';
import { getMediaConsentStateFingerprint } from '../../privacy-gdpr/api/third-party-media.js';
import {
    getQuizState,
    makeQuizStateGetter,
    sectionHasLiveBlockSession,
} from '../api/content-panel-quiz.js';
import { getExamQuizPresence } from '../api/quiz-status.js';
import { lessonDraftStateSig } from './useContentPanel-state.js';

export function useContentPanelRender({
    panel,
    isLessonConstructEdit,
    parseApi,
    lastRenderKeyRef,
    renderBlocksRef,
}) {
    const store = useLearningStore();

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

        const contentForParse = parseApi.getContentForTocParse();
        const isExam = isExamLesson(panel.currentNode);
        const { blocks: allBlocks, toc: rawToc, parsedForBlocks } = parseApi.getLessonParseModel(
            contentForParse,
            isExam
        );
        const toc = isExam
            ? constructEdit
                ? rawToc
                : appendExamFinalTocItem(rawToc, true)
            : rawToc;
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
        const liveQuizInSection = sectionHasLiveBlockSession(
            panel.blockSessions,
            panel.currentNode?.id,
            panel.activeSectionIndex
        );
        const getQuizStateForProgress = liveQuizInSection
            ? (id) => getQuizState(panel.quizStates, id)
            : makeQuizStateGetter(panel.quizStates, panel.quizPassRecord);
        const progress =
            toc.length > 0
                ? computeLessonProgress(
                      toc,
                      allBlocks,
                      panel.visitedSections,
                      getQuizStateForProgress,
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
        parseApi,
        lastRenderKeyRef,
        renderBlocksRef,
    ]);

    return { computeRenderKey, getLessonRenderData };
}
