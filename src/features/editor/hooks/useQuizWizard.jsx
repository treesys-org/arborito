import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getArboritoStore } from '../../../core/store-singleton.js';
import {
    QUIZ_MODE_RECALL,
    QUIZ_MODE_CLOZE,
    QUIZ_MODE_MULTIPLE,
    QUIZ_MODE_CHIPS,
    QUIZ_MODE_STEPS,
    normalizeChallenge,
    isQuizChallengeComplete,
    getPlayableModes,
} from '../../learning/api/quiz-schema.js';
import {
    clearQuizChallengeOnBlock,
    getInitialQuizChallenge,
    notifyQuizEditorChange,
    readQuizWizard,
    setQuizChallengeOnBlock,
} from '../api/quiz-wizard-block.js';
import { QuizWizardModal } from '../components/QuizWizardModal.jsx';

export {
    createQuizWizardMountShell,
    modeHelp,
    modeLabel,
    notifyQuizEditorChange,
    readQuizWizard,
    setQuizChallengeOnBlock,
} from '../api/quiz-wizard-block.js';

const MODE_ICONS = {
    [QUIZ_MODE_RECALL]: '🧠',
    [QUIZ_MODE_CLOZE]: '🧩',
    [QUIZ_MODE_MULTIPLE]: '🔘',
    [QUIZ_MODE_CHIPS]: '🔀',
    [QUIZ_MODE_STEPS]: '📋',
};

const quizRoots = new WeakMap();

function emptyItemDraft() {
    return {
        core_concept: '',
        short_definition: '',
        main_question: '',
        correct_answer: '',
        traps: ['', ''],
        cloze_indices: [],
        steps: ['', ''],
        skip_multiple: false,
        skip_ordering: false,
    };
}

function itemDraftFromNormalized(n) {
    const traps = n.traps?.length ? [...n.traps] : ['', ''];
    while (traps.length < 2) traps.push('');
    const steps = n.steps?.length ? [...n.steps] : ['', ''];
    while (steps.length < 2) steps.push('');
    return {
        core_concept: n.core_concept || '',
        short_definition: n.short_definition || '',
        main_question: n.main_question || '',
        correct_answer: n.correct_answer || '',
        traps,
        cloze_indices: [...(n.cloze_indices || [])],
        steps,
        skip_multiple: !!n.skip_multiple,
        skip_ordering: !!n.skip_ordering,
    };
}

function itemsFromChallenge(initial) {
    const n = normalizeChallenge(initial);
    if (n.items?.length) return n.items.map(itemDraftFromNormalized);
    return [itemDraftFromNormalized(n)];
}

function draftToChallenge(draft) {
    return normalizeChallenge({
        core_concept: draft.core_concept,
        short_definition: draft.short_definition,
        main_question: draft.main_question,
        correct_answer: draft.correct_answer,
        traps: draft.traps.filter((t) => t.trim()),
        cloze_indices: draft.cloze_indices,
        steps: draft.steps.map((s) => s.trim()).filter(Boolean),
        skip_multiple: draft.skip_multiple,
        skip_ordering: draft.skip_ordering,
    });
}

function buildChallengeFromItems(items) {
    const normalized = items.map(draftToChallenge);
    normalized.forEach((c) => {
        c.modes = getPlayableModes(c);
    });
    if (normalized.length === 1) return normalized[0];
    return normalizeChallenge({ items: normalized });
}

function unmountQuizWizard(block) {
    const root = quizRoots.get(block);
    if (root) {
        root.unmount();
        quizRoots.delete(block);
    }
    clearQuizChallengeOnBlock(block);
    block?.removeAttribute('data-quiz-react-mounted');
    block?.removeAttribute('data-quiz-bound');
    delete block?.dataset.quizBound;
}

/**
 * @param {HTMLElement} block
 */
export function ensureAndBindQuizWizard(block) {
    if (!block) return null;
    if (quizRoots.has(block)) {
        block.dataset.quizBound = '1';
        return block;
    }

    const challenge = getInitialQuizChallenge(block);
    setQuizChallengeOnBlock(block, challenge);
    block.removeAttribute('data-quiz-challenge');
    while (block.firstChild) block.removeChild(block.firstChild);

    const root = createRoot(block);
    quizRoots.set(block, root);
    root.render(
        <QuizWizardModal
            blockEl={block}
            initialChallenge={challenge}
            onRemove={async () => {
                const shell = getArboritoStore();
                const ui = shell?.ui || {};
                const ok = await shell?.confirm?.(
                    ui.quizWizardDeleteConfirm || 'Delete this quiz?',
                    ui.quizWizardDeleteTitle || ui.delete || 'Eliminar',
                    true
                );
                if (!ok) return;
                notifyQuizEditorChange(block);
                unmountQuizWizard(block);
                block.remove();
            }}
        />
    );
    block.dataset.quizBound = '1';
    block.dataset.quizReactMounted = '1';
    return block;
}

/** Legacy delegation hook, React-mounted blocks handle navigation internally. */
export function bindQuizWizardDelegation(editorEl) {
    if (!editorEl || editorEl.dataset.quizDelegation === '1') return;
    editorEl.dataset.quizDelegation = '1';
}

export function getQuizWizardStepComplete(challenge) {
    const c = normalizeChallenge(challenge);
    return {
        1: !!(c.core_concept.trim() && c.short_definition.trim()),
        2: !!(c.main_question.trim() && c.correct_answer.trim()),
        3: !!c.skip_ordering || c.steps.filter((s) => String(s).trim()).length >= 2,
    };
}

