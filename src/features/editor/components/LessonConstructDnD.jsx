import { useEffect, useRef } from 'react';
import { bindQuizWizardDelegation, ensureAndBindQuizWizard } from '../hooks/useQuizWizard.jsx';
import {
    captureEditorSelection,
    isLessonEditorToolbarControl,
    shouldKeepSavedEditorSelection,
} from '../api/editor-selection.js';
import { bindGameBlockControls, handleGameBlockAction } from '../api/logic/editor-game-block.js';

function isEditorChromeTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.closest('.arborito-callout-edit')) return false;
    return !!target.closest(
        'button, input, select, textarea, .remove-btn, .arborito-quiz-edit, .edit-block-wrapper'
    );
}

function focusEditorCaret(editorEl, clientX, clientY) {
    editorEl.focus({ preventScroll: true });
    try {
        if (document.caretRangeFromPoint) {
            const range = document.caretRangeFromPoint(clientX, clientY);
            if (range && editorEl.contains(range.startContainer)) {
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
                return;
            }
        }
    } catch {
        /* ignore */
    }
    try {
        const range = document.createRange();
        range.selectNodeContents(editorEl);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
    } catch {
        /* ignore */
    }
}

function removeEditorBlock(editorEl, block, lessonEditor, markUserEdited) {
    if (!(block instanceof HTMLElement) || !editorEl.contains(block)) return;
    lessonEditor.pushHistory(editorEl);
    block.remove();
    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
    markUserEdited();
}

