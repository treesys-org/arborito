import { useLearning } from '../hooks/useLearning.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRegisterPanel } from '../../../app/hooks/useRegisterPanel.js';
import { linkPanelDom, unlinkPanelDom } from '../../../app/panel-refs.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { getPendingExternalMediaDetails, persistMediaOriginsConsent } from '../../privacy-gdpr/api/third-party-media.js';
import { hasGdprNetworkConsent } from '../../privacy-gdpr/api/network-consent.js';
import { isTocSectionCompleted, isExamFinalSectionIndex, buildExamSectionOpts } from '../api/content-toc.js';
import { getQuizState, getEffectiveQuizState } from '../api/content-panel-quiz.js';
import { expandAllQuizQuestions } from '../api/quiz-schema.js';
import { launchInlineGame } from '../api/content-panel-modals.js';
import { useContentPanel } from '../hooks/useContentPanel.jsx';
import { useContentEffects, useReadAloudState } from '../hooks/useContentEffects.jsx';
import { useQuizActions } from '../hooks/useQuizActions.jsx';
import { LessonToc } from './LessonToc.jsx';
import { LessonBody } from './LessonBody.jsx';
import { LessonExam } from './LessonExam.jsx';
import { LessonFooter } from './LessonFooter.jsx';
import { QuizSessionSummary } from './QuizChallenge.jsx';
import { LessonHeader } from './LessonHeader.jsx';
import { LessonMediaConsent } from './LessonMediaConsent.jsx';
import { LessonSyncHintBanner } from './LessonSyncHintBanner.jsx';
import { buildConstructEditorSeed } from '../../editor/index.js';
import { isElectronDesktop } from '../api/electron-bridge.js';
import {
    dismissLessonSyncHint,
    isLessonSyncHintDismissed,
    lessonHasMeaningfulProgress,
} from '../api/lesson-sync-hint-prefs.js';
import { shellUiActions } from '../../../stores/shell-ui-store-actions.js';

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
          ? String(ui.bookmarkTooltipElsewhere || 'Bookmark in «{section}». Tap to bookmark this section.').replace(
                /\{section\}/g,
                savedSectionTitle || String((lessonBookmark?.index ?? 0) + 1)
            )
          : String(ui.bookmarkTooltipAddSection || ui.bookmarkTooltipAdd || 'Bookmark section').replace(
                /\{section\}/g,
                currentSectionTitle || ui.lessonTopics || 'section'
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
        scheduleUpdate,
        startTheExam,
        resetExamAttempt,
        startBlockQuiz,
        advanceBlockSession,
        backBlockSession,
        dismissBlockSession,
        getLessonRenderData,
        handleClose,
        toggleBookmark,
        scrollToSection,
        completeAndNext,
        startQuiz,
        answerQuiz,
        handleExamPass,
        persistExamPass,
        isLessonConstructEdit,
        lessonEditor,
        syncHeaderMetaChange,
        pickHeaderEmoji,
        handleLessonSave,
        applyTocRename,
        handleTocAdd,
        handleTocAddSub,
        handleTocRemove,
        handleTocMove,
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
        isLessonConstructEdit,
        persistExamPass
    });

    const handleExportPdf = useCallback(() => {
        if (!panel.currentNode) return;
        setModal({ type: 'export-pdf', node: panel.currentNode });
    }, [panel.currentNode]);

    const handleAskSage = useCallback(() => {
        openSageModal({
            type: 'sage',
            mode: 'context',
            sageLessonContext: true,
        });
    }, [openSageModal]);

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

    const [syncHintDismissed, setSyncHintDismissed] = useState(() => isLessonSyncHintDismissed());
    const handleSyncHintCta = useCallback(() => {
        if (!shellUiActions.isSignedIn()) {
            setModal({ type: 'profile', focus: 'signin' });
        } else {
            shellUiActions.enableCloudSyncFromBanner();
        }
        dismissLessonSyncHint();
        setSyncHintDismissed(true);
    }, [setModal]);
    const handleSyncHintDismiss = useCallback(() => {
        dismissLessonSyncHint();
        setSyncHintDismissed(true);
    }, []);

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
        examPreStart,
        examShowResults,
        tocAccess,
        constructEdit,
        lessonHeaderTitleValue,
        lessonHeaderDescValue
    } = renderData;

    const showTocChrome = constructEdit ? true : toc.length > 1;
    const showProgressRow = !constructEdit && toc.length > 1;
    const examQuestionBlocks = isExam ? expandAllQuizQuestions(allBlocks) : [];
    const isOnExamFinal = isExam && isExamFinalSectionIndex(toc, panel.activeSectionIndex);
    const showStudentFooter =
        toc.length > 0 && !constructEdit && !onExamIntro && !isOnExamFinal;
    const showExamResults =
        isExam && panel.examShowResults && examQuestionBlocks.length > 0;
    const asideModeClass =
        `${isExam && panel.examStarted ? ' arborito-lesson-aside--exam-active' : ''}` +
        `${examPreStart ? ' arborito-lesson-aside--exam-prestart' : ''}`;
    const isDesktop = !shouldShowMobileUI();
    const { isBookmarkedHere, bookmarkElsewhere, bookmarkTooltip } = getBookmarkMeta(
        learning.getBookmark,
        node,
        panel.activeSectionIndex,
        toc,
        ui
    );

    const pendingMedia = getPendingExternalMediaDetails(allBlocks);
    const gdprAllowsLessonMedia = hasGdprNetworkConsent();
    const showMediaConsent =
        !constructEdit &&
        !gdprAllowsLessonMedia &&
        pendingMedia.length > 0 &&
        (panel.mediaDeclinedLessonId !== node.id || panel.mediaConsentForceOpen);

    const bodyMd = parseApi.getLessonBodyForToc();
    const constructEditorSeed = constructEdit
        ? buildConstructEditorSeed(node, panel, panel.activeSectionIndex)
        : null;
    const examSectionOpts = isExam
        ? buildExamSectionOpts({
              examStarted: panel.examStarted,
              examShowResults: panel.examShowResults,
          })
        : {};
    const isSectionCompleted = (idx) =>
        isTocSectionCompleted(idx, toc, allBlocks, panel.visitedSections, (id) =>
            getEffectiveQuizState(panel.quizStates, panel.quizPassRecord, id),
            examSectionOpts
        );

    const handleMediaAccept = () => {
        persistMediaOriginsConsent(
            pendingMedia.map((p) => p.origin),
            true
        );
        patchPanel({
            mediaConsentForceOpen: false,
            mediaConsentNonce: (panel.mediaConsentNonce || 0) + 1
        });
        scheduleUpdate(true);
    };

    const handleMediaDecline = () => {
        patchPanel({
            mediaDeclinedLessonId: node.id,
            mediaConsentForceOpen: false,
            mediaConsentNonce: (panel.mediaConsentNonce || 0) + 1
        });
        scheduleUpdate(true);
    };

    const handleMediaRetry = () => {
        const pending = getPendingExternalMediaDetails(allBlocks);
        if (pending.length) {
            persistMediaOriginsConsent(
                pending.map((p) => p.origin),
                true
            );
        }
        patchPanel({
            mediaDeclinedLessonId: null,
            mediaConsentForceOpen: false,
            mediaConsentNonce: (panel.mediaConsentNonce || 0) + 1
        });
        scheduleUpdate(true);
    };

    const cloudProgressOn = !!learning.userStore?.state?.cloudProgressSync;
    const hasLessonProgress = lessonHasMeaningfulProgress(panel.visitedSections, panel.quizStates, progress);
    const showSyncHint =
        !syncHintDismissed &&
        !isElectronDesktop() &&
        !constructEdit &&
        !cloudProgressOn &&
        hasLessonProgress;
    const guestMode = !shellUiActions.isSignedIn();

    return (
        <div ref={rootRef} data-arborito-panel="content" data-embed={embed ? '1' : undefined} className="w-full h-full">
            <div id="backdrop-overlay" className="fixed inset-0 z-[145] pointer-events-none arborito-lesson-mobile-scrim" aria-hidden="true" />

            <aside className={`${ASIDE_CLASSES}${constructEdit ? ' arborito-lesson-aside--construct-edit' : ''}${asideModeClass}`}>
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
                            aria-label={ui.lessonProgressAria || 'Lesson progress'}
                        >
                            <div className="arborito-lesson-progress-slim__fill" style={{ width: `${progress}%` }} />
                        </div>
                    </>
                ) : null}

                {showSyncHint ? (
                    <LessonSyncHintBanner
                        ui={ui}
                        guestMode={guestMode}
                        onCta={handleSyncHintCta}
                        onDismiss={handleSyncHintDismiss}
                    />
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
                        tocAccess={tocAccess}
                        examStarted={panel.examStarted}
                        examPreStart={examPreStart}
                        examShowResults={panel.examShowResults}
                        examSectionOpts={examSectionOpts}
                        quizStates={panel.quizStates}
                        onSectionClick={handleTocSectionClick}
                        onConstructSectionClick={handleConstructSectionClick}
                        onTocAdd={handleTocAdd}
                        onTocAddSub={handleTocAddSub}
                        onTocRemove={handleTocRemove}
                        onTocRenameStart={handleTocRenameStart}
                        onTocRenameCommit={applyTocRename}
                        onTocRenameCancel={() => patchPanel({ tocInlineEditIdx: null })}
                        onTocTickToggle={handleTocTickToggle}
                        onTocMove={handleTocMove}
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
                                activeSectionIndex={panel.activeSectionIndex}
                                activeBlocks={activeBlocks}
                                nodeId={node.id}
                                isExam={isExam}
                                examPlayable={isExam && panel.examStarted}
                                blockSessions={panel.blockSessions}
                                quizStates={panel.quizStates}
                                quizPassRecord={panel.quizPassRecord}
                                quizActions={quizActions}
                                onStartBlock={startBlockQuiz}
                                onAdvanceBlock={advanceBlockSession}
                                onBackBlock={backBlockSession}
                                onDismissBlockSession={dismissBlockSession}
                                onViewCertificate={handleExamPass}
                                onGameLaunch={handleGameLaunch}
                                quizAttentionNonce={panel.quizAttentionNonce}
                                topicCatalog={toc}
                                onMediaRetry={handleMediaRetry}
                            />
                            {showExamResults ? (
                                <div className="arborito-exam-results not-prose mt-8">
                                    <QuizSessionSummary
                                        quizzes={examQuestionBlocks}
                                        quizStates={panel.quizStates}
                                        isExam
                                        onViewCertificate={handleExamPass}
                                        onRetryExam={resetExamAttempt}
                                    />
                                </div>
                            ) : null}
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

                <LessonExam visible={onExamIntro} onStart={startTheExam} />
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
export { LessonExam } from './LessonExam.jsx';
export { useLessonParse } from '../hooks/useLessonParse.jsx';
