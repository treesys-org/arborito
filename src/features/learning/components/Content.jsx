import { useLearning } from '../hooks/useLearning.js';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useRegisterPanel } from '../../../app/hooks/useRegisterPanel.js';
import { linkPanelDom, unlinkPanelDom } from '../../../app/panel-refs.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { getPendingExternalMediaDetails, persistMediaOriginsConsent } from '../../privacy-gdpr/api/third-party-media.js';
import { isTocSectionCompleted } from '../api/content-toc.js';
import { getQuizState } from '../api/content-panel-quiz.js';
import { launchInlineGame } from '../api/content-panel-modals.js';
import { useContentPanel } from '../hooks/useContentPanel.jsx';
import { useContentEffects, useReadAloudState } from '../hooks/useContentEffects.jsx';
import { useQuizActions } from '../hooks/useQuizActions.jsx';
import { LessonToc } from './LessonToc.jsx';
import { LessonBody } from './LessonBody.jsx';
import { LessonExam } from './LessonExam.jsx';
import { LessonFooter } from './LessonFooter.jsx';
import { LessonHeader } from './LessonHeader.jsx';
import { LessonMediaConsent } from './LessonMediaConsent.jsx';
import { buildConstructEditorSeed } from '../../editor/index.js';

const ASIDE_CLASSES = [
    'arborito-lesson-aside',
    'fixed',
    'flex',
    'flex-col',
    'z-[150]',
    'transition-all',
    'duration-500',
    'ease-[cubic-bezier(0.25,0.8,0.25,1)]',
    'border-l',
    'border-transparent',
    'no-print',
    'right-0',
    'w-full',
    'max-w-full',
    'arborito-lesson-sheet',
    'top-0',
    'bottom-0',
    'left-0',
    'right-0',
    'h-[100dvh]',
    'max-h-[100dvh]',
    'min-h-0',
    'rounded-none',
    'bg-[#f8fafc]',
    'dark:bg-[#0c1222]',
    'transform',
    'translate-x-0'
].join(' ');

function getBookmarkMeta(getBookmark, node, activeSectionIndex, toc, ui) {
    const lessonBookmark = node ? getBookmark(node.id, node.content) : null;
    const currentSectionTitle = String(toc[activeSectionIndex]?.text || '').trim();
    const isBookmarkedHere = !!(lessonBookmark && lessonBookmark.index === activeSectionIndex);
    const bookmarkElsewhere = !!(lessonBookmark && lessonBookmark.index !== activeSectionIndex);
    const savedSectionTitle = String(
        lessonBookmark?.sectionTitle || toc[lessonBookmark?.index]?.text || ''
    ).trim();
    const bookmarkTooltip = isBookmarkedHere
        ? ui.bookmarkTooltipRemove || ui.bookmarkDeleteTitle
        : bookmarkElsewhere
          ? String(ui.bookmarkTooltipElsewhere || 'Marcador en «{section}». Toca para marcar esta sección.').replace(
                /\{section\}/g,
                savedSectionTitle || String((lessonBookmark?.index ?? 0) + 1)
            )
          : String(ui.bookmarkTooltipAddSection || ui.bookmarkTooltipAdd || 'Marcar sección').replace(
                /\{section\}/g,
                currentSectionTitle || ui.lessonTopics || 'sección'
            );
    return { isBookmarkedHere, bookmarkElsewhere, bookmarkTooltip };
}

