import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bindQuizWizardDelegation, ensureAndBindQuizWizard } from '../hooks/useQuizWizard.jsx';
import {
    captureEditorSelection,
    isLessonEditorFormatToolbarControl,
    isLessonEditorToolbarControl,
    isLessonEditorToolbarDropdownToggle,
    shouldKeepSavedEditorSelection,
} from '../api/editor-selection.js';
import { bindGameBlockControls, handleGameBlockAction } from '../api/logic/editor-game-block.js';
import { bindMediaBlockControls } from '../api/logic/editor-media-block.js';
import { bindTableBlockControls } from '../api/logic/editor-table.js';
import { markConstructBodyEdited } from '../api/logic/lesson-construct-capture.js';
import { handleLessonEditorListKeydown } from '../api/editor-list-keymap.js';

function isEditorChromeTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.closest('.arborito-callout-edit')) return false;
    if (target.closest('.arborito-table-edit__cell')) return false;
    if (target.closest('.arborito-code-input')) return false;
    return !!target.closest(
        'button, input, select, textarea, .remove-btn, .arborito-quiz-edit, .edit-block-wrapper, .game-picker-panel, details'
    );
}

function resolveConstructEditorEl(editorRef) {
    const el = editorRef?.current;
    if (el?.isConnected) return el;
    const byId = document.getElementById('lesson-visual-editor');
    return byId?.isConnected ? byId : el || byId || null;
}