export function useQuizWizard(blockEl, initialChallenge) {
    const ui = getArboritoStore()?.ui || {};
    const [items, setItems] = useState(() => itemsFromChallenge(initialChallenge));
    const [activeItemIndex, setActiveItemIndex] = useState(0);
    const [step, setStep] = useState(1);

    const activeItem = items[activeItemIndex] || emptyItemDraft();
    const {
        core_concept: coreConcept,
        short_definition: shortDefinition,
        main_question: mainQuestion,
        correct_answer: correctAnswer,
        traps,
        cloze_indices: clozeIndices,
        steps,
        skip_multiple: skipMultiple,
        skip_ordering: skipOrdering,
    } = activeItem;

    const updateActiveItem = useCallback(
        (patch) => {
            setItems((prev) =>
                prev.map((item, i) => (i === activeItemIndex ? { ...item, ...patch } : item))
            );
        },
        [activeItemIndex]
    );

    const setCoreConcept = useCallback(
        (value) => updateActiveItem({ core_concept: value }),
        [updateActiveItem]
    );
    const setShortDefinition = useCallback(
        (value) => updateActiveItem({ short_definition: value }),
        [updateActiveItem]
    );
    const setMainQuestion = useCallback(
        (value) => updateActiveItem({ main_question: value }),
        [updateActiveItem]
    );
    const setCorrectAnswer = useCallback(
        (value) => updateActiveItem({ correct_answer: value }),
        [updateActiveItem]
    );
    const setSkipMultiple = useCallback(
        (value) => updateActiveItem({ skip_multiple: value }),
        [updateActiveItem]
    );
    const setSkipOrdering = useCallback(
        (value) => updateActiveItem({ skip_ordering: value }),
        [updateActiveItem]
    );

    useEffect(() => {
        if (!blockEl) return;
        if (skipMultiple) blockEl.dataset.skipMultiple = '1';
        else blockEl.removeAttribute('data-skip-multiple');
        if (skipOrdering) blockEl.dataset.skipOrdering = '1';
        else blockEl.removeAttribute('data-skip-ordering');
        blockEl.classList.remove('arborito-quiz-edit--collapsed');
    }, [blockEl, skipMultiple, skipOrdering]);

    const challenge = useMemo(() => buildChallengeFromItems(items), [items]);

    useEffect(() => {
        setQuizChallengeOnBlock(blockEl, challenge);
    }, [blockEl, challenge]);

    const clozeWords = useMemo(
        () => shortDefinition.trim().split(/\s+/).filter(Boolean),
        [shortDefinition]
    );

    const notifyChange = useCallback(() => {
        notifyQuizEditorChange(blockEl);
    }, [blockEl]);

    const goToStep = useCallback((n) => {
        setStep(Math.max(1, Math.min(3, n)));
    }, []);

    const selectItem = useCallback((index) => {
        setActiveItemIndex(Math.max(0, Math.min(index, items.length - 1)));
        setStep(1);
    }, [items.length]);

    const addItem = useCallback(() => {
        setItems((prev) => [...prev, emptyItemDraft()]);
        setActiveItemIndex(items.length);
        setStep(1);
        notifyChange();
    }, [items.length, notifyChange]);

    const removeItem = useCallback(
        (index) => {
            if (items.length <= 1) return;
            setItems((prev) => prev.filter((_, i) => i !== index));
            setActiveItemIndex((prev) => {
                if (index < prev) return prev - 1;
                if (index === prev) return Math.max(0, prev - 1);
                return prev;
            });
            setStep(1);
            notifyChange();
        },
        [items.length, notifyChange]
    );

    const toggleCloze = useCallback(
        (idx) => {
            updateActiveItem({
                cloze_indices: (() => {
                    const next = new Set(clozeIndices);
                    if (next.has(idx)) next.delete(idx);
                    else next.add(idx);
                    return [...next].sort((a, b) => a - b);
                })(),
            });
            notifyChange();
        },
        [clozeIndices, notifyChange, updateActiveItem]
    );

    const addTrap = useCallback(() => {
        updateActiveItem({ traps: [...traps, ''] });
    }, [traps, updateActiveItem]);

    const updateTrap = useCallback(
        (idx, value) => {
            updateActiveItem({ traps: traps.map((t, i) => (i === idx ? value : t)) });
        },
        [traps, updateActiveItem]
    );

    const addStep = useCallback(() => {
        updateActiveItem({ steps: [...steps, ''] });
    }, [steps, updateActiveItem]);

    const updateStep = useCallback(
        (idx, value) => {
            updateActiveItem({ steps: steps.map((s, i) => (i === idx ? value : s)) });
        },
        [steps, updateActiveItem]
    );

    const removeStep = useCallback(
        (idx) => {
            updateActiveItem({ steps: steps.filter((_, i) => i !== idx) });
            notifyChange();
        },
        [steps, notifyChange, updateActiveItem]
    );

    const activeItemChallenge = useMemo(() => draftToChallenge(activeItem), [activeItem]);
    const playableModes = useMemo(
        () => new Set(getPlayableModes(activeItemChallenge)),
        [activeItemChallenge]
    );
    const complete = isQuizChallengeComplete(challenge);
    const isItemComplete = useCallback((item) => isQuizChallengeComplete(draftToChallenge(item)), []);
    const stepComplete = useMemo(
        () => getQuizWizardStepComplete(activeItemChallenge),
        [activeItemChallenge]
    );
    const showChipsAuto = correctAnswer.trim().includes(' ');

    return {
        ui,
        step,
        goToStep,
        items,
        activeItemIndex,
        selectItem,
        addItem,
        removeItem,
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
        challenge,
        playableModes,
        complete,
        isItemComplete,
        showChipsAuto,
        notifyChange,
        stepComplete,
        modeIcons: MODE_ICONS,
    };
}