/** Editor shell effects: quiz drag, wizard delegation (content seeding is in LessonBody). */
export function useLessonConstructDnD({
    editorRef,
    contentAreaRef,
    panel,
    constructApiRef,
    isLessonConstructEdit,
    lessonEditor
}) {
    const quizDragCleanupRef = useRef(null);
    const quizObserverRef = useRef(null);

    useEffect(() => {
        const editorEl = editorRef?.current;
        if (!editorEl || !isLessonConstructEdit() || !panel.currentNode) {
            quizDragCleanupRef.current?.();
            quizDragCleanupRef.current = null;
            return undefined;
        }

        const api = constructApiRef.current;
        const { markUserEdited, boundSectionRef } = lessonEditor;

        boundSectionRef.current = panel.activeSectionIndex;

        api?._refreshLessonSaveButton?.();

        const onSelectionChange = () => {
            try {
                const sel = window.getSelection();
                if (!(sel && sel.rangeCount)) return;
                const r = sel.getRangeAt(0);
                const saved = lessonEditor.savedRangeRef.current;
                if (
                    shouldKeepSavedEditorSelection(editorEl, saved, r)
                ) {
                    return;
                }
                if (editorEl.contains(r.commonAncestorContainer)) {
                    lessonEditor.savedRangeRef.current = r.cloneRange();
                }
            } catch {
                /* ignore */
            }
        };
        document.addEventListener('selectionchange', onSelectionChange);

        const onToolbarPress = (ev) => {
            if (!isLessonEditorToolbarControl(ev.target)) return;
            captureEditorSelection(editorEl, lessonEditor.savedRangeRef);
            ev.preventDefault();
        };
        document.addEventListener('mousedown', onToolbarPress, true);
        document.addEventListener('pointerdown', onToolbarPress, true);
        document.addEventListener('touchstart', onToolbarPress, { capture: true, passive: false });

        editorEl.oninput = () => markUserEdited();

        const onNestedFieldInput = (e) => {
            const t = e.target;
            if (
                t instanceof HTMLInputElement ||
                t instanceof HTMLSelectElement ||
                t instanceof HTMLTextAreaElement
            ) {
                if (editorEl.contains(t)) markUserEdited();
            }
        };
        editorEl.addEventListener('input', onNestedFieldInput, true);
        editorEl.addEventListener('change', onNestedFieldInput, true);

        const onEditorTap = (e) => {
            const target = e.target;
            if (!(target instanceof Element)) return;
            if (isEditorChromeTarget(target)) return;
            const callout = target.closest('.arborito-callout-edit');
            if (callout instanceof HTMLElement) {
                callout.focus();
                return;
            }
            if (!editorEl.contains(target) && target !== editorEl) return;
            focusEditorCaret(editorEl, e.clientX, e.clientY);
        };
        editorEl.addEventListener('touchend', onEditorTap, { passive: true });
        editorEl.addEventListener('click', onEditorTap);

        const onEditorChromeClick = (e) => {
            const target = e.target;
            if (!(target instanceof Element)) return;

            if (target.closest('.remove-btn')) {
                const block = target.closest(
                    '.edit-block-wrapper, .arborito-quiz-edit, .arborito-callout-edit, .arborito-game-edit, .arborito-media-edit'
                );
                if (block) {
                    e.preventDefault();
                    removeEditorBlock(editorEl, block, lessonEditor, markUserEdited);
                }
                return;
            }

            const gameBlock = target.closest('.arborito-game-edit');
            if (gameBlock instanceof HTMLElement && handleGameBlockAction(gameBlock, target)) {
                editorEl.dispatchEvent(new Event('input', { bubbles: true }));
                markUserEdited();
            }
        };
        editorEl.addEventListener('click', onEditorChromeClick, true);

        quizDragCleanupRef.current?.();
        let dragBlock = null;

        const getInsertBeforeElement = (container, y) => {
            const candidates = [...container.children].filter(
                (c) => c.nodeType === Node.ELEMENT_NODE && c !== dragBlock
            );
            for (const child of candidates) {
                const box = child.getBoundingClientRect();
                if (y < box.top + box.height / 2) return child;
            }
            return null;
        };

        const onDragStart = (e) => {
            const t = e.target;
            if (!(t instanceof Element)) return;
            const handle = t.closest('.arborito-quiz-drag-handle');
            if (!handle || !editorEl.contains(handle)) return;
            const block = handle.closest('.arborito-quiz-edit');
            if (!(block instanceof HTMLElement) || !editorEl.contains(block)) return;
            dragBlock = block;
            try {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', 'arborito-quiz');
            } catch {
                /* ignore */
            }
            block.classList.add('arborito-quiz-edit--dragging');
        };

        const onDragEnd = () => {
            dragBlock?.classList.remove('arborito-quiz-edit--dragging');
            dragBlock = null;
        };

        const onDragOver = (e) => {
            if (!dragBlock) return;
            e.preventDefault();
            try {
                e.dataTransfer.dropEffect = 'move';
            } catch {
                /* ignore */
            }
        };

        const onDrop = (e) => {
            if (!dragBlock) return;
            e.preventDefault();
            const beforeEl = getInsertBeforeElement(editorEl, e.clientY);
            lessonEditor.pushHistory(editorEl);
            if (beforeEl == null) editorEl.appendChild(dragBlock);
            else editorEl.insertBefore(dragBlock, beforeEl);
            dragBlock.classList.remove('arborito-quiz-edit--dragging');
            dragBlock = null;
            editorEl.dispatchEvent(new Event('input', { bubbles: true }));
        };

        editorEl.addEventListener('dragstart', onDragStart, false);
        editorEl.addEventListener('dragend', onDragEnd, false);
        editorEl.addEventListener('dragover', onDragOver);
        editorEl.addEventListener('drop', onDrop);

        quizDragCleanupRef.current = () => {
            editorEl.removeEventListener('dragstart', onDragStart, false);
            editorEl.removeEventListener('dragend', onDragEnd, false);
            editorEl.removeEventListener('dragover', onDragOver);
            editorEl.removeEventListener('drop', onDrop);
            quizDragCleanupRef.current = null;
        };

        bindQuizWizardDelegation(editorEl);
        Array.from(editorEl.getElementsByClassName('arborito-quiz-edit')).forEach((block) => {
            ensureAndBindQuizWizard(block);
        });
        Array.from(editorEl.getElementsByClassName('arborito-game-edit')).forEach((block) => {
            bindGameBlockControls(block);
        });
        if (!quizObserverRef.current) {
            quizObserverRef.current = new MutationObserver(() => {
                Array.from(editorEl.getElementsByClassName('arborito-quiz-edit')).forEach((block) => {
                    ensureAndBindQuizWizard(block);
                });
                Array.from(editorEl.getElementsByClassName('arborito-game-edit')).forEach((block) => {
                    bindGameBlockControls(block);
                });
            });
            quizObserverRef.current.observe(editorEl, { childList: true, subtree: true });
        }

        const contentArea = contentAreaRef?.current;
        if (contentArea) contentArea.scrollTop = 0;

        return () => {
            document.removeEventListener('selectionchange', onSelectionChange);
            document.removeEventListener('mousedown', onToolbarPress, true);
            document.removeEventListener('pointerdown', onToolbarPress, true);
            document.removeEventListener('touchstart', onToolbarPress, true);
            editorEl.removeEventListener('input', onNestedFieldInput, true);
            editorEl.removeEventListener('change', onNestedFieldInput, true);
            editorEl.removeEventListener('touchend', onEditorTap);
            editorEl.removeEventListener('click', onEditorTap);
            editorEl.removeEventListener('click', onEditorChromeClick, true);
            quizDragCleanupRef.current?.();
            quizDragCleanupRef.current = null;
        };
    }, [
        editorRef,
        contentAreaRef,
        panel.currentNode?.id,
        panel.activeSectionIndex,
        constructApiRef,
        isLessonConstructEdit,
        lessonEditor.markUserEdited,
        lessonEditor.pushHistory,
        lessonEditor.savedRangeRef,
    ]);
}
