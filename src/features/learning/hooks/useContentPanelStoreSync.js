import { useCallback, useEffect } from 'react';
import { useLearningStore } from './useLearning.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { isExamLesson } from '../api/exam-context.js';
import { getToc, buildTocFromBlocks } from '../api/content-toc.js';
import { clearLessonMediaBlobCache } from '../api/lesson-local-media-store.js';
import { parseContent } from '../api/parser.js';
import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { prepareConstructOutlineBody } from '../api/lesson-toc-mutations.js';
import { lessonStoreFingerprint } from '../api/content-panel-modals.js';
import {
    hydrateQuizPassRecord,
    persistLessonReadingPosition,
} from '../api/content-panel-quiz.js';
import { resolveLessonOpenSection, clampSectionIndex } from '../api/resolve-lesson-open-section.js';
import { reapplyViewportDetection } from '../../../shared/ui/breakpoints.js';
import {
    loadLessonDraft,
    clearLessonDraft,
    draftMatchesSavedContent,
} from '../../editor/api/logic/lesson-draft-persist.js';
import {
    clearSyncLessonDraftBody,
    setSyncLessonDraftBody,
} from '../../editor/api/logic/lesson-sync-draft-body.js';
import { createInitialPanelState } from './useContentPanel-state.js';

export function useContentPanelStoreSync({
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
}) {
    const store = useLearningStore();

    const fireLessonEditTourEnter = useCallback((nodeId) => {
        if (nodeId == null || lessonEditTourLastFiredForRef.current === nodeId) return;
        lessonEditTourLastFiredForRef.current = nodeId;
        queueMicrotask(() => {
            reapplyViewportDetection();
            try {
                window.dispatchEvent(new CustomEvent('arborito-lesson-edit-enter'));
            } catch {
                /* ignore */
            }
        });
    }, [lessonEditTourLastFiredForRef]);

    const onStoreChange = useCallback(
        (detail) => {
            const newNode = detail.selectedNode;
            const newId = newNode ? newNode.id : null;
            const currentId = panel.currentNode ? panel.currentNode.id : null;
            const nextSourceId = detail.activeSource?.id ?? '';
            const sourceSwitched =
                !!newNode &&
                newId != null &&
                currentId === newId &&
                nextSourceId !== (lessonBoundSourceIdRef.current ?? '');

            if (newId !== currentId || sourceSwitched) {
                cancelDraftAutosave();
                contentScrollSnapshotRef.current = null;
                lastRenderSectionRef.current = null;
                parseApi.invalidateLessonParseCache();
                lessonStoreFpRef.current = null;
                clearLessonMediaBlobCache();
                clearSyncLessonDraftBody();
                if (newNode) {
                    lessonBoundSourceIdRef.current = nextSourceId;
                    let openHint = null;
                    const hint = store.value.lessonOpenHint;
                    const constructEdit =
                        !!store.value.constructionMode &&
                        !!fileSystem.features.canWrite &&
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
                        const draftLang =
                            store.getCurrentContentLangKey?.() ||
                            store.value.curriculumEditLang ||
                            store.value.lang;
                        const storedDraft =
                            sourceId != null ? loadLessonDraft(sourceId, newNode.id, draftLang) : null;
                        const restoreDraft =
                            storedDraft &&
                            draftMatchesSavedContent(storedDraft, newNode.content || '');
                        if (restoreDraft) {
                            const draftBody = prepareConstructOutlineBody(
                                storedDraft.bodyMarkdown || newNode.content || ''
                            );
                            const draftTocLen = getToc({ content: draftBody }).length || 1;
                            const clampedIdx = clampSectionIndex(
                                storedDraft.activeSectionIndex ?? 0,
                                draftTocLen
                            );
                            setSyncLessonDraftBody(newNode.id, draftBody);
                            setPanel({
                                ...createInitialPanelState(),
                                currentNode: newNode,
                                lessonBodyMarkdown: draftBody,
                                lessonDraftLessonId: newNode.id,
                                lessonConstructDraft: true,
                                headerMetaDraft: storedDraft.headerMetaDraft ?? null,
                                activeSectionIndex: clampedIdx,
                                lessonUserHasEdited: true,
                                lessonSaveState: 'idle',
                                lessonLocalDraftState: 'saved',
                                isTocVisible: false
                            });
                            fireLessonEditTourEnter(newNode.id);
                            queueMicrotask(() => {
                                store.notify(
                                    store.ui.editorDraftRestored ||
                                        'We restored a draft from this device.',
                                    false
                                );
                            });
                        } else {
                            if (sourceId != null) clearLessonDraft(sourceId, newNode.id, draftLang);
                            let openBody = '';
                            try {
                                const parsed = parseArboritoFile(newNode.content || '');
                                openBody = parsed.body || newNode.content || '';
                            } catch {
                                openBody = newNode.content || '';
                            }
                            const prepared = prepareConstructOutlineBody(openBody);
                            if (prepared !== openBody) {
                                setSyncLessonDraftBody(newNode.id, prepared);
                                setPanel({
                                    ...createInitialPanelState(),
                                    currentNode: newNode,
                                    lessonBodyMarkdown: prepared,
                                    lessonDraftLessonId: newNode.id,
                                    lessonConstructDraft: true,
                                    lessonUserHasEdited: true,
                                    lessonSaveState: 'idle',
                                    lessonLocalDraftState: 'saved',
                                    isTocVisible: false,
                                });
                            } else {
                                setPanel({
                                    ...createInitialPanelState(),
                                    currentNode: newNode,
                                    lessonSaveState: 'saved',
                                    isTocVisible: false
                                });
                            }
                            fireLessonEditTourEnter(newNode.id);
                        }
                    }
                } else {
                    lessonBoundSourceIdRef.current = '';
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
                const contentChanged =
                    String(newNode.content ?? '') !== String(panel.currentNode?.content ?? '');
                const ed = lessonEditor.getEditorEl?.();
                const editorDirty = ed?.dataset?.arboritoEditorDirty === '1';
                if (
                    contentChanged &&
                    (editorDirty || panel.lessonUserHasEdited || panel.lessonConstructDraft)
                ) {
                    const liveBody =
                        constructApiRef.current?._captureLiveBodyMarkdown?.() ??
                        panel.lessonBodyMarkdown;
                    if (liveBody != null) setSyncLessonDraftBody(newId, liveBody);
                    patchPanel({
                        currentNode: newNode,
                        headerMetaDraft: null,
                        ...(liveBody != null
                            ? {
                                  lessonBodyMarkdown: liveBody,
                                  lessonDraftLessonId: newId,
                                  lessonConstructDraft: true,
                                  lessonUserHasEdited: true
                              }
                            : {})
                    });
                    lastRenderKeyRef.current = null;
                    scheduleUpdate(true);
                    return;
                }
                const keepHeader =
                    !contentChanged &&
                    (panel.lessonUserHasEdited ||
                        panel.lessonConstructDraft ||
                        (panel.headerMetaDraft && panel.headerMetaDraft.nodeId === newId));
                const bodyForToc = contentChanged
                    ? newNode.content || ''
                    : panel.lessonBodyMarkdown || newNode.content || '';
                const tocLen = getToc({ content: bodyForToc }).length || 1;
                const clampedIdx = clampSectionIndex(
                    contentChanged ? 0 : panel.activeSectionIndex,
                    tocLen
                );
                if (contentChanged) clearSyncLessonDraftBody(newId);
                patchPanel({
                    currentNode: newNode,
                    activeSectionIndex: clampedIdx,
                    ...(contentChanged
                        ? {
                              lessonBodyMarkdown: null,
                              lessonConstructDraft: false,
                              lessonHistoryStack: [],
                              lessonHistoryRedoStack: [],
                              lessonUserHasEdited: false,
                              lessonLocalDraftState: 'none',
                              headerMetaDraft: null
                          }
                        : keepHeader
                          ? {}
                          : { headerMetaDraft: null })
                });
                lastRenderKeyRef.current = null;
                scheduleUpdate(true);
            }
            const fp = lessonStoreFingerprint(panel.currentNode, detail);
            if (fp && fp === lessonStoreFpRef.current) return;
            lessonStoreFpRef.current = fp;
            scheduleUpdate();
        },
        [panel.currentNode, panel.lessonUserHasEdited, panel.lessonConstructDraft, panel.lessonBodyMarkdown, panel.activeSectionIndex, panel.headerMetaDraft, parseApi, patchPanel, scheduleUpdate, fireLessonEditTourEnter, lessonEditor, cancelDraftAutosave, setPanel, constructApiRef, contentScrollSnapshotRef, lastRenderSectionRef, lastRenderKeyRef, lessonStoreFpRef, lessonBoundSourceIdRef, lessonEditTourLastFiredForRef, scrollTocOnRenderRef]
    );

    useEffect(() => {
        onStoreChange(store.value);
        const handler = (ev) => onStoreChange(ev.detail);
        store.addEventListener('state-change', handler);
        return () => store.removeEventListener('state-change', handler);
    }, [onStoreChange]);

    return { fireLessonEditTourEnter };
}
