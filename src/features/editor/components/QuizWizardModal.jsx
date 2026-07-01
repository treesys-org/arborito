import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { useArboritoStore } from '../../../app/hooks/useArboritoStore.js';
import { ALL_QUIZ_MODES } from '../../learning/api/quiz-schema.js';
import { modeLabel, modeHelp, useQuizWizard } from '../hooks/useQuizWizard.jsx';

const QUIZ_WIZ_CLOSE_SVG = (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        aria-hidden="true"
        className="w-[1rem] h-[1rem]"
    >
        <path d="M18 6 6 18M6 6l12 12" />
    </svg>
);

function StepDot({ n, step, ui, onGo }) {
    const active = n === step;
    const done = n < step;
    const title =
        n === 1
            ? ui.quizWizardStep1Title || 'Concepto'
            : n === 2
              ? ui.quizWizardStep2Title || 'Pregunta'
              : ui.quizWizardStep3Title || 'Secuencia';
    const stepDesc =
        n === 1
            ? ui.quizWizardStep1Desc || ''
            : n === 2
              ? ui.quizWizardStep2Desc || ''
              : ui.quizWizardStep3Desc || '';
    const short =
        n === 1
            ? ui.quizWizardStep1Short || 'Concepto'
            : n === 2
              ? ui.quizWizardStep2Short || 'Pregunta'
              : ui.quizWizardStep3Short || 'Secuencia';

    let circleClass =
        'w-7 h-7 sm:w-8 sm:h-8 rounded-full font-bold border-2 flex items-center justify-center text-xs transition-colors ';
    if (active) {
        circleClass += 'arborito-quiz-chip--active border-indigo-400';
    } else if (done) {
        circleClass +=
            'bg-indigo-100 dark:bg-indigo-900 border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-200';
    } else {
        circleClass +=
            'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500';
    }

    return (
        <button
            type="button"
            className="quiz-wiz-step-dot flex flex-col items-center gap-1 min-w-0 flex-1"
            data-goto={n}
            aria-label={title}
            data-arbor-tip={stepDesc ? `${title} — ${stepDesc}` : title}
            onClick={() => onGo(n)}
        >
            <span className={circleClass}>{n}</span>
            <span
                className={`quiz-wiz-step-dot__label text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-center leading-tight ${
                    active
                        ? 'text-indigo-600 dark:text-indigo-300'
                        : 'text-slate-500 dark:text-slate-400'
                }`}
            >
                {short}
            </span>
        </button>
    );
}