export function Content({ embed }) {
    const learning = useLearning();
    const { ui, setModal, openSageModal } = learning;

    const rootRef = useRef(null);
    const proseFrameRef = useRef(null);
    const contentAreaRef = useRef(null);
    const editorRef = useRef(null);
    const tocNavRef = useRef(null);
    const tocScrollRef = useRef(null);
const panelApi = useContentPanel({
        rootRef,
        contentAreaRef,
        editorRef,
        tocNavRef,
        tocScrollRef
    });
    const {
        panel,
        apiRef,
        parseApi,
        patchPanel,
        toggleToc,
        startTheExam,
        getLessonRenderData,
        handleClose,
        toggleBookmark,
        scrollToSection,
        completeAndNext,
        startQuiz,
        answerQuiz,
        advanceQuizSession,
        handleExamPass,
        persistExamPass,
        isLessonConstructEdit,
        lessonEditor,
        syncHeaderMetaChange,
        pickHeaderEmoji,
        handleLessonSave,
        tocDropTarget,
        applyTocRename,
        handleTocAdd,
        handleTocAddSub,
        handleTocRemove,
        handleTocRenameStart,
        handleTocTickToggle,
        handleConstructSectionClick
    } = panelApi;

    const { speaking, toggleRead } = useReadAloudState(proseFrameRef);

    const quizActions = useQuizActions({
        panel,
        patchPanel,
        startQuiz,
        answerQuiz,
        advanceQuizSession,
        isLessonConstructEdit,
        persistExamPass
    });

    const handleExportPdf = useCallback(() => {
        if (!panel.currentNode) return;
        setModal({ type: 'export-pdf', node: panel.currentNode });
    }, [panel.currentNode]);

    const handleAskSage = useCallback(() => {
        openSageModal({ type: 'sage', mode: 'context', sageLessonContext: true });
    }, []);

    const handleGameLaunch = useCallback(
        (url, title, topics) => {
            launchInlineGame({ currentNode: panel.currentNode }, url, title, topics);
        },
        [panel.currentNode]
    );

    const handleTocSectionClick = useCallback(
        (idx) => {
            scrollToSection(idx);
            patchPanel({ isTocVisible: false });
        },
        [scrollToSection, patchPanel]
    );

    const handlePrevSection = useCallback(() => {
        scrollToSection(Math.max(0, panel.activeSectionIndex - 1));
    }, [scrollToSection, panel.activeSectionIndex]);

    useRegisterPanel('content', () => apiRef.current);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return undefined;
        linkPanelDom(root, apiRef.current);
        return () => unlinkPanelDom(root);
    }, [apiRef]);

    const effectsCtx = useMemo(
        () => ({
            ...panelApi,
            lastRenderKeyRef: apiRef
        }),
        [panelApi, apiRef]
    );

    useContentEffects(rootRef, effectsCtx);

    const renderData = getLessonRenderData();
    
    if (!panel.currentNode || renderData.empty) {
        return (
            <div
                ref={rootRef}
                data-arborito-panel="content"
                data-embed={embed ? '1' : undefined}
                className="w-full h-full"
            />
        );
    }

    const node = panel.currentNode;
    const {
        allBlocks,
        toc,
        filteredToc,
        activeBlocks,
        progress,
        isExam,
        onExamIntro,
        constructEdit,
        lessonHeaderTitleValue,
        lessonHeaderDescValue
    } = renderData;

    const showTocChrome = constructEdit ? true : isExam ? panel.examStarted && toc.length > 0 : toc.length > 1;
    const showProgressRow = !constructEdit && toc.length > 1;
    const showStudentFooter = toc.length > 0 && !constructEdit && !(isExam && onExamIntro);
    const isDesktop = !shouldShowMobileUI();
    const { isBookmarkedHere, bookmarkElsewhere, bookmarkTooltip } = getBookmarkMeta(
        learning.getBookmark,
        node,
        panel.activeSectionIndex,
        toc,
        ui
    );

    const quizSessionKey = `${node.id ?? ''}:${panel.activeSectionIndex}`;
    const quizSession =
        panel.quizSession && panel.quizSession.key === quizSessionKey ? panel.quizSession : null;

    const pendingMedia = getPendingExternalMediaDetails(allBlocks);
    const showMediaConsent =
        !constructEdit &&
        pendingMedia.length > 0 &&
        panel.mediaDeclinedLessonId !== node.id;

    const bodyMd = parseApi.getLessonBodyForToc();
    const constructEditorSeed = constructEdit
        ? buildConstructEditorSeed(node, panel, panel.activeSectionIndex)
        : null;
    const isSectionCompleted = (idx) =>
        isTocSectionCompleted(idx, toc, allBlocks, panel.visitedSections, (id) => getQuizState(panel.quizStates, id));

    const handleMediaAccept = () => {
        persistMediaOriginsConsent(
            pendingMedia.map((p) => p.origin),
            true
        );
        patchPanel({ mediaConsentNonce: panel.mediaConsentNonce + 1 });
    };

    const handleMediaDecline = () => {
        patchPanel({ mediaDeclinedLessonId: node.id, mediaConsentNonce: panel.mediaConsentNonce + 1 });
    };

    return (
        <div ref={rootRef} data-arborito-panel="content" data-embed={embed ? '1' : undefined} className="w-full h-full">
            <div id="backdrop-overlay" className="fixed inset-0 z-[145] pointer-events-none arborito-lesson-mobile-scrim" aria-hidden="true" />

            <aside className={`${ASIDE_CLASSES}${constructEdit ? ' arborito-lesson-aside--construct-edit' : ''}`}>
                <LessonHeader
                    node={node}
                    constructEdit={constructEdit}
                    isExam={isExam}
                    isTocVisible={panel.isTocVisible}
                    showTocChrome={showTocChrome}
                    lessonHeaderTitleValue={lessonHeaderTitleValue}
                    lessonHeaderDescValue={lessonHeaderDescValue}
                    careFeedbackMsg={panel.careFeedbackMsg}
                    isBookmarkedHere={isBookmarkedHere}
                    bookmarkElsewhere={bookmarkElsewhere}
                    bookmarkTooltip={bookmarkTooltip}
                    isSpeaking={speaking}
                    onClose={handleClose}
                    onToggleToc={toggleToc}
                    onToggleBookmark={toggleBookmark}
                    onExportPdf={handleExportPdf}
                    onAskSage={handleAskSage}
                    onReadSection={toggleRead}
                    onHeaderMetaChange={syncHeaderMetaChange}
                    onHeaderEmojiPick={pickHeaderEmoji}
                    toolbarHandlers={lessonEditor.toolbarHandlers}
                    onSave={handleLessonSave}
                    lessonSaveState={panel.lessonSaveState}
                    lessonUserHasEdited={panel.lessonUserHasEdited}
                />

                {showProgressRow ? (
                    <>
                        {isDesktop ? (
                            <div className="relative z-20 flex items-center justify-between px-4 pt-1">
                                <span className="arborito-eyebrow">{ui.lessonProgress}</span>
                                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">{progress}%</span>
                            </div>
                        ) : null}
                        <div
                            className="arborito-lesson-progress-slim relative z-20"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progress}
                            aria-label={ui.lessonProgressAria || 'Progreso de la lección'}
                        >
                            <div className="arborito-lesson-progress-slim__fill" style={{ width: `${progress}%` }} />
                        </div>
                    </>
                ) : null}

                <div className="arborito-lesson-mobile-body flex-1 min-h-0 relative z-10">
                    <LessonToc
                        visible={panel.isTocVisible}
                        constructEdit={constructEdit}
                        tocFilter={panel.tocFilter}
                        onFilterChange={(v) => patchPanel({ tocFilter: v })}
                        onBackdropClick={toggleToc}
                        showTocChrome={showTocChrome}
                        toc={toc}
                        filteredToc={filteredToc}
                        activeSectionIndex={panel.activeSectionIndex}
                        visitedSections={panel.visitedSections}
                        allBlocks={allBlocks}
                        bodyMd={bodyMd}
                        tocInlineEditIdx={panel.tocInlineEditIdx}
                        isSectionCompleted={isSectionCompleted}
                        onSectionClick={handleTocSectionClick}
                        onConstructSectionClick={handleConstructSectionClick}
                        onTocAdd={handleTocAdd}
                        onTocAddSub={handleTocAddSub}
                        onTocRemove={handleTocRemove}
                        onTocRenameStart={handleTocRenameStart}
                        onTocRenameCommit={applyTocRename}
                        onTocRenameCancel={() => patchPanel({ tocInlineEditIdx: null })}
                        onTocTickToggle={handleTocTickToggle}
                        tocDropTarget={tocDropTarget}
                        tocNavRef={tocNavRef}
                        tocScrollRef={tocScrollRef}
                    />

                    <div
                        ref={contentAreaRef}
                        id="content-area"
                        className="flex-1 overflow-y-auto custom-scrollbar px-4 pt-4 pb-6 min-h-0"
                    >
                        <div
                            ref={proseFrameRef}
                            className={`${constructEdit ? 'w-full relative arborito-lesson-prose-frame--construct pb-8' : 'max-w-3xl mx-auto w-full relative pb-24'} arborito-lesson-prose-frame`}
                        >
                            <LessonBody
                                editorRef={editorRef}
                                constructEdit={constructEdit}
                                constructSectionMd={constructEditorSeed?.sectionMd}
                                constructExtraHtml={constructEditorSeed?.extraHtml}
                                activeBlocks={activeBlocks}
                                allBlocks={allBlocks}
                                toc={toc}
                                activeSectionIndex={panel.activeSectionIndex}
                                quizStates={panel.quizStates}
                                quizSession={quizSession}
                                currentNode={node}
                                isExam={isExam}
                                quizActions={quizActions}
                                onViewCertificate={handleExamPass}
                                onGameLaunch={handleGameLaunch}
                            />
                        </div>
                    </div>
                </div>

                {showStudentFooter ? (
                    <LessonFooter
                        activeSectionIndex={panel.activeSectionIndex}
                        tocLength={toc.length}
                        onExit={handleClose}
                        onPrev={handlePrevSection}
                        onComplete={completeAndNext}
                    />
                ) : null}

                <LessonExam visible={onExamIntro && !constructEdit} onStart={startTheExam} />
            </aside>

            {showMediaConsent ? (
                <LessonMediaConsent pending={pendingMedia} onAccept={handleMediaAccept} onDecline={handleMediaDecline} />
            ) : null}
        </div>
    );
}

export default Content;

export { LessonBody } from './LessonBody.jsx';
export { LessonToc } from './LessonToc.jsx';
export { LessonQuiz } from './LessonQuiz.jsx';
export { LessonExam } from './LessonExam.jsx';
export { useLessonParse } from '../hooks/useLessonParse.jsx';
