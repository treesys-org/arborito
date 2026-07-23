import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getArboritoStore } from '../../../core/store-singleton.js';
import {
    normalizeChallenge,
    isQuizChallengeComplete,
    parseInlineCloze,
} from '../../learning/api/quiz-schema.js';
import {
    QUIZ_PASS_RATE_DEFAULT_PERCENT,
    normalizeQuizPassRatePercent,
} from '../../learning/api/quiz-pass.js';
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
    notifyQuizEditorChange,
    readQuizWizard,
    setQuizChallengeOnBlock,
} from '../api/quiz-wizard-block.js';

const quizRoots = new WeakMap();

function emptyItemDraft() {
    return {
        core_concept: '',
        short_definition: '',
        main_question: '',
        correct_answer: '',
        traps: [''],
        cloze_indices: [],
        steps: ['', ''],
    };
}

function itemDraftFromNormalized(n) {
    const traps = n.traps?.length ? [...n.traps] : [''];
    if (!traps.length) traps.push('');
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
    });
}

function buildChallengeFromItems(items, passRate) {
    /* Do not snapshot getPlayableModes into modes — that permanently locks out cloze/chips. */
    const normalized = items.map(draftToChallenge);
    const pct = normalizeQuizPassRatePercent(passRate);
    const storedRate = pct === QUIZ_PASS_RATE_DEFAULT_PERCENT ? null : pct;
    if (normalized.length === 1) {
        normalized[0].pass_rate = storedRate;
        return normalized[0];
    }
    const block = normalizeChallenge({ items: normalized });
    block.pass_rate = storedRate;
    return block;
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

function reindexEditedFlags(setRef, removedIndex) {
    const next = new Set();
    for (const i of setRef.current) {
        if (i < removedIndex) next.add(i);
        else if (i > removedIndex) next.add(i - 1);
    }
    setRef.current = next;
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
                const ok = await shell?.showDialog?.({
                    type: 'confirm',
                    title: ui.quizWizardDeleteTitle || ui.delete || 'Delete',
                    body: ui.quizWizardDeleteConfirm || 'Delete this quiz?',
                    danger: true,
                    confirmText: ui.delete || 'Delete',
                });
                if (!ok) return;
                const editorEl =
                    block.closest('#lesson-visual-editor') ||
                    document.getElementById('lesson-visual-editor');
                if (editorEl) {
                    editorEl.dispatchEvent(
                        new CustomEvent('arborito-construct-push-history', { bubbles: true })
                    );
                }
                notifyQuizEditorChange(block);
                unmountQuizWizard(block);
                block.remove();
                if (editorEl) {
                    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
                }
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

function suggestQuestionFromTopic(topic, ui) {
    const tpl = ui.quizWizardAutoQuestion || 'What is {topic}?';
    return tpl.replace('{topic}', String(topic || '').trim());
}

function needsAuthoredQuestion(item) {
    const traps = item.traps?.some((t) => String(t || '').trim());
    const steps = item.steps?.filter((s) => String(s || '').trim()).length >= 2;
    return !!traps || !!steps;
}

export function useQuizWizard(blockEl, initialChallenge) {
    const ui = getArboritoStore()?.ui || {};
    const [items, setItems] = useState(() => itemsFromChallenge(initialChallenge));
    const [activeItemIndex, setActiveItemIndex] = useState(0);
    const [passRate, setPassRate] = useState(() =>
        normalizeQuizPassRatePercent(normalizeChallenge(initialChallenge).pass_rate)
    );
    const questionEditedRef = useRef(new Set());
    const activeItemIndexRef = useRef(0);
    activeItemIndexRef.current = activeItemIndex;

    const activeItem = items[activeItemIndex] || emptyItemDraft();
    const {
        core_concept: coreConcept,
        short_definition: shortDefinition,
        main_question: mainQuestion,
        correct_answer: correctAnswer,
        traps,
        cloze_indices: clozeIndices,
        steps,
    } = activeItem;

    const updateActiveItem = useCallback((patchOrFn) => {
        const idx = activeItemIndexRef.current;
        setItems((prev) =>
            prev.map((item, i) => {
                if (i !== idx) return item;
                const patch = typeof patchOrFn === 'function' ? patchOrFn(item) : patchOrFn;
                return { ...item, ...patch };
            })
        );
    }, []);

    const setCoreConcept = useCallback(
        (value) => updateActiveItem({ core_concept: value }),
        [updateActiveItem]
    );
    const setShortDefinition = useCallback(
        (value) => {
            const raw = String(value ?? '');
            if (raw.includes('{') && raw.includes('}')) {
                const { text, indices } = parseInlineCloze(raw);
                updateActiveItem({
                    short_definition: text,
                    cloze_indices: indices.length ? indices : [],
                });
                return;
            }
            updateActiveItem((item) => {
                const words = raw.trim().split(/\s+/).filter(Boolean);
                const nextIdx = (item.cloze_indices || []).filter(
                    (i) => Number.isInteger(i) && i >= 0 && i < words.length
                );
                return { short_definition: raw, cloze_indices: nextIdx };
            });
        },
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

    useEffect(() => {
        if (!blockEl) return;
        blockEl.classList.remove('arborito-quiz-edit--collapsed');
    }, [blockEl]);

    const challenge = useMemo(() => buildChallengeFromItems(items, passRate), [items, passRate]);

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

    const markQuestionEdited = useCallback(() => {
        questionEditedRef.current.add(activeItemIndexRef.current);
    }, []);

    const selectItem = useCallback((index) => {
        setActiveItemIndex(Math.max(0, Math.min(index, items.length - 1)));
    }, [items.length]);

    const addItem = useCallback(() => {
        setItems((prev) => [...prev, emptyItemDraft()]);
        setActiveItemIndex(items.length);
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
            reindexEditedFlags(questionEditedRef, index);
            notifyChange();
        },
        [items.length, notifyChange]
    );

    useEffect(() => {
        if (questionEditedRef.current.has(activeItemIndex)) return;
        if (clozeIndices.length > 0) return;
        if (!needsAuthoredQuestion(activeItem)) return;
        const topic = coreConcept.trim();
        if (!topic || mainQuestion.trim()) return;
        updateActiveItem({ main_question: suggestQuestionFromTopic(topic, ui) });
        notifyChange();
    }, [
        traps,
        steps,
        clozeIndices.length,
        coreConcept,
        mainQuestion,
        activeItemIndex,
        ui,
        updateActiveItem,
        activeItem,
        notifyChange,
    ]);

    const toggleCloze = useCallback(
        (idx) => {
            updateActiveItem((item) => {
                const next = new Set(item.cloze_indices || []);
                if (next.has(idx)) next.delete(idx);
                else next.add(idx);
                return { cloze_indices: [...next].sort((a, b) => a - b) };
            });
            notifyChange();
        },
        [notifyChange, updateActiveItem]
    );

    const addTrap = useCallback(() => {
        updateActiveItem((item) => ({ traps: [...(item.traps || []), ''] }));
        notifyChange();
    }, [updateActiveItem, notifyChange]);

    const updateTrap = useCallback(
        (idx, value) => {
            updateActiveItem((item) => ({
                traps: (item.traps || []).map((t, i) => (i === idx ? value : t)),
            }));
        },
        [updateActiveItem]
    );

    const removeTrap = useCallback(
        (idx) => {
            updateActiveItem((item) => {
                const next = (item.traps || []).filter((_, i) => i !== idx);
                return { traps: next };
            });
            notifyChange();
        },
        [updateActiveItem, notifyChange]
    );

    const addStep = useCallback(() => {
        updateActiveItem((item) => ({ steps: [...(item.steps || []), ''] }));
        notifyChange();
    }, [updateActiveItem, notifyChange]);

    const updateStep = useCallback(
        (idx, value) => {
            updateActiveItem((item) => ({
                steps: (item.steps || []).map((s, i) => (i === idx ? value : s)),
            }));
        },
        [updateActiveItem]
    );

    const removeStep = useCallback(
        (idx) => {
            updateActiveItem((item) => ({
                steps: (item.steps || []).filter((_, i) => i !== idx),
            }));
            notifyChange();
        },
        [notifyChange, updateActiveItem]
    );

    const complete = isQuizChallengeComplete(challenge);
    const isItemComplete = useCallback((item) => isQuizChallengeComplete(draftToChallenge(item)), []);
    const questionAuto =
        !questionEditedRef.current.has(activeItemIndex) &&
        !!mainQuestion.trim() &&
        mainQuestion.trim() === suggestQuestionFromTopic(coreConcept, ui);

    return {
        ui,
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
        removeTrap,
        clozeWords,
        clozeIndices,
        toggleCloze,
        steps,
        addStep,
        updateStep,
        removeStep,
        challenge,
        complete,
        isItemComplete,
        notifyChange,
        passRate,
        setPassRate,
        questionAuto,
        markQuestionEdited,
    };
}
