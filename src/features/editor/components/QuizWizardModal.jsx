import { useEffect, useState } from 'react';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { useQuizWizard } from '../hooks/useQuizWizard.jsx';

function conceptStepPlaceholder(ui, idx) {
    if (idx === 0) return ui.quizWizardConceptPh1 || ui.quizWizardStepPh || '';
    if (idx === 1) return ui.quizWizardConceptPh2 || ui.quizWizardStepPh || '';
    return ui.quizWizardStepPh || '';
}

function ItemTabs({ items, activeItemIndex, ui, onSelect, onAdd, onRemove, isItemComplete }) {
    const addLbl = ui.quizWizardAddQuestion || 'Add question';
    const questionLbl = ui.quizWizardQuestionLabel || 'Question {n}';

    return (
        <div className="quiz-wizard-items px-3 py-2 border-b border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 flex items-center gap-1.5 flex-wrap">
            {items.map((item, idx) => {
                const active = idx === activeItemIndex;
                const label = questionLbl.replace('{n}', String(idx + 1));
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
                        >
                            {label}
                            <span
                                className={`ml-1 ${complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}
                                aria-hidden="true"
                            >
                                {complete ? '✓' : '·'}
                            </span>
                        </button>
                        {items.length > 1 ? (
                            <button
                                type="button"
                                className="quiz-wizard-item-remove p-1 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded text-[10px]"
                                aria-label={ui.quizWizardRemoveQuestion || ui.delete || 'Delete'}
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
        removeTrap,
        clozeWords,
        clozeIndices,
        toggleCloze,
        steps,
        addStep,
        updateStep,
        removeStep,
        complete,
        notifyChange,
        items,
        activeItemIndex,
        selectItem,
        addItem,
        removeItem,
        isItemComplete,
        passRate,
        setPassRate,
        questionAuto,
        markQuestionEdited,
    } = wizard;

    const stepsHaveContent = steps.some((s) => String(s || '').trim());
    const [stepsVisible, setStepsVisible] = useState(() => stepsHaveContent);

    useEffect(() => {
        setStepsVisible(stepsHaveContent);
    }, [activeItemIndex, stepsHaveContent]);

    const quizTitle =
        items.length > 1
            ? (ui.quizWizardBlockTitle || 'Quiz · {count} questions').replace(
                  '{count}',
                  String(items.length)
              )
            : coreConcept.trim() || ui.lessonQuizLabel || 'Quiz';

    const statusColor = complete
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    const statusText = complete
        ? ui.lessonQuizStatusComplete || 'Ready'
        : ui.lessonQuizStatusIncomplete || 'Incomplete';

    const clozeMode = clozeIndices.length > 0;
    const trapLabel = ui.quizWizardTrapLabel || 'Trap answer';
    const addTrapLbl = ui.quizWizardAddTrap || ui.lessonQuizAddTrap || 'Add trap';
    const removeTrapLbl = ui.quizWizardRemoveTrap || ui.delete || 'Delete';

    const showSteps = stepsVisible || stepsHaveContent;

    return (
        <>
            <div className="arborito-quiz-drag-handle" draggable="true">
                <div className="quiz-drag-handle__lead">
                    <span aria-hidden="true" className="quiz-drag-handle__grip">
                        ⠿
                    </span>
                    <span className="quiz-drag-handle__title arborito-eyebrow truncate">
                        <ChromeEmoji emoji="📝" size={18} className="quiz-drag-handle__emoji shrink-0" />
                        <span className="quiz-drag-handle__title-text truncate">{quizTitle}</span>
                    </span>
                    <button
                        type="button"
                        className="quiz-wiz-delete-btn btn-confirm arborito-cta-red"
                        data-arbor-tip={ui.quizWizardDeleteTitle || ui.delete || 'Delete'}
                        aria-label={ui.quizWizardDeleteTitle || ui.delete || 'Delete'}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDragStart={(e) => e.preventDefault()}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRemove?.();
                        }}
                    >
                        {ui.delete || 'Delete'}
                    </button>
                </div>
                <div className="quiz-drag-handle__meta">
                    <span className={`quiz-status-badge ${statusColor}`}>{statusText}</span>
                    <label className="quiz-wizard-pass-rate" title={ui.quizWizardPassRateHint || ''}>
                        <span className="quiz-wizard-pass-rate__label">
                            {ui.quizWizardPassRateShort || 'Pass'}
                        </span>
                        <span className="quiz-wizard-pass-rate__field">
                            <input
                                type="number"
                                min={0}
                                max={100}
                                step={5}
                                value={passRate}
                                className="quiz-wizard-pass-rate__input"
                                onChange={(e) => {
                                    const n = parseInt(e.target.value, 10);
                                    setPassRate(Number.isNaN(n) ? 80 : Math.min(100, Math.max(0, n)));
                                    notifyChange();
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onDragStart={(e) => e.preventDefault()}
                                aria-label={ui.quizWizardPassRateLabel || 'Minimum pass %'}
                            />
                            <span className="quiz-wizard-pass-rate__pct" aria-hidden="true">
                                %
                            </span>
                        </span>
                    </label>
                </div>
            </div>

            <ItemTabs
                items={items}
                activeItemIndex={activeItemIndex}
                ui={ui}
                onSelect={selectItem}
                onAdd={addItem}
                onRemove={removeItem}
                isItemComplete={isItemComplete}
            />

            <div className="quiz-wizard px-3 py-2.5 sm:py-3">
                <div className="quiz-wizard-panel">
                    <div className="quiz-form-grid">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                                {ui.quizWizardFieldTopic || ui.editorBlockCoreConcept || 'Topic'}
                            </label>
                            <input
                                type="text"
                                className="quiz-core-input arborito-input w-full"
                                value={coreConcept}
                                placeholder={ui.quizWizardFieldTopicPh || ''}
                                autoComplete="off"
                                onChange={(e) => {
                                    setCoreConcept(e.target.value);
                                    notifyChange();
                                }}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                                {ui.quizWizardFieldDefinition || ui.editorBlockShortDef || 'Definition'}
                            </label>
                            <textarea
                                className="quiz-def-input arborito-input arborito-textarea w-full resize-none h-16"
                                value={shortDefinition}
                                placeholder={ui.quizWizardFieldDefinitionPh || ''}
                                onChange={(e) => {
                                    setShortDefinition(e.target.value);
                                    notifyChange();
                                }}
                            />
                        </div>
                    </div>

                    {clozeWords.length > 2 ? (
                        <div className="quiz-cloze-panel mt-2 rounded-lg border border-indigo-200/70 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-950/30 p-2">
                            <p className="text-[10px] text-indigo-700/90 dark:text-indigo-200/80 mb-1.5">
                                {ui.quizWizardClozeHint || 'Tap words to hide in cloze mode.'}
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
                                            onClick={() => toggleCloze(idx)}
                                        >
                                            {word}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}

                    <div className="quiz-wizard-qa mt-2.5 rounded-lg border border-indigo-200/70 dark:border-indigo-500/30 bg-indigo-50/30 dark:bg-indigo-950/20 p-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700/90 dark:text-indigo-200/80 mb-2">
                            {ui.quizWizardStep2Title || 'Question & answer'}
                        </p>
                        <div className="quiz-form-grid">
                            <div className="quiz-form-grid__span">
                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                                    {ui.quizWizardFieldQuestion || ui.editorBlockMainQuestion || 'Question'}
                                </label>
                                <input
                                    type="text"
                                    className="quiz-question-input arborito-input w-full"
                                    value={mainQuestion}
                                    placeholder={ui.quizWizardFieldQuestionPh || ''}
                                    onChange={(e) => {
                                        markQuestionEdited();
                                        setMainQuestion(e.target.value);
                                        notifyChange();
                                    }}
                                />
                                {questionAuto ? (
                                    <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                                        {ui.quizWizardFieldQuestionAutoHint || 'Suggested from the topic.'}
                                    </p>
                                ) : null}
                                {clozeMode ? (
                                    <p className="mt-1 text-[10px] text-indigo-600/90 dark:text-indigo-300/80 leading-snug">
                                        {ui.quizWizardFieldQuestionClozeNote ||
                                            'Leave empty for cloze mode. Filling it disables cloze.'}
                                    </p>
                                ) : null}
                            </div>
                            <div className="quiz-form-grid__span">
                                <label className="block text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                                    {ui.quizWizardFieldAnswer ||
                                        ui.editorBlockCorrectAnswer ||
                                        'Correct answer'}
                                </label>
                                <input
                                    type="text"
                                    className="quiz-correct-input w-full"
                                    value={correctAnswer}
                                    placeholder={ui.quizWizardFieldAnswerPh || ''}
                                    autoComplete="off"
                                    onChange={(e) => {
                                        setCorrectAnswer(e.target.value);
                                        notifyChange();
                                    }}
                                />
                            </div>
                        </div>

                        <div className="quiz-traps-inline mt-2.5 pt-2 border-t border-indigo-200/50 dark:border-indigo-500/20 space-y-1.5">
                            {traps.map((trap, idx) => (
                                <div key={idx} className="flex gap-2 items-end">
                                    <div className="flex-1 min-w-0">
                                        <label className="block text-xs font-bold text-rose-600 dark:text-rose-400 mb-1">
                                            {trapLabel}
                                        </label>
                                        <input
                                            type="text"
                                            className="quiz-trap-input w-full"
                                            value={trap}
                                            placeholder={ui.quizWizardTrapPh || ''}
                                            onChange={(e) => {
                                                updateTrap(idx, e.target.value);
                                                notifyChange();
                                            }}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        className="quiz-wiz-remove-btn quiz-trap-remove p-1.5 mb-0.5 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded text-xs shrink-0"
                                        aria-label={removeTrapLbl}
                                        onClick={() => removeTrap(idx)}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                className="quiz-add-trap text-[11px] font-bold text-rose-500/90 dark:text-rose-400/90 hover:underline"
                                onClick={addTrap}
                            >
                                + {addTrapLbl}
                            </button>
                        </div>
                    </div>

                    {showSteps ? (
                        <div className="quiz-wizard-steps-block mt-2.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-900/30 p-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                                {ui.quizWizardStepsFold || 'Order concepts'}
                            </p>
                            <div className="quiz-steps-list space-y-1 mb-1.5">
                                {steps.map((stepVal, idx) => (
                                    <div key={idx} className="quiz-step-row flex gap-2 items-center">
                                        <span className="w-5 h-5 rounded-full bg-slate-200/60 dark:bg-slate-800 text-slate-500 flex items-center justify-center text-[9px] font-bold shrink-0">
                                            {idx + 1}
                                        </span>
                                        <input
                                            type="text"
                                            className="quiz-step-input arborito-input flex-1 text-sm py-1.5 px-2.5"
                                            value={stepVal}
                                            placeholder={conceptStepPlaceholder(ui, idx)}
                                            onChange={(e) => {
                                                updateStep(idx, e.target.value);
                                                notifyChange();
                                            }}
                                        />
                                        {steps.length > 2 ? (
                                            <button
                                                type="button"
                                                className="quiz-step-remove p-1 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded text-xs"
                                                aria-label={ui.delete || 'Delete'}
                                                onClick={() => removeStep(idx)}
                                            >
                                                ✕
                                            </button>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                            <button
                                type="button"
                                className="quiz-add-step text-[11px] font-bold text-slate-500 hover:underline"
                                onClick={addStep}
                            >
                                + {ui.quizWizardAddStep || 'Add step'}
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="quiz-wizard-steps-trigger mt-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:underline"
                            onClick={() => setStepsVisible(true)}
                        >
                            + {ui.quizWizardStepsAddLink || 'Add concepts to order'}
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}
