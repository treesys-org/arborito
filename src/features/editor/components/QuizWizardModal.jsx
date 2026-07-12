import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { ALL_QUIZ_MODES } from '../../learning/api/quiz-schema.js';
import { modeLabel, modeHelp, useQuizWizard } from '../hooks/useQuizWizard.jsx';

function StepDot({ n, step, ui, onGo, complete, compact = false }) {
    const active = n === step;
    const title =
        n === 1
            ? ui.quizWizardStep1Title || 'Concept'
            : n === 2
              ? ui.quizWizardStep2Title || 'Question'
              : ui.quizWizardStep3Title || 'Sequence';
    const stepDesc =
        n === 1
            ? ui.quizWizardStep1Desc || ''
            : n === 2
              ? ui.quizWizardStep2Desc || ''
              : ui.quizWizardStep3Desc || '';
    const short =
        n === 1
            ? ui.quizWizardStep1Short || 'Concept'
            : n === 2
              ? ui.quizWizardStep2Short || 'Question'
              : ui.quizWizardStep3Short || 'Sequence';

    let circleClass =
        'rounded-full font-bold border-2 flex items-center justify-center transition-colors ';
    if (compact) {
        circleClass += 'w-6 h-6 sm:w-7 sm:h-7 text-[10px]';
    } else {
        circleClass += 'w-7 h-7 sm:w-8 sm:h-8 text-xs';
    }
    if (complete) {
        circleClass +=
            ' bg-emerald-100 dark:bg-emerald-950/50 border-emerald-500 dark:border-emerald-400 text-emerald-700 dark:text-emerald-300';
    } else if (active) {
        circleClass += ' arborito-quiz-chip--active border-indigo-400';
    } else {
        circleClass +=
            ' bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500';
    }

    return (
        <button
            type="button"
            className={`quiz-wiz-step-dot flex flex-col items-center gap-1 min-w-0 ${compact ? 'flex-none' : 'flex-1'}`}
            data-goto={n}
            aria-label={title}
            data-arbor-tip={stepDesc ? `${title}, ${stepDesc}` : title}
            onClick={() => onGo(n)}
        >
            <span className={circleClass} aria-hidden="true">
                {complete ? '✓' : n}
            </span>
            {!compact ? (
                <span
                    className={`quiz-wiz-step-dot__label text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-center leading-tight ${
                        active
                            ? 'text-indigo-600 dark:text-indigo-300'
                            : complete
                              ? 'text-emerald-600 dark:text-emerald-300'
                              : 'text-slate-500 dark:text-slate-400'
                    }`}
                >
                    {short}
                </span>
            ) : null}
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
                    const tip = help ? `${label}, ${help}` : label;
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

function ItemTabs({ items, activeItemIndex, ui, onSelect, onAdd, onRemove, isItemComplete }) {
    const addLbl = ui.quizWizardAddQuestion || 'Add question';
    const questionLbl = ui.quizWizardQuestionLabel || 'Question {n}';

    return (
        <div className="quiz-wizard-items px-3 py-2 border-b border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 flex items-center gap-1.5 flex-wrap">
            {items.map((item, idx) => {
                const active = idx === activeItemIndex;
                const label = questionLbl.replace('{n}', String(idx + 1));
                const short = item.core_concept.trim() || label;
                const complete = isItemComplete?.(item);
                return (
                    <div key={idx} className="flex items-center gap-0.5">
                        <button
                            type="button"
                            className={`quiz-wizard-item-tab px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                                active
                                    ? 'arborito-quiz-chip--active shadow-sm'
                                    : 'bg-white/80 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900'
                            }`}
                            onClick={() => onSelect(idx)}
                            title={short}
                        >
                            <span className="quiz-wizard-item-tab__label">{label}</span>
                            <span
                                className={`quiz-wizard-item-tab__mark ml-1 ${complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}
                                aria-hidden="true"
                            >
                                {complete ? '✓' : '·'}
                            </span>
                        </button>
                        {items.length > 1 ? (
                            <button
                                type="button"
                                className="quiz-wizard-item-remove p-1 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded text-[10px]"
                                aria-label={ui.delete || 'Delete'}
                                data-arbor-tip={ui.quizWizardRemoveQuestion || 'Remove question'}
                                onClick={() => onRemove(idx)}
                            >
                                ✕
                            </button>
                        ) : null}
                    </div>
                );
            })}
            <button
                type="button"
                className="quiz-wizard-item-add px-2.5 py-1 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100/60 dark:hover:bg-indigo-900/30"
                onClick={onAdd}
            >
                + {addLbl}
            </button>
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
        stepComplete,
        modeIcons,
        items,
        activeItemIndex,
        selectItem,
        addItem,
        removeItem,
        isItemComplete,
    } = wizard;

    const dragTip = ui.lessonQuizDragLabel || 'Drag to reorder';
    const quizTitle =
        items.length > 1
            ? (ui.quizWizardBlockTitle || ui.quizWizardMultiTitle || 'Quiz · {count} questions').replace(
                  '{count}',
                  String(items.length)
              )
            : coreConcept.trim() || ui.lessonQuizLabel || 'Quiz';
    const headerTip = ui.lessonQuizDesc || dragTip;

    const statusColor = complete
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    const statusText = complete
        ? ui.lessonQuizStatusComplete || 'Ready'
        : ui.lessonQuizStatusIncomplete || 'Incomplete';

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
                        className="quiz-wiz-remove-btn"
                        data-arbor-tip={ui.delete || 'Delete'}
                        aria-label={ui.delete || 'Delete'}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDragStart={(e) => e.preventDefault()}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRemove?.();
                        }}
                    >
                        <ChromeEmoji emoji="🗑" size={12} className="arborito-emoji-glyph" aria-hidden="true" />
                        <span className="quiz-wiz-remove-btn__label">{ui.delete || 'Delete'}</span>
                    </button>
                </div>
                <div className="quiz-drag-handle__meta">
                    <span className={`quiz-status-badge ${statusColor}`}>{statusText}</span>
                </div>
            </div>

            <CoverageStrip playableModes={playableModes} ui={ui} modeIcons={modeIcons} />

            <ItemTabs
                items={items}
                activeItemIndex={activeItemIndex}
                ui={ui}
                onSelect={selectItem}
                onAdd={addItem}
                onRemove={removeItem}
                isItemComplete={isItemComplete}
            />

            <div
                className="quiz-wizard-steps px-3 py-2 border-b border-indigo-100/80 dark:border-indigo-900/50 flex items-center gap-1"
                aria-label={ui.quizWizardStepsNav || 'Quiz steps'}
            >
                <StepDot n={1} step={step} ui={ui} onGo={goToStep} complete={stepComplete[1]} />
                <div className="quiz-wiz-step-connector flex-1 max-w-[2rem] h-0.5 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
                <StepDot n={2} step={step} ui={ui} onGo={goToStep} complete={stepComplete[2]} />
                <div className="quiz-wiz-step-connector flex-1 max-w-[2rem] h-0.5 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
                <StepDot n={3} step={step} ui={ui} onGo={goToStep} complete={stepComplete[3]} />
            </div>

            <div className="quiz-wizard px-3 py-2.5 sm:py-3" data-step={step}>
                {step === 1 ? (
                    <div className="quiz-wizard-panel" data-panel="1">
                        <h3 className="text-base font-black text-slate-900 dark:text-white mb-0.5 flex items-center gap-1.5">
                            <ChromeEmoji emoji="📖" size={17} className="arborito-emoji-glyph" />{' '}
                            {ui.quizWizardStep1Title || 'Concept'}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                            {ui.quizWizardStep1Desc || 'Topic, definition, and optional cloze for Recall and Cloze.'}
                        </p>
                        <div className="quiz-form-grid">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                                    {ui.editorBlockCoreConcept || 'Core topic'}
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
                                    {ui.editorBlockShortDef || 'Short definition'}
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
                                        'Click words to hide them in the cloze game:'}
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
                                                        ? ui.quizWizardClozeWordHide || 'Hide in cloze'
                                                        : ui.quizWizardClozeWordShow || 'Show in cloze'
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
                                className="quiz-wiz-next arborito-cta-indigo px-3.5 py-1.5 rounded-lg font-bold text-xs"
                                onClick={() => goToStep(2)}
                            >
                                {ui.next || 'Next'} →
                            </button>
                        </div>
                    </div>
                ) : null}

                {step === 2 ? (
                    <div className="quiz-wizard-panel" data-panel="2">
                        <h3 className="text-base font-black text-slate-900 dark:text-white mb-0.5 flex items-center gap-1.5">
                            <ChromeEmoji emoji="❓" size={17} className="arborito-emoji-glyph" />{' '}
                            {ui.quizWizardStep2Title || 'Question & answer'}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                            {ui.quizWizardStep2Desc ||
                                'Question, correct answer, and traps for multiple choice.'}
                        </p>
                        <div className="quiz-form-grid">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                                    {ui.editorBlockMainQuestion || 'Question'}
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
                                    ✓ {ui.editorBlockCorrectAnswer || 'Correct answer'}
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
                                        'Used by Recall, Multiple choice, and Word order.'}
                                </p>
                                {showChipsAuto ? (
                                    <p className="quiz-chips-auto text-[11px] text-indigo-600 dark:text-indigo-300 mt-1.5 flex items-center gap-1">
                                        <ChromeEmoji emoji="🔀" size={13} className="arborito-emoji-glyph" />{' '}
                                        {ui.quizWizardChipsAutoHint ||
                                            'Word order turns on automatically when the step 2 answer has several words.'}
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
                                {ui.editorBlockTraps || 'Traps'}{' '}
                                <span className="font-normal text-slate-500 dark:text-slate-400">
                                    ({ui.quizWizardStep2TrapsOptional || 'optional, multiple choice'})
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
                                + {ui.lessonQuizAddTrap || 'Add trap'}
                            </button>
                        </div>

                        <div className="flex justify-between items-center gap-1.5 mt-3 flex-wrap">
                            <button
                                type="button"
                                className="quiz-wiz-prev px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold text-xs"
                                onClick={() => goToStep(1)}
                            >
                                ← {ui.back || 'Back'}
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
                                        {ui.quizWizardSkipMultiple || 'Skip multiple choice'}
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className="quiz-wiz-next arborito-cta-indigo px-3.5 py-1.5 rounded-lg font-bold text-xs"
                                    onClick={() => goToStep(3)}
                                >
                                    {ui.next || 'Next'} →
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}

                {step === 3 ? (
                    <div className="quiz-wizard-panel" data-panel="3">
                        <h3 className="text-base font-black text-slate-900 dark:text-white mb-0.5 flex items-center gap-1.5">
                            <ChromeEmoji emoji="📋" size={17} className="arborito-emoji-glyph" />{' '}
                            {ui.quizWizardStep3Title || 'Sequence (optional)'}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                            {ui.quizWizardStep3Desc ||
                                'Steps of a procedure the learner must order.'}
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
                                {ui.quizWizardSequenceTitle || 'Step sequence'}
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
                                            placeholder={ui.quizWizardStepPh || 'Step…'}
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
                                + {ui.quizWizardAddStep || 'Add step'}
                            </button>
                        </div>

                        <div className="flex justify-between items-center gap-1.5 mt-3 flex-wrap">
                            <button
                                type="button"
                                className="quiz-wiz-prev px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold text-xs"
                                onClick={() => goToStep(2)}
                            >
                                ← {ui.back || 'Back'}
                            </button>
                            {!skipOrdering ? (
                                <button
                                    type="button"
                                    className="quiz-wiz-skip-ordering px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                    onClick={() => {
                                        setSkipOrdering(true);
                                        notifyChange();
                                    }}
                                >
                                    {ui.quizWizardSkipOrdering || 'Skip sequence'}
                                </button>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </div>
        </>
    );
}
