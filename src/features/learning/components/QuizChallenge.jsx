import { useLearning } from '../hooks/useLearning.js';
import { useMemo, useState } from 'react';
import {
    QUIZ_MODE_CLOZE,
    QUIZ_MODE_MULTIPLE,
    QUIZ_MODE_RECALL,
    QUIZ_MODE_CHIPS,
    QUIZ_MODE_STEPS,
    pickStudyQuizMode,
    tokenizeQuizAnswerChips,
    challengeForPlay,
} from '../api/quiz-schema.js';
import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { buildQuizMultipleOptions, filterQuizTraps } from '../api/quiz-trap-filter.js';

function orderingChipsPrompt(mainQuestion) {
    const mq = String(mainQuestion || '').trim();
    if (!mq) return '';
    const lang = String(store.value.lang || 'ES').toUpperCase();
    return lang === 'EN'
        ? `Order the words to answer: ${mq}`
        : `Ordena las palabras para responder: ${mq}`;
}

function shuffleOptions(seed, options) {
    const arr = [...options];
    let h = 0;
    const s = String(seed || 'quiz');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    for (let i = arr.length - 1; i > 0; i--) {
        h = (h * 1103515245 + 12345) | 0;
        const j = Math.abs(h) % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function challengeFromBlock(b) {
    const c = challengeForPlay({
        core_concept: b.core_concept,
        short_definition: b.short_definition,
        main_question: b.main_question,
        correct_answer: b.correct_answer,
        traps: b.traps,
        cloze_indices: b.cloze_indices,
        answer_mode: b.answer_mode,
        steps: b.steps,
        modes: b.modes,
        skip_multiple: b.skip_multiple,
        skip_ordering: b.skip_ordering
    });
    c.traps = filterQuizTraps(c.traps, {
        correct: c.correct_answer,
        concept: c.core_concept,
        mainQuestion: c.main_question
    });
    return c;
}

function QuizRecallFinished({ b, ui, state, blockId }) {
    const remembered = !!state.v2RecallRemembered;
    const title = remembered ? ui.quizRecallWell || 'Nice!' : ui.quizRecallReview || 'To remember';
    const sub = remembered ? ui.quizRecallWellSub || '' : ui.quizRecallReviewSub || '';
    const tone = remembered
        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30'
        : 'border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30';
    const iconTone = remembered ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400';
    return (
        <div
            id={blockId}
            className={`not-prose my-12 rounded-3xl shadow-lg border p-6 md:p-8 text-center quiz-recall-result ${tone}`}
            data-mode="recall"
            data-remembered={remembered ? '1' : '0'}
        >
            <p className={`quiz-recall-result__pulse text-3xl md:text-4xl font-black mb-2 ${iconTone}`}>{title}</p>
            {sub ? <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{sub}</p> : null}
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{b.correct_answer || ''}</p>
        </div>
    );
}

function QuizFinished({ b, ui, state, blockId, quizSession, onRetry, onAdvance, linearMode, variant }) {
    const c = challengeFromBlock(b);
    const recallOnly =
        state.v2Mode === QUIZ_MODE_RECALL ||
        state.v2RecallRemembered !== undefined ||
        (Array.isArray(c.modes) && c.modes.length === 1 && c.modes[0] === QUIZ_MODE_RECALL);
    if (recallOnly) return <QuizRecallFinished b={b} ui={ui} state={state} blockId={blockId} />;

    const ok = !!state.correct;
    const inSession = quizSession && quizSession.quizIds && quizSession.quizIds.length >= 1;
    const footerOwnsNav = linearMode && inSession && quizSession.awaitingAdvance && !quizSession.finished;
    const retryLbl = ui.quizRetry || 'Reintentar';
    let action = footerOwnsNav ? null : (
        <button
            type="button"
            className="btn-quiz-retry px-6 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 font-bold text-sm"
            onClick={() => onRetry?.(blockId)}
        >
            {retryLbl}
        </button>
    );
    if (!footerOwnsNav && linearMode && inSession && quizSession.awaitingAdvance && !quizSession.finished) {
        const isLast = quizSession.currentIndex >= quizSession.quizIds.length - 1;
        if (isLast && !ok) {
            /* Keep retry action — wrong answer on final question should not offer "See results". */
        } else {
            const nextLbl = isLast
                ? variant === 'exam'
                    ? ui.examFinish || ui.lessonQuizSessionFinish || 'See results'
                    : ui.lessonQuizSessionFinish || 'See results'
                : variant === 'exam'
                  ? ui.examNextQuestion || ui.quizNextQuestion || 'Next'
                  : ui.quizNextQuestion || ui.lessonQuizSessionNext || 'Next';
            const btnClass =
                variant === 'exam' ? 'arborito-cta-red' : 'arborito-cta-indigo';
            action = (
                <button
                    type="button"
                    className={`btn-quiz-next px-6 py-3 rounded-xl ${btnClass} font-bold text-sm`}
                    onClick={() => onAdvance?.()}
                >
                    {nextLbl}
                </button>
            );
        }
    } else if (!linearMode && inSession && quizSession.awaitingAdvance && !quizSession.finished) {
        const isLast = quizSession.currentIndex >= quizSession.quizIds.length - 1;
        if (!(isLast && !ok)) {
            const nextLbl = isLast
                ? ui.lessonQuizSessionFinish || 'Ver resultado'
                : ui.lessonQuizSessionNext || 'Siguiente';
            action = (
                <button
                    type="button"
                    className="btn-quiz-next px-6 py-3 rounded-xl arborito-cta-indigo font-bold text-sm"
                    onClick={() => onAdvance?.()}
                >
                    {nextLbl}
                </button>
            );
        }
    }

    const borderTone =
        variant === 'exam'
            ? ok
                ? 'border-green-200 dark:border-green-800 bg-green-50/60 dark:bg-green-950/25'
                : 'border-red-300 dark:border-red-900 bg-red-50/60 dark:bg-red-950/25'
            : ok
              ? 'border-green-200 dark:border-green-800 bg-green-50/60 dark:bg-green-950/25'
              : 'border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/25';

    const iconTone = ok
        ? 'text-green-600 dark:text-green-400'
        : variant === 'exam'
          ? 'text-red-500 dark:text-red-400'
          : 'text-amber-600 dark:text-amber-400';

    return (
        <div
            id={blockId}
            className={`not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8 text-center ${borderTone}`}
        >
            <div className={`text-4xl mb-3 ${iconTone}`}>{ok ? '✓' : '✗'}</div>
            <h3 className="text-xl font-black mb-2">{ok ? ui.quizCorrect || 'Correcto' : ui.quizWrong || 'Incorrecto'}</h3>
            <p className="text-sm text-slate-500 mb-4">{b.correct_answer || ''}</p>
            {action}
        </div>
    );
}

function QuizCloze({ b, c, ui, blockId, onCheck }) {
    const words = c.short_definition.split(/\s+/).filter(Boolean);
    const blankCount = c.cloze_indices.length;
    const hidden = c.cloze_indices.map((i) => (words[i] || '').toLowerCase().trim());
    const [answers, setAnswers] = useState(() => Array(blankCount).fill(''));

    return (
        <div id={blockId} className="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8" data-mode="cloze">
            <p className="arborito-eyebrow text-indigo-500 mb-2">{ui.quizModeCloze || 'Huecos'}</p>
            {c.main_question || b.main_question ? (
                <p className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">
                    {c.main_question || b.main_question}
                </p>
            ) : null}
            <p className="text-lg leading-loose text-slate-700 dark:text-slate-200 mb-6">
                {words.map((word, i) => {
                    if (!c.cloze_indices.includes(i)) {
                        return (
                            <span key={i} className="mr-1">
                                {word}
                            </span>
                        );
                    }
                    const hi = c.cloze_indices.indexOf(i);
                    const widthCh = Math.max(5, (hidden[hi] || '').length + 2);
                    return (
                        <span key={i} className="inline-block mx-0.5 align-baseline">
                            <input
                                type="text"
                                className="quiz-cloze-ans inline min-w-[3rem] border-b-2 border-indigo-500 bg-transparent text-center px-1"
                                style={{ width: `${widthCh}ch` }}
                                data-idx={hi}
                                aria-label={`${ui.quizClozeBlank || 'Blank'} ${hi + 1}`}
                                value={answers[hi] ?? ''}
                                onChange={(e) => {
                                    const next = [...answers];
                                    next[hi] = e.target.value;
                                    setAnswers(next);
                                }}
                            />
                        </span>
                    );
                })}
            </p>
            <button
                type="button"
                className="btn-quiz-cloze-check w-full py-3 arborito-cta-indigo font-bold rounded-xl"
                onClick={() => onCheck?.(blockId, b, answers)}
            >
                {ui.quizCheck || 'Comprobar'}
            </button>
        </div>
    );
}

function QuizRecall({ b, c, ui, blockId, state, onReveal, onAnswer }) {
    const revealed = !!state.v2RecallRevealed;
    if (!revealed) {
        return (
            <div
                id={blockId}
                className="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8 text-center"
                data-mode="recall"
                data-recall-phase="prompt"
            >
                <p className="arborito-eyebrow text-violet-500 mb-3">{ui.quizModeRecall || 'Recuerdo'}</p>
                <p className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white mb-8 leading-snug">{c.core_concept}</p>
                <button
                    type="button"
                    className="btn-quiz-reveal w-full max-w-sm mx-auto px-8 py-5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-lg font-black shadow-lg shadow-violet-500/30 transition-transform active:scale-[0.98]"
                    onClick={() => onReveal?.(blockId)}
                >
                    {ui.quizRecallShowAnswer || 'Mostrar respuesta'}
                </button>
            </div>
        );
    }
    return (
        <div
            id={blockId}
            className="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8 text-center"
            data-mode="recall"
            data-recall-phase="answer"
        >
            <p className="arborito-eyebrow text-violet-500 mb-3">{ui.quizModeRecall || 'Recuerdo'}</p>
            <p className="text-lg font-bold text-slate-500 dark:text-slate-400 mb-1">{c.core_concept}</p>
            <p className="text-2xl md:text-3xl font-black text-emerald-700 dark:text-emerald-300 mb-6">{c.correct_answer}</p>
            <p className="text-sm text-slate-500 mb-4">{ui.quizRecallPrompt || 'Do you remember the answer?'}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                <button
                    type="button"
                    className="btn-quiz-recall arborito-cta-emerald flex-1 px-6 py-4 rounded-xl font-bold"
                    onClick={() => onAnswer?.(blockId, true)}
                >
                    {ui.quizRecallYes || 'Lo recuerdo'}
                </button>
                <button
                    type="button"
                    className="btn-quiz-recall flex-1 px-6 py-4 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 font-bold"
                    onClick={() => onAnswer?.(blockId, false)}
                >
                    {ui.quizRecallNo || 'No lo recuerdo'}
                </button>
            </div>
        </div>
    );
}

function QuizMultiple({ b, c, ui, blockId, state, onAnswer }) {
    const attempt = state?.attemptCount || 0;
    const options = useMemo(
        () =>
            buildQuizMultipleOptions(c.correct_answer, c.traps, {
                concept: c.core_concept,
                mainQuestion: c.main_question || b.main_question,
                maxOptions: 4,
                seed: `${blockId}:${attempt}`
            }),
        [blockId, attempt, b.main_question, c]
    );
    return (
        <div id={blockId} className="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8" data-mode="multiple">
            <p className="arborito-eyebrow text-purple-500 mb-2">{ui.quizModeMultiple || 'Multiple choice'}</p>
            <h3 className="text-lg font-bold mb-6">{c.main_question || b.main_question}</h3>
            <div className="flex flex-col gap-2">
                {options.map((opt, i) => (
                    <button
                        key={i}
                        type="button"
                        className="btn-quiz-ans w-full text-left px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 font-semibold hover:border-indigo-400"
                        onClick={() => onAnswer?.(blockId, !!opt.correct)}
                    >
                        {opt.text}
                    </button>
                ))}
            </div>
        </div>
    );
}

function QuizChips({ b, c, ui, state, blockId, onPick, onUnpick, onCheck }) {
    const words = tokenizeQuizAnswerChips(c.correct_answer);
    const shuffled = useMemo(() => shuffleOptions(`${blockId}-chips`, words), [blockId, words]);
    const picked = state.chipOrder || [];
    const pool = shuffled.filter((w) => picked.filter((p) => p === w).length < shuffled.filter((x) => x === w).length);
    const prompt = orderingChipsPrompt(c.main_question || b.main_question);
    return (
        <div id={blockId} className="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8" data-mode="chips">
            <p className="arborito-eyebrow text-amber-500 mb-2">{ui.quizModeChips || 'Ordenar respuesta'}</p>
            {prompt ? (
                <p className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-3">{prompt}</p>
            ) : null}
            <div className="min-h-[52px] p-3 border-2 border-dashed rounded-xl mb-4 flex flex-wrap gap-2 quiz-chip-target" data-id={blockId}>
                {picked.map((w, i) => (
                    <button
                        key={i}
                        type="button"
                        className="quiz-chip-picked px-3 py-1.5 arborito-cta-emerald rounded-lg text-sm font-medium"
                        onClick={() => onUnpick?.(blockId, i)}
                    >
                        {w}
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap gap-2 justify-center mb-6">
                {pool.map((w, i) => (
                    <button
                        key={i}
                        type="button"
                        className="quiz-chip-pick px-3 py-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg text-sm"
                        onClick={() => onPick?.(blockId, w)}
                    >
                        {w}
                    </button>
                ))}
            </div>
            <button
                type="button"
                className="btn-quiz-chips-check w-full py-3 arborito-cta-emerald font-bold rounded-xl"
                onClick={() => onCheck?.(blockId, b, picked)}
            >
                {ui.quizCheck || 'Comprobar'}
            </button>
        </div>
    );
}

function QuizSteps({ b, c, ui, state, blockId, onPickStep, onCheck }) {
    const order = useMemo(
        () => state.v2StepsOrder || shuffleOptions(`${blockId}-steps`, [...c.steps]),
        [blockId, c.steps, state.v2StepsOrder]
    );
    return (
        <div id={blockId} className="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8" data-mode="steps">
            <p className="arborito-eyebrow text-amber-500 mb-2">{ui.quizModeSteps || 'Ordenar pasos'}</p>
            {c.main_question || b.main_question ? (
                <p className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-3">
                    {c.main_question || b.main_question}
                </p>
            ) : null}
            <p className="text-sm text-slate-500 mb-4">{ui.quizStepsHint || 'Pulsa en orden correcto (de arriba a abajo).'}</p>
            <div className="quiz-steps-play space-y-1 mb-4">
                {order.map((step, i) => (
                    <button
                        key={i}
                        type="button"
                        className="quiz-step-item w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 mb-2 font-medium"
                        onClick={() => onPickStep?.(blockId, step, i, order)}
                    >
                        {step}
                    </button>
                ))}
            </div>
            <button
                type="button"
                className="btn-quiz-steps-check w-full py-3 arborito-cta-emerald font-bold rounded-xl"
                onClick={() => onCheck?.(blockId, b, order)}
            >
                {ui.quizCheck || 'Comprobar'}
            </button>
        </div>
    );
}

export function QuizSessionSummary({
    quizzes,
    quizStates,
    isExam,
    quizSession,
    onViewCertificate,
    onRetryExam,
    onRetry,
    onDismiss,
}) {
    const { ui } = useLearning();
    const ids = quizzes.map((q) => q.id || 'quiz');
    const correct = ids.filter((id) => !!quizStates[id]?.correct).length;
    const total = ids.length;
    const rate = total > 0 ? correct / total : 0;
    const didPass = isExam ? rate >= 0.8 : correct === total;
    const icon = didPass ? '🏆' : '📋';
    const title = isExam
        ? didPass
            ? ui.quizCorrect || 'Well done!'
            : ui.examFailed || ui.quizCompleted || 'Session complete'
        : didPass
          ? ui.quizCorrect || ui.quizBlockComplete || 'Well done!'
          : ui.quizBlockFailed || ui.quizCompleted || 'Not quite — try again';
    const scoreLine = (ui.lessonQuizSessionScore || 'Score: {correct} / {total}')
        .replace('{correct}', String(correct))
        .replace('{total}', String(total));

    return (
        <div className="not-prose my-8 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 md:p-8 text-center">
            <div className="text-4xl mb-3" aria-hidden="true">
                {icon}
            </div>
            <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">{title}</h3>
            <div
                className="arborito-question-progress__segments arborito-question-progress__segments--summary mb-4 justify-center max-w-md mx-auto"
                role="list"
                aria-label={scoreLine}
            >
                {ids.map((id) => {
                    const ok = !!quizStates[id]?.correct;
                    const status = ok ? 'correct' : 'wrong';
                    const title = ok ? ui.quizCorrect || 'Correct' : ui.quizIncorrect || 'Incorrect';
                    return (
                        <div
                            key={id}
                            role="listitem"
                            className={`arborito-question-progress__segment arborito-question-progress__segment--${status}`}
                            title={title}
                            aria-label={title}
                        >
                            <span className="arborito-question-progress__mark" aria-hidden="true">
                                {ok ? '✓' : '✗'}
                            </span>
                        </div>
                    );
                })}
            </div>
            <p className="text-slate-600 dark:text-slate-300 font-bold mb-2">{scoreLine}</p>
            {isExam && didPass ? (
                <p className="text-green-600 dark:text-green-400 font-bold text-sm mb-2">
                    {ui.branchMastered || ui.congrats || ''}
                </p>
            ) : null}
            {isExam && didPass ? (
                <button
                    type="button"
                    id="btn-view-certificate"
                    className="arborito-cta-green mt-4 w-full md:w-auto px-6 py-4 font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 mx-auto"
                    onClick={() => onViewCertificate?.()}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {ui.viewCert || 'View certificate'}
                </button>
            ) : null}
            {isExam && !didPass ? (
                <button
                    type="button"
                    id="btn-retry-exam"
                    className="arborito-cta-red mt-4 w-full md:w-auto px-6 py-4 font-bold rounded-xl shadow-lg transition-transform active:scale-95 mx-auto"
                    onClick={() => onRetryExam?.()}
                >
                    {ui.examRetry || ui.quizRetry || 'Retry'}
                </button>
            ) : null}
            {!isExam ? (
                <div className="flex flex-col sm:flex-row gap-3 justify-center mt-4">
                    {!didPass ? (
                        <button
                            type="button"
                            className="arborito-cta-amber w-full md:w-auto px-6 py-4 font-bold rounded-xl shadow-lg transition-transform active:scale-95"
                            onClick={() => (onRetry || onRetryExam)?.()}
                        >
                            {ui.quizRetry || ui.quizBlockPracticeAgain || 'Retry'}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className={`${didPass ? 'arborito-cta-emerald' : 'arborito-cta-indigo'} w-full md:w-auto px-6 py-4 font-bold rounded-xl shadow-lg transition-transform active:scale-95`}
                        onClick={() => onDismiss?.()}
                    >
                        {didPass
                            ? ui.quizContinue || ui.quizBlockComplete || 'Continue'
                            : ui.quizContinue || 'Continue'}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

/** Interactive quiz challenge (student view, linear exam/quiz session). */
export function QuizChallenge({ block, state, quizSession, actions, variant = 'quiz' }) {
    const { ui } = useLearning();
    const b = block;
    if (!b) return null;

    const blockId = b.id || 'quiz';
    const c = useMemo(() => challengeFromBlock(b), [b]);
    const linearMode = variant === 'exam' || variant === 'quiz';

    if (!state?.started) {
        return (
            <div
                className="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8 text-center"
                aria-busy="true"
            >
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {ui.examSectionQuizLoading || ui.lessonQuizLabel || 'Quiz'}
                </p>
            </div>
        );
    }
    if (state.finished && state.v2Answered) {
        return (
            <QuizFinished
                b={b}
                ui={ui}
                state={state}
                blockId={blockId}
                quizSession={quizSession}
                onRetry={actions?.startQuiz}
                onAdvance={actions?.advanceQuizSession}
                linearMode={linearMode}
                variant={variant}
            />
        );
    }

    const mode = state.v2Mode || pickStudyQuizMode(c, blockId);
    switch (mode) {
        case QUIZ_MODE_CLOZE:
            return (
                <QuizCloze b={b} c={c} ui={ui} blockId={blockId} onCheck={actions?.checkCloze} />
            );
        case QUIZ_MODE_RECALL:
            return (
                <QuizRecall
                    b={b}
                    c={c}
                    ui={ui}
                    blockId={blockId}
                    state={state}
                    onReveal={actions?.revealRecall}
                    onAnswer={actions?.answerRecall}
                />
            );
        case QUIZ_MODE_CHIPS:
            return (
                <QuizChips
                    b={b}
                    c={c}
                    ui={ui}
                    state={state}
                    blockId={blockId}
                    onPick={actions?.pickChip}
                    onUnpick={actions?.unpickChip}
                    onCheck={actions?.checkChips}
                />
            );
        case QUIZ_MODE_STEPS:
            return (
                <QuizSteps
                    b={b}
                    c={c}
                    ui={ui}
                    state={state}
                    blockId={blockId}
                    onPickStep={actions?.pickStep}
                    onCheck={actions?.checkSteps}
                />
            );
        case QUIZ_MODE_MULTIPLE:
        default:
            return (
                <QuizMultiple b={b} c={c} ui={ui} blockId={blockId} state={state} onAnswer={actions?.answerQuiz} />
            );
    }
}