function focusEditorCaret(editorEl, clientX, clientY) {
    if (!(editorEl instanceof HTMLElement)) return;
    editorEl.focus({ preventScroll: true });
    try {
        if (typeof document.caretRangeFromPoint === 'function') {
            const range = document.caretRangeFromPoint(clientX, clientY);
            if (range && editorEl.contains(range.startContainer)) {
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
                return;
            }
        }
        if (typeof document.caretPositionFromPoint === 'function') {
            const pos = document.caretPositionFromPoint(clientX, clientY);
            if (pos && editorEl.contains(pos.offsetNode)) {
                const range = document.createRange();
                range.setStart(pos.offsetNode, pos.offset);
                range.collapse(true);
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
    constructActive = false,
    editorShellEpoch = 0,
    lessonEditor
}) {
    const quizDragCleanupRef = useRef(null);
    const quizObserverRef = useRef(null);
    const [shellRev, setShellRev] = useState(0);

    useEffect(() => {
        const bump = () => {
            if (!isLessonConstructEdit()) return;
            setShellRev((n) => n + 1);
        };
        window.addEventListener('arborito-viewport', bump);
        window.addEventListener('arborito-lesson-edit-enter', bump);
        window.addEventListener('arborito-lesson-editor-mounted', bump);
        window.addEventListener('pageshow', bump);
        const onVisible = () => {
            if (document.visibilityState === 'visible') bump();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.removeEventListener('arborito-viewport', bump);
            window.removeEventListener('arborito-lesson-edit-enter', bump);
            window.removeEventListener('arborito-lesson-editor-mounted', bump);
            window.removeEventListener('pageshow', bump);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [isLessonConstructEdit]);

    useLayoutEffect(() => {
        const editorEl = resolveConstructEditorEl(editorRef);
        if (!editorEl || !constructActive || !panel.currentNode) {
            quizDragCleanupRef.current?.();
            quizDragCleanupRef.current = null;
            return undefined;
        }

        const api = constructApiRef.current;
        const { markUserEdited } = lessonEditor;

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
            if (isLessonEditorToolbarDropdownToggle(ev.target)) return;
            if (!isLessonEditorToolbarControl(ev.target)) return;
            const sel = window.getSelection();
            const r = sel?.rangeCount ? sel.getRangeAt(0) : null;
            const saved = lessonEditor.savedRangeRef.current;
            if (!shouldKeepSavedEditorSelection(editorEl, saved, r)) {
                captureEditorSelection(editorEl, lessonEditor.savedRangeRef);
            }
            /* Mouse only: preventDefault keeps the editor selection, but on touch it
               also suppresses the synthetic click — format/Aa menu items look dead. */
            if (
                isLessonEditorFormatToolbarControl(ev.target) &&
                (ev.type === 'mousedown' ||
                    (ev.type === 'pointerdown' && ev.pointerType === 'mouse'))
            ) {
                ev.preventDefault();
            }
        };
        document.addEventListener('mousedown', onToolbarPress, true);
        document.addEventListener('pointerdown', onToolbarPress, true);
        document.addEventListener('touchstart', onToolbarPress, { capture: true, passive: true });

        const touchEditorDirty = () => {
            markConstructBodyEdited(editorEl, { markUserEdited });
        };

        editorEl.oninput = () => touchEditorDirty();

        const onNestedFieldInput = (e) => {
            const t = e.target;
            if (
                t instanceof HTMLInputElement ||
                t instanceof HTMLSelectElement ||
                t instanceof HTMLTextAreaElement
            ) {
                if (editorEl.contains(t)) touchEditorDirty();
            }
        };
        editorEl.addEventListener('input', onNestedFieldInput, true);
        editorEl.addEventListener('change', onNestedFieldInput, true);

        const onListKeydown = (e) => {
            if (handleLessonEditorListKeydown(e, editorEl)) {
                touchEditorDirty();
                editorEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };
        editorEl.addEventListener('keydown', onListKeydown);

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
            /*
             * Click on the host padding (empty lesson / short prose): native caret often
             * never appears — only the first line of a lonely <p><br></p> was hittable.
             */
            const hitHostPadding = target === editorEl;
            if ((e.pointerType === 'mouse' || e.type === 'mousedown') && !hitHostPadding) {
                try {
                    editorEl.focus({ preventScroll: true });
                } catch {
                    /* ignore */
                }
                return;
            }
            try {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) return;
            } catch {
                /* ignore */
            }
            if (hitHostPadding) {
                try {
                    e.preventDefault();
                } catch {
                    /* ignore */
                }
            }
            focusEditorCaret(editorEl, e.clientX, e.clientY);
        };
        editorEl.addEventListener('pointerdown', onEditorTap);

        const onEditorChromeClick = (e) => {
            const target = e.target;
            if (!(target instanceof Element)) return;

            if (target.closest('.remove-btn')) {
                const block = target.closest(
                    '.edit-block-wrapper, .arborito-quiz-edit, .arborito-callout-edit, .arborito-game-edit, .arborito-media-edit, .arborito-table-edit'
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
                touchEditorDirty();
            }
        };
        editorEl.addEventListener('click', onEditorChromeClick, true);

        const onPushHistory = () => {
            lessonEditor.pushHistory(editorEl);
        };
        editorEl.addEventListener('arborito-construct-push-history', onPushHistory);

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
        Array.from(editorEl.getElementsByClassName('arborito-media-edit')).forEach((block) => {
            bindMediaBlockControls(block);
        });
        Array.from(editorEl.getElementsByClassName('arborito-table-edit')).forEach((block) => {
            bindTableBlockControls(block);
        });
        if (!quizObserverRef.current) {
            let observerTimer = null;
            const bindAddedBlocks = (nodes) => {
                for (const node of nodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    const blocks = node.matches(
                        '.arborito-quiz-edit, .arborito-game-edit, .arborito-media-edit, .arborito-table-edit'
                    )
                        ? [node]
                        : [
                              ...node.querySelectorAll(
                                  '.arborito-quiz-edit, .arborito-game-edit, .arborito-media-edit, .arborito-table-edit'
                              ),
                          ];
                    for (const block of blocks) {
                        if (block.classList.contains('arborito-quiz-edit')) {
                            ensureAndBindQuizWizard(block);
                        } else if (block.classList.contains('arborito-game-edit')) {
                            bindGameBlockControls(block);
                        } else if (block.classList.contains('arborito-media-edit')) {
                            bindMediaBlockControls(block);
                        } else if (block.classList.contains('arborito-table-edit')) {
                            bindTableBlockControls(block);
                        }
                    }
                }
            };
            quizObserverRef.current = new MutationObserver((mutations) => {
                const added = [];
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (node instanceof HTMLElement) added.push(node);
                    }
                }
                if (!added.length) return;
                clearTimeout(observerTimer);
                observerTimer = setTimeout(() => bindAddedBlocks(added), 0);
            });
        }
        quizObserverRef.current.disconnect();
        quizObserverRef.current.observe(editorEl, { childList: true, subtree: true });

        return () => {
            document.removeEventListener('selectionchange', onSelectionChange);
            document.removeEventListener('mousedown', onToolbarPress, true);
            document.removeEventListener('pointerdown', onToolbarPress, true);
            document.removeEventListener('touchstart', onToolbarPress, true);
            editorEl.removeEventListener('input', onNestedFieldInput, true);
            editorEl.removeEventListener('change', onNestedFieldInput, true);
            editorEl.removeEventListener('keydown', onListKeydown);
            editorEl.removeEventListener('pointerdown', onEditorTap);
            editorEl.removeEventListener('click', onEditorChromeClick, true);
            editorEl.removeEventListener('arborito-construct-push-history', onPushHistory);
            quizDragCleanupRef.current?.();
            quizDragCleanupRef.current = null;
            try {
                quizObserverRef.current?.disconnect();
            } catch {
                /* ignore */
            }
        };
    }, [
        editorRef,
        contentAreaRef,
        panel.currentNode?.id,
        panel.activeSectionIndex,
        constructApiRef,
        constructActive,
        editorShellEpoch,
        shellRev,
        lessonEditor.markUserEdited,
        lessonEditor.pushHistory,
        lessonEditor.savedRangeRef,
    ]);
}
