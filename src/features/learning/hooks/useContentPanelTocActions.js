import { useCallback } from 'react';
import { useLearningStore } from './useLearning.js';
import { isExamLesson } from '../api/exam-context.js';
import { persistLessonReadingPosition } from '../api/content-panel-quiz.js';

export function useContentPanelTocActions({
    panel,
    patchPanel,
    scheduleUpdate,
    constructApiRef,
    contentAreaRef,
    scrollToSection,
    lastRenderKeyRef,
}) {
    const store = useLearningStore();

    const applyTocRename = useCallback((idx, title, sectionId) => {
        constructApiRef.current?._applyTocRename?.(idx, title, '', sectionId);
    }, [constructApiRef]);

    const handleTocMove = useCallback((idx, action) => {
        constructApiRef.current?._lessonTocMoveAt?.(idx, action);
    }, [constructApiRef]);

    const handleTocDragTo = useCallback((fromIdx, insertIndex, targetLevel) => {
        constructApiRef.current?._lessonTocDragTo?.(fromIdx, insertIndex, targetLevel);
    }, [constructApiRef]);

    const handleTocAdd = useCallback(() => {
        constructApiRef.current?._lessonTocAdd?.();
    }, [constructApiRef]);

    const handleTocAddSub = useCallback((idx, parentId) => {
        constructApiRef.current?._lessonTocAddSubAt?.(idx, parentId);
    }, [constructApiRef]);

    const handleTocRemove = useCallback((idx) => {
        constructApiRef.current?._lessonTocRemoveAt?.(idx);
    }, [constructApiRef]);

    const handleTocRenameStart = useCallback(
        (idx) => {
            patchPanel({ tocInlineEditIdx: idx });
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [patchPanel, scheduleUpdate, lastRenderKeyRef]
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
        [panel, patchPanel, scheduleUpdate, lastRenderKeyRef]
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
        [panel.activeSectionIndex, contentAreaRef, patchPanel, scheduleUpdate, scrollToSection, lastRenderKeyRef]
    );

    return {
        applyTocRename,
        handleTocMove,
        handleTocDragTo,
        handleTocAdd,
        handleTocAddSub,
        handleTocRemove,
        handleTocRenameStart,
        handleTocTickToggle,
        handleConstructSectionClick,
    };
}
