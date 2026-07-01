import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useEditorStore } from './useEditor.js';
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
            onRemove={() => {
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

/** Legacy delegation hook — React-mounted blocks handle navigation internally. */
export function bindQuizWizardDelegation(editorEl) {
    if (!editorEl || editorEl.dataset.quizDelegation === '1') return;
    editorEl.dataset.quizDelegation = '1';
}

export function useQuizWizard(blockEl, initialChallenge) {
    const store = useEditorStore();
    const ui = store.ui || {};
    const [step, setStep] = useState(1);
    const [coreConcept, setCoreConcept] = useState(initialChallenge.core_concept || '');
    const [shortDefinition, setShortDefinition] = useState(initialChallenge.short_definition || '');
    const [mainQuestion, setMainQuestion] = useState(initialChallenge.main_question || '');
    const [correctAnswer, setCorrectAnswer] = useState(initialChallenge.correct_answer || '');
    const [traps, setTraps] = useState(() => {
        const t = initialChallenge.traps?.length ? [...initialChallenge.traps] : ['', ''];
        while (t.length < 2) t.push('');
        return t;
    });
    const [clozeIndices, setClozeIndices] = useState(() => [...(initialChallenge.cloze_indices || [])]);
    const [steps, setSteps] = useState(() => {
        const s = initialChallenge.steps?.length ? [...initialChallenge.steps] : ['', ''];
        while (s.length < 2) s.push('');
        return s;
    });
    const [skipMultiple, setSkipMultiple] = useState(!!initialChallenge.skip_multiple);
    const [skipOrdering, setSkipOrdering] = useState(!!initialChallenge.skip_ordering);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        if (!blockEl) return;
        if (skipMultiple) blockEl.dataset.skipMultiple = '1';
        else blockEl.removeAttribute('data-skip-multiple');
        if (skipOrdering) blockEl.dataset.skipOrdering = '1';
        else blockEl.removeAttribute('data-skip-ordering');
        blockEl.classList.toggle('arborito-quiz-edit--collapsed', collapsed);
    }, [blockEl, skipMultiple, skipOrdering, collapsed]);

    const challenge = useMemo(() => {
        const c = normalizeChallenge({
            core_concept: coreConcept,
            short_definition: shortDefinition,
            main_question: mainQuestion,
            correct_answer: correctAnswer,
            traps: traps.filter((t) => t.trim()),
            cloze_indices: clozeIndices,
            steps: steps.map((s) => s.trim()).filter(Boolean),
            skip_multiple: skipMultiple,
            skip_ordering: skipOrdering,
        });
        c.modes = getPlayableModes(c);
        return c;
    }, [
        coreConcept,
        shortDefinition,
        mainQuestion,
        correctAnswer,
        traps,
        clozeIndices,
        steps,
        skipMultiple,
        skipOrdering,
    ]);

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

    const toggleCloze = useCallback(
        (idx) => {
            setClozeIndices((prev) => {
                const next = new Set(prev);
                if (next.has(idx)) next.delete(idx);
                else next.add(idx);
                return [...next].sort((a, b) => a - b);
            });
            notifyChange();
        },
        [notifyChange]
    );

    const addTrap = useCallback(() => {
        setTraps((prev) => [...prev, '']);
    }, []);

    const updateTrap = useCallback((idx, value) => {
        setTraps((prev) => prev.map((t, i) => (i === idx ? value : t)));
    }, []);

    const addStep = useCallback(() => {
        setSteps((prev) => [...prev, '']);
    }, []);

    const updateStep = useCallback((idx, value) => {
        setSteps((prev) => prev.map((s, i) => (i === idx ? value : s)));
    }, []);

    const removeStep = useCallback((idx) => {
        setSteps((prev) => prev.filter((_, i) => i !== idx));
        notifyChange();
    }, [notifyChange]);

    const focusEditor = useCallback(() => {
        const editor = blockEl?.closest('[contenteditable="true"]') || blockEl?.parentElement;
        editor?.focus?.();
    }, [blockEl]);

    const collapseWizard = useCallback(() => {
        setCollapsed(true);
        notifyChange();
        focusEditor();
    }, [notifyChange, focusEditor]);

    const expandWizard = useCallback(() => {
        setCollapsed(false);
    }, []);

    const playableModes = useMemo(() => new Set(getPlayableModes(challenge)), [challenge]);
    const complete = isQuizChallengeComplete(challenge);
    const showChipsAuto = correctAnswer.trim().includes(' ');

    return {
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
        challenge,
        playableModes,
        complete,
        showChipsAuto,
        notifyChange,
        focusEditor,
        collapseWizard,
        expandWizard,
        collapsed,
        modeIcons: MODE_ICONS,
    };
}
