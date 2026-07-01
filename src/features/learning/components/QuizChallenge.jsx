import { useLearning } from '../hooks/useLearning.js';
import { useMemo, useState } from 'react';
import {
    QUIZ_MODE_CLOZE,
    QUIZ_MODE_MULTIPLE,
    QUIZ_MODE_RECALL,
    QUIZ_MODE_CHIPS,
    QUIZ_MODE_STEPS,
    normalizeChallenge,
    pickStudyQuizMode,
    getPlayableModes
} from '../api/quiz-schema.js';
import { buildQuizMultipleOptions, filterQuizTraps } from '../api/quiz-trap-filter.js';

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
    const c = normalizeChallenge({
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

function QuizIntro({ b, ui, blockId, modes, onStart }) {
    return (
        <div
            id={blockId}
            className="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border-2 border-indigo-200 dark:border-indigo-800 p-6 md:p-8 text-center"
        >
            <span className="text-3xl mb-3 block" aria-hidden="true">
                🎯
            </span>
            <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">
                {ui.lessonQuizLabel || 'Desafío'}
            </h3>
            {b.core_concept ? (
                <p className="arborito-eyebrow arborito-eyebrow--md text-indigo-600 dark:text-indigo-300 mb-2">
                    {b.core_concept}
                </p>
            ) : null}
            <p className="text-slate-500 dark:text-slate-400 mb-2 text-sm">
                {ui.quizV2RandomIntro || 'Cada intento usa un tipo de desafío distinto.'}
            </p>
            <p className="text-[10px] text-slate-400 mb-6 font-mono">{modes.join(' · ')}</p>
            <button
                type="button"
                className="btn-quiz-start arborito-cta-indigo w-full md:w-auto px-8 py-4 font-bold rounded-xl shadow-lg"
                onClick={() => onStart?.(blockId)}
            >
                {ui.quizStart || 'Empezar'}
            </button>
        </div>
    );
}

function QuizRecallFinished({ b, ui, state, blockId }) {
    const remembered = !!state.v2RecallRemembered;
    const title = remembered ? ui.quizRecallWell || '¡Bien!' : ui.quizRecallReview || 'Para recordar';
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

function QuizFinished({ b, ui, state, blockId, quizSession, onRetry, onAdvance }) {
    const c = challengeFromBlock(b);
    const recallOnly =
        state.v2Mode === QUIZ_MODE_RECALL ||
        state.v2RecallRemembered !== undefined ||
        (Array.isArray(c.modes) && c.modes.length === 1 && c.modes[0] === QUIZ_MODE_RECALL);
    if (recallOnly) return <QuizRecallFinished b={b} ui={ui} state={state} blockId={blockId} />;

    const ok = !!state.correct;
    const inSession = quizSession && quizSession.quizIds && quizSession.quizIds.length > 1;
    const retryLbl = ui.quizRetry || 'Reintentar';
    let action = (
        <button
            type="button"
            className="btn-quiz-retry px-6 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 font-bold text-sm"
            onClick={() => onRetry?.(blockId)}
        >
            {retryLbl}
        </button>
    );
    if (inSession && quizSession.awaitingAdvance && !quizSession.finished) {
        const isLast = quizSession.currentIndex >= quizSession.quizIds.length - 1;
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

    return (
        <div
            id={blockId}
            className={`not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8 text-center ${ok ? 'border-green-200' : 'border-red-200'}`}
        >
            <div className="text-4xl mb-3">{ok ? '✓' : '✗'}</div>
            <h3 className="text-xl font-black mb-2">{ok ? ui.quizCorrect || 'Correcto' : ui.quizWrong || 'Incorrecto'}</h3>
            <p className="text-sm text-slate-500 mb-4">{b.correct_answer || ''}</p>
            {action}
        </div>
    );
}

function QuizCloze({ b, c, ui, blockId, onCheck }) {
    const words = c.short_definition.split(/\s+/).filter(Boolean);
    const blankCount = c.cloze_indices.length;
    const [answers, setAnswers] = useState(() => Array(blankCount).fill(''));

    return (
        <div id={blockId} className="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8" data-mode="cloze">
            <p className="arborito-eyebrow text-indigo-500 mb-2">{ui.quizModeCloze || 'Huecos'}</p>
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
                    return (
                        <span key={i} className="inline-block mx-0.5">
                            <input
                                type="text"
                                className="quiz-cloze-ans w-20 inline border-b-2 border-indigo-500 bg-transparent text-center"
                                data-idx={hi}
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
            <p className="text-sm text-slate-500 mb-4">{ui.quizRecallPrompt || '¿Recuerdas la respuesta?'}</p>
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

function QuizMultiple({ b, c, ui, blockId, onAnswer }) {
    const options = useMemo(
        () =>
            shuffleOptions(
                blockId,
                buildQuizMultipleOptions(c.correct_answer, c.traps, {
                    concept: c.core_concept,
                    mainQuestion: c.main_question || b.main_question,
                    maxOptions: 4
                })
            ),
        [blockId, b.main_question, c]
    );
    return (
        <div id={blockId} className="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8" data-mode="multiple">
            <p className="arborito-eyebrow text-purple-500 mb-2">{ui.quizModeMultiple || 'Opción múltiple'}</p>
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
    const words = c.correct_answer.split(/\s+/).filter(Boolean);
    const shuffled = useMemo(() => shuffleOptions(`${blockId}-chips`, words), [blockId, words]);
    const picked = state.chipOrder || [];
    const pool = shuffled.filter((w) => picked.filter((p) => p === w).length < shuffled.filter((x) => x === w).length);
    return (
        <div id={blockId} className="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8" data-mode="chips">
            <p className="arborito-eyebrow text-amber-500 mb-2">{ui.quizModeChips || 'Ordenar respuesta'}</p>
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

export function QuizSessionSummary({ quizzes, quizStates, isExam, quizSession, onViewCertificate }) {
    const { ui } = useLearning();
    const ids = quizzes.map((q) => q.id || 'quiz');
    const correct = ids.filter((id) => !!quizStates[id]?.correct).length;
    const total = ids.length;
    const rate = total > 0 ? correct / total : 0;
    const didPass = isExam ? rate >= 0.8 : correct === total;
    const icon = didPass ? '🏆' : '📋';
    const title = didPass ? ui.quizCorrect || 'Well done!' : ui.quizCompleted || 'Session complete';
    const scoreLine = (ui.lessonQuizSessionScore || 'Score: {correct} / {total}')
        .replace('{correct}', String(correct))
        .replace('{total}', String(total));

    return (
        <div className="not-prose my-8 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 md:p-8 text-center">
            <div className="text-4xl mb-3" aria-hidden="true">
                {icon}
            </div>
            <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">{title}</h3>
            <div className="flex gap-1 mb-4 justify-center max-w-md mx-auto" role="presentation">
                {ids.map((id) => (
                    <div
                        key={id}
                        className={`h-2 flex-1 min-w-[6px] max-w-10 rounded-full ${quizStates[id]?.correct ? 'bg-green-500' : 'bg-red-500'}`}
                    />
                ))}
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
        </div>
    );
}

export function QuizSessionProgress({ quizzes, quizSession }) {
    const { ui } = useLearning();
    const idx = quizSession ? quizSession.currentIndex : 0;
    const total = quizzes.length;
    const progressLabel = (ui.lessonQuizSessionProgress || 'Question {current} of {total}')
        .replace('{current}', String(idx + 1))
        .replace('{total}', String(total));
    const pct = total > 0 ? Math.round(((idx + (quizSession?.awaitingAdvance ? 1 : 0)) / total) * 100) : 0;
    return (
        <div className="mb-6 not-prose">
            <div className="arborito-eyebrow flex justify-between mb-2">
                <span>{ui.lessonQuizLabel || 'Evaluation'}</span>
                <span>{progressLabel}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

/** Interactive quiz challenge (student view). */
export function QuizChallenge({ block, state, quizSession, actions }) {    const b = block;
    if (!b) return null;

    const blockId = b.id || 'quiz';
    const c = useMemo(() => challengeFromBlock(b), [b]);
    const modes = useMemo(() => getPlayableModes(c), [c]);

    if (!state?.started) {
        return (
            <QuizIntro b={b} ui={ui} blockId={blockId} modes={modes} onStart={actions?.startQuiz} />
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
                <QuizMultiple b={b} c={c} ui={ui} blockId={blockId} onAnswer={actions?.answerQuiz} />
            );
    }
}