function CoverageStrip({ playableModes, ui, modeIcons }) {
    const coverageLabel = ui.quizWizardModeCoverage || 'Available modes';
    return (
        <div className="quiz-coverage px-3 py-1 border-b border-indigo-100 dark:border-indigo-900/60 bg-white/70 dark:bg-slate-900/60 flex items-center gap-1.5 flex-wrap">
            <span className="quiz-coverage__label arborito-eyebrow text-slate-500 dark:text-slate-400 shrink-0">
                {coverageLabel}
            </span>
            <div className="quiz-coverage-strip flex flex-wrap gap-1">
                {ALL_QUIZ_MODES.map((m) => {
                    const on = playableModes.has(m);
                    const cls = on ? 'quiz-mode-pill--on' : 'quiz-mode-pill--off';
                    const label = modeLabel(ui, m);
                    const help = modeHelp(ui, m);
                    const tip = help ? `${label} — ${help}` : label;
                    return (
                        <span
                            key={m}
                            className={`quiz-mode-pill ${cls}`}
                            data-mode={m}
                            data-on={on ? '1' : '0'}
                            data-arbor-tip={tip}
                        >
                            <span className="quiz-mode-pill__icon arborito-emoji-glyph" aria-hidden="true">
                                <ChromeEmoji emoji={modeIcons[m] || '·'} size={10} className="arborito-emoji-glyph" />
                            </span>
                            <span className="quiz-mode-pill__label">{label}</span>
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

export function QuizWizardModal({ blockEl, initialChallenge, onRemove }) {
const wizard = useQuizWizard(blockEl, initialChallenge);
    const {
        ui,
        step,
        goToStep,
        coreConcept,
        setCoreConcept,
        shortDefinition,
        setShortDefinition,
        mainQuestion,
        setMainQuestion,
        correctAnswer,
        setCorrectAnswer,
        traps,
        addTrap,
        updateTrap,
        clozeWords,
        clozeIndices,
        toggleCloze,
        steps,
        addStep,
        updateStep,
        removeStep,
        skipMultiple,
        setSkipMultiple,
        skipOrdering,
        setSkipOrdering,
        playableModes,
        complete,
        showChipsAuto,
        notifyChange,
        collapseWizard,
        expandWizard,
        collapsed,
        modeIcons,
    } = wizard;

    const collapseLabel = ui.quizWizardCollapse || ui.close || 'Cerrar';
    const expandLabel = ui.quizWizardExpand || ui.edit || 'Editar cuestionario';
    const dragTip = ui.lessonQuizDragLabel || 'Arrastrar para reordenar';
    const quizTitle =
        coreConcept.trim() ||
        ui.lessonQuizLabel ||
        'Cuestionario';
    const headerTip = ui.lessonQuizDesc || dragTip;

    const statusColor = complete
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    const statusText = complete
        ? ui.lessonQuizStatusComplete || 'Listo'
        : ui.lessonQuizStatusIncomplete || 'Incompleto';

    return (
        <>
            <div
                className="arborito-quiz-drag-handle"
                draggable="true"
                data-arbor-tip={headerTip}
            >
                <div className="quiz-drag-handle__lead">
                    <span aria-hidden="true" className="quiz-drag-handle__grip">
                        ⠿
                    </span>
                    <span className="quiz-drag-handle__title arborito-eyebrow truncate">
                        {quizTitle}
                    </span>
                    <button
                        type="button"
                        className="quiz-wiz-remove-btn remove-btn"
                        data-arbor-tip={ui.delete || 'Eliminar'}
                        aria-label={ui.delete || 'Eliminar'}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDragStart={(e) => e.preventDefault()}
                        onClick={onRemove}
                    >
                        <ChromeEmoji emoji="🗑" size={12} className="arborito-emoji-glyph" aria-hidden="true" />
                        <span className="quiz-wiz-remove-btn__label">{ui.delete || 'Eliminar'}</span>
                    </button>
                </div>
                <div className="quiz-drag-handle__meta">
                    <span className={`quiz-status-badge ${statusColor}`}>{statusText}</span>
                </div>
                <div className="quiz-drag-handle__close">
                    {collapsed ? (
                        <button
                            type="button"
                            className="quiz-wiz-icon-btn quiz-wiz-expand-btn"
                            data-arbor-tip={expandLabel}
                            aria-label={expandLabel}
                            onMouseDown={(e) => e.stopPropagation()}
                            onDragStart={(e) => e.preventDefault()}
                            onClick={expandWizard}
                        >
                            ✎
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="quiz-wiz-icon-btn quiz-wiz-close-btn"
                            data-arbor-tip={collapseLabel}
                            aria-label={collapseLabel}
                            onMouseDown={(e) => e.stopPropagation()}
                            onDragStart={(e) => e.preventDefault()}
                            onClick={collapseWizard}
                        >
                            {QUIZ_WIZ_CLOSE_SVG}
                        </button>
                    )}
                </div>
            </div>

            {!collapsed ? (
                <>
            <CoverageStrip playableModes={playableModes} ui={ui} modeIcons={modeIcons} />

            <div className="quiz-wizard px-3 py-2.5 sm:py-3" data-step={step}>
                <div className="quiz-wiz-steps flex items-center gap-2 mb-3 w-full max-w-lg mx-auto px-1">
                    <StepDot n={1} step={step} ui={ui} onGo={goToStep} />
                    <div className="quiz-wiz-step-connector flex-1 h-0.5 min-w-[1.25rem] bg-indigo-200 dark:bg-indigo-800 self-center mb-4" aria-hidden="true" />
                    <StepDot n={2} step={step} ui={ui} onGo={goToStep} />
                    <div className="quiz-wiz-step-connector flex-1 h-0.5 min-w-[1.25rem] bg-indigo-200 dark:bg-indigo-800 self-center mb-4" aria-hidden="true" />
                    <StepDot n={3} step={step} ui={ui} onGo={goToStep} />
                </div>

                {step === 1 ? (
                    <div className="quiz-wizard-panel" data-panel="1">
                        <h3 className="text-base font-black text-slate-900 dark:text-white mb-0.5 flex items-center gap-1.5">
                            <ChromeEmoji emoji="📖" size={17} className="arborito-emoji-glyph" />{' '}
                            {ui.quizWizardStep1Title || 'Concepto'}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                            {ui.quizWizardStep1Desc || 'Tema, definición y huecos opcionales.'}
                        </p>
                        <div className="quiz-form-grid">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                                    {ui.editorBlockCoreConcept || 'Tema principal'}
                                </label>
                                <input
                                    type="text"
                                    className="quiz-core-input arborito-input w-full"
                                    value={coreConcept}
                                    onChange={(e) => {
                                        setCoreConcept(e.target.value);
                                        notifyChange();
                                    }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                                    {ui.editorBlockShortDef || 'Definición'}
                                </label>
                                <textarea
                                    className="quiz-def-input arborito-input arborito-textarea w-full resize-none h-16"
                                    value={shortDefinition}
                                    onChange={(e) => {
                                        setShortDefinition(e.target.value);
                                        notifyChange();
                                    }}
                                />
                            </div>
                        </div>
                        {clozeWords.length > 0 ? (
                            <div className="quiz-cloze-panel mt-2 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/40 p-2.5">
                                <p className="text-[11px] text-indigo-700 dark:text-indigo-200 mb-1.5 leading-snug">
                                    {ui.quizWizardClozeHint ||
                                        'Clic en palabras para ocultarlas en el juego de huecos:'}
                                </p>
                                <div className="quiz-cloze-words flex flex-wrap gap-1">
                                    {clozeWords.map((word, idx) => {
                                        const active = clozeIndices.includes(idx);
                                        return (
                                            <button
                                                key={`${idx}-${word}`}
                                                type="button"
                                                className={`quiz-cloze-word px-2 py-0.5 rounded-md font-medium transition-all text-xs ${
                                                    active
                                                        ? 'arborito-quiz-chip--active shadow-md'
                                                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'
                                                }`}
                                                data-idx={idx}
                                                data-arbor-tip={
                                                    active
                                                        ? ui.quizWizardClozeWordHide || 'Ocultar en huecos'
                                                        : ui.quizWizardClozeWordShow || 'Mostrar en huecos'
                                                }
                                                onClick={() => toggleCloze(idx)}
                                            >
                                                {word}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}
                        <div className="flex justify-end gap-1.5 mt-3 flex-wrap">
                            <button
                                type="button"
                                className="quiz-wiz-done-basic px-3 py-1.5 rounded-lg border border-emerald-400/60 text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 font-bold text-xs"
                                data-arbor-tip={ui.quizWizardStep1QuickHint || ui.quizWizardStep1QuickDone || ''}
                                onClick={collapseWizard}
                            >
                                {ui.quizWizardStep1QuickDone || 'Terminar con lo básico'} ✓
                            </button>
                            <button
                                type="button"
                                className="quiz-wiz-next arborito-cta-indigo px-3.5 py-1.5 rounded-lg font-bold text-xs"
                                onClick={() => goToStep(2)}
                            >
                                {ui.next || 'Siguiente'} →
                            </button>
                        </div>
                    </div>
                ) : null}

                {step === 2 ? (
                    <div className="quiz-wizard-panel" data-panel="2">
                        <h3 className="text-base font-black text-slate-900 dark:text-white mb-0.5 flex items-center gap-1.5">
                            <ChromeEmoji emoji="❓" size={17} className="arborito-emoji-glyph" />{' '}
                            {ui.quizWizardStep2Title || 'Pregunta y respuesta'}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                            {ui.quizWizardStep2Desc ||
                                'Pregunta, respuesta correcta y trampas para opción múltiple.'}
                        </p>
                        <div className="quiz-form-grid">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                                    {ui.editorBlockMainQuestion || 'Pregunta'}
                                </label>
                                <input
                                    type="text"
                                    className="quiz-question-input arborito-input w-full"
                                    value={mainQuestion}
                                    onChange={(e) => {
                                        setMainQuestion(e.target.value);
                                        notifyChange();
                                    }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                                    ✓ {ui.editorBlockCorrectAnswer || 'Respuesta correcta'}
                                </label>
                                <input
                                    type="text"
                                    className="quiz-correct-input w-full"
                                    value={correctAnswer}
                                    onChange={(e) => {
                                        setCorrectAnswer(e.target.value);
                                        notifyChange();
                                    }}
                                />
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                    {ui.quizWizardCorrectAnswerHint ||
                                        'Usada en Recuerdo, Opción múltiple y Ordenar palabras.'}
                                </p>
                                {showChipsAuto ? (
                                    <p className="quiz-chips-auto text-[11px] text-indigo-600 dark:text-indigo-300 mt-1.5 flex items-center gap-1">
                                        <ChromeEmoji emoji="🔀" size={13} className="arborito-emoji-glyph" />{' '}
                                        {ui.quizWizardChipsAutoHint ||
                                            'Ordenar palabras se activa solo con respuestas de varias palabras.'}
                                    </p>
                                ) : null}
                            </div>
                        </div>

                        {skipMultiple ? (
                            <div className="quiz-skip-banner quiz-skip-banner--multiple mb-3 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-600/40 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-3">
                                <span>
                                    {ui.quizWizardSkipMultipleSet || 'Multiple choice skipped.'}
                                </span>
                                <button
                                    type="button"
                                    className="quiz-wiz-enable-multiple px-2.5 py-1 rounded-md bg-white/80 dark:bg-slate-900/40 text-amber-700 dark:text-amber-200 text-[10px] font-black uppercase tracking-wide border border-amber-400/50 hover:bg-white dark:hover:bg-slate-900"
                                    onClick={() => {
                                        setSkipMultiple(false);
                                        notifyChange();
                                    }}
                                >
                                    {ui.quizWizardEnableMultiple || 'Re-enable'}
                                </button>
                            </div>
                        ) : null}

                        <div
                            className={`quiz-multiple-form mt-2 rounded-lg border border-rose-100 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20 p-2.5 ${skipMultiple ? 'opacity-60' : ''}`}
                        >
                            <p className="text-xs font-bold text-rose-500 dark:text-rose-400 mb-2">
                                {ui.editorBlockTraps || 'Trampas'}{' '}
                                <span className="font-normal text-slate-500 dark:text-slate-400">
                                    ({ui.quizWizardStep2TrapsOptional || 'opcional — opción múltiple'})
                                </span>
                            </p>
                            <div className="quiz-traps-container space-y-1.5 mb-1">
                                {traps.map((trap, idx) => (
                                    <div key={idx} className="trap-row flex gap-2 items-center">
                                        <span className="text-rose-500 shrink-0">✗</span>
                                        <input
                                            type="text"
                                            className="quiz-trap-input flex-1 p-1.5 text-sm rounded-md border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-slate-950 text-rose-800 dark:text-rose-100"
                                            value={trap}
                                            onChange={(e) => {
                                                updateTrap(idx, e.target.value);
                                                notifyChange();
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                            <button
                                type="button"
                                className="quiz-add-trap text-xs font-bold text-rose-400 hover:underline"
                                onClick={addTrap}
                            >
                                + {ui.lessonQuizAddTrap || 'Agregar trampa'}
                            </button>
                        </div>

                        <div className="flex justify-between items-center gap-1.5 mt-3 flex-wrap">
                            <button
                                type="button"
                                className="quiz-wiz-prev px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold text-xs"
                                onClick={() => goToStep(1)}
                            >
                                ← {ui.back || 'Anterior'}
                            </button>
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                {!skipMultiple ? (
                                    <button
                                        type="button"
                                        className="quiz-wiz-skip-multiple px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                        onClick={() => {
                                            setSkipMultiple(true);
                                            notifyChange();
                                        }}
                                    >
                                        {ui.quizWizardSkipMultiple || 'Omitir opción múltiple'}
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className="quiz-wiz-next arborito-cta-indigo px-3.5 py-1.5 rounded-lg font-bold text-xs"
                                    onClick={() => goToStep(3)}
                                >
                                    {ui.next || 'Siguiente'} →
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}

                {step === 3 ? (
                    <div className="quiz-wizard-panel" data-panel="3">
                        <h3 className="text-base font-black text-slate-900 dark:text-white mb-0.5 flex items-center gap-1.5">
                            <ChromeEmoji emoji="📋" size={17} className="arborito-emoji-glyph" />{' '}
                            {ui.quizWizardStep3Title || 'Secuencia (opcional)'}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                            {ui.quizWizardStep3Desc ||
                                'Pasos de un procedimiento que el alumno debe ordenar.'}
                        </p>

                        {skipOrdering ? (
                            <div className="quiz-skip-banner quiz-skip-banner--ordering mb-3 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-600/40 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-3">
                                <span>{ui.quizWizardSkipOrderingSet || 'Ordering skipped.'}</span>
                                <button
                                    type="button"
                                    className="quiz-wiz-enable-ordering px-2.5 py-1 rounded-md bg-white/80 dark:bg-slate-900/40 text-amber-700 dark:text-amber-200 text-[10px] font-black uppercase tracking-wide border border-amber-400/50 hover:bg-white dark:hover:bg-slate-900"
                                    onClick={() => {
                                        setSkipOrdering(false);
                                        notifyChange();
                                    }}
                                >
                                    {ui.quizWizardEnableOrdering || 'Re-enable'}
                                </button>
                            </div>
                        ) : null}

                        <div
                            className={`quiz-sequence-form rounded-lg border border-amber-100 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/15 p-2.5 ${skipOrdering ? 'opacity-60' : ''}`}
                        >
                            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 mb-1.5">
                                {ui.quizWizardSequenceTitle || 'Secuencia de pasos'}
                            </p>
                            <div className="quiz-steps-list space-y-1 mb-1">
                                {steps.map((stepVal, idx) => (
                                    <div key={idx} className="quiz-step-row flex gap-2 items-center" data-step-idx={idx}>
                                        <span className="w-6 h-6 rounded-full bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                                            {idx + 1}
                                        </span>
                                        <input
                                            type="text"
                                            className="quiz-step-input arborito-input flex-1 text-sm py-1.5 px-2.5"
                                            value={stepVal}
                                            placeholder={ui.quizWizardStepPh || 'Paso…'}
                                            onChange={(e) => {
                                                updateStep(idx, e.target.value);
                                                notifyChange();
                                            }}
                                        />
                                        <button
                                            type="button"
                                            className="quiz-step-remove p-1 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded"
                                            data-arbor-tip={ui.delete || 'Eliminar'}
                                            aria-label={ui.delete || 'Eliminar'}
                                            onClick={() => removeStep(idx)}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button
                                type="button"
                                className="quiz-add-step text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline"
                                onClick={addStep}
                            >
                                + {ui.quizWizardAddStep || 'Añadir paso'}
                            </button>
                        </div>

                        <div className="flex justify-between items-center gap-1.5 mt-3 flex-wrap">
                            <button
                                type="button"
                                className="quiz-wiz-prev px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold text-xs"
                                onClick={() => goToStep(2)}
                            >
                                ← {ui.back || 'Anterior'}
                            </button>
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                {!skipOrdering ? (
                                    <button
                                        type="button"
                                        className="quiz-wiz-skip-ordering px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                        onClick={() => {
                                            setSkipOrdering(true);
                                            notifyChange();
                                        }}
                                    >
                                        {ui.quizWizardSkipOrdering || 'Omitir secuencia'}
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className="quiz-wiz-done arborito-cta-emerald px-3.5 py-1.5 rounded-lg font-bold text-xs"
                                    data-arbor-tip={ui.quizWizardDone || 'Listo'}
                                    onClick={collapseWizard}
                                >
                                    {ui.quizWizardDone || 'Listo'} ✓
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
                </>
            ) : null}
        </>
    );
}
