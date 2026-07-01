import { getQuizRenderBlockFromContent } from '../api/quiz-status.js';
import { getQuizBlocksForSection } from '../api/content-toc.js';
import { getQuizState } from '../api/content-panel-quiz.js';
import { QuizChallenge, QuizSessionProgress, QuizSessionSummary } from './QuizChallenge.jsx';

/** Quiz footer for the active lesson section (student view). */
export function LessonQuiz({
    allBlocks,
    toc,
    activeSectionIndex,
    quizStates,
    quizSession,
    currentNode,
    isExam,
    constructEdit,
    quizActions,
    onViewCertificate
}) {
    if (constructEdit) return null;

    const sectionQuizzes = getQuizBlocksForSection(allBlocks, toc, activeSectionIndex);
    if (!sectionQuizzes.length) return null;

    const getState = (id) => getQuizState(quizStates, id);

    if (sectionQuizzes.length > 1) {
        if (quizSession?.finished) {
            return (
                <div className="arborito-lesson-quiz-footer mt-10 pt-2 border-t border-slate-200/80 dark:border-slate-700/60 not-prose">
                    <QuizSessionSummary
                        quizzes={sectionQuizzes}
                        quizStates={quizStates}
                        isExam={isExam}
                        quizSession={quizSession}
                        onViewCertificate={onViewCertificate}
                    />
                </div>
            );
        }
        const activeId =
            (quizSession && !quizSession.finished && quizSession.quizIds[quizSession.currentIndex]) ||
            (sectionQuizzes[0] && (sectionQuizzes[0].id || 'quiz'));
        const current = sectionQuizzes.find((q) => (q.id || 'quiz') === activeId) || sectionQuizzes[0];
        if (!current) return null;
        return (
            <div className="arborito-lesson-quiz-footer mt-10 pt-2 border-t border-slate-200/80 dark:border-slate-700/60 not-prose">
                <QuizSessionProgress quizzes={sectionQuizzes} quizSession={quizSession} />
                <QuizChallenge block={current} state={getState(activeId)} quizSession={quizSession} actions={quizActions} />
            </div>
        );
    }

    const footerQuizBlock = sectionQuizzes[0] || getQuizRenderBlockFromContent(currentNode?.content || '');
    if (!footerQuizBlock) return null;
    const blockId = footerQuizBlock.id || 'quiz';

    return (
        <div className="arborito-lesson-quiz-footer mt-10 pt-2 border-t border-slate-200/80 dark:border-slate-700/60 not-prose">
            <QuizChallenge block={footerQuizBlock} state={getState(blockId)} quizSession={quizSession} actions={quizActions} />
        </div>
    );
}
