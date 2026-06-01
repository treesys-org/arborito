import { store } from '../../../core/store.js';
import {
    BLOCKS,
    parseArboritoFile,
    markdownToVisualHTML
} from '../editor-engine.js';
import { execCmdOnEditor, insertBlockInEditor } from '../editor-commands.js';
import {
    bodyMarkdownHasQuizV2Block,
    isQuizV2ChallengeComplete
} from '../../learning/quiz-v2-status.js';
import { metaQuizBelongsOnSectionIndex } from '../../learning/lesson-section-slices.js';
import {
    ensureAndBindQuizV2Wizard,
    bindQuizV2WizardDelegation
} from '../quiz-v2-wizard.js';

/**
 * Drag-and-drop event wiring for the lesson editor: shell-editor binding
 * (toolbar, format/insert panels, undo/save buttons, selection capture)
 * and the Quiz V2 block drag handlers (touch/mouse).
 */
export const dndBindingsMixin = {
    _bindLessonShellEditor() {
        const editorEl = this.querySelector('#lesson-visual-editor');
        if (!editorEl || !this._isLessonConstructEdit()) return;

        if (typeof this._lessonInsertMenuCleanup === 'function') {
            this._lessonInsertMenuCleanup();
            this._lessonInsertMenuCleanup = null;
        }

        const node = store.findNode(this.currentNode.id) || this.currentNode;
        if (this._lessonDraftLessonId !== node.id) {
            this._lessonDraftLessonId = node.id;
            this._lessonBodyMarkdown = null;
            this._lessonHistoryStack = [];
            this._tocInlineEditIdx = null;
        }

        const parsed = parseArboritoFile(node.content || '');
        const fullBodyMd = this._lessonBodyMarkdown !== null ? this._lessonBodyMarkdown : parsed.body;
        const bodyMd = this._getConstructEditorSectionMarkdown();
        this._constructEditorBoundSection = this.activeSectionIndex;
        editorEl.classList.add('arborito-lesson-editor--ghost-outline');
        let editorHtml = markdownToVisualHTML(bodyMd, { authoringGhostOutline: true });
        const c = parsed.meta && parsed.meta.challenge;
        if (
            isQuizV2ChallengeComplete(c) &&
            !bodyMarkdownHasQuizV2Block(fullBodyMd) &&
            metaQuizBelongsOnSectionIndex(fullBodyMd, this.activeSectionIndex)
        ) {
            editorHtml += BLOCKS.quizv2(
                c.core_concept,
                c.short_definition,
                c.main_question,
                c.correct_answer,
                c.traps || []
            );
        }
        editorEl.innerHTML = editorHtml;
        this._assignHeadingIdsFromBlocks(editorEl, bodyMd);

        const undoBtn = this.querySelector('#btn-lesson-undo');
        if (undoBtn) {
            undoBtn.disabled = this._lessonHistoryStack.length === 0;
            undoBtn.style.opacity = undoBtn.disabled ? '0.5' : '1';
            undoBtn.onclick = () => this._lessonUndo(editorEl);
        }

        /** Prevents focus moving to toolbar button and losing contenteditable selection. */
        const restoreLessonEditorSelection = () => {
            const saved = this._lessonEditorSavedRange;
            if (!saved || !editorEl.isConnected) return;
            try {
                if (!editorEl.contains(saved.commonAncestorContainer)) return;
                editorEl.focus();
                const sel = window.getSelection();
                if (!sel) return;
                sel.removeAllRanges();
                sel.addRange(saved.cloneRange());
            } catch {
                /* invalid range after DOM mutation */
            }
        };

        this._lessonOnSelectionChange = () => {
            try {
                const sel = window.getSelection();
                if (!(sel && sel.rangeCount)) return;
                const r = sel.getRangeAt(0);
                if (editorEl.contains(r.commonAncestorContainer)) {
                    this._lessonEditorSavedRange = r.cloneRange();
                }
            } catch {
                /* ignore */
            }
        };
        document.addEventListener('selectionchange', this._lessonOnSelectionChange);

        this._lessonToolbarMousedownKeepSel = (ev) => {
            const t = ev.target;
            if (!(t instanceof Element)) return;
            if (
                !t.closest(
                    '#lesson-editor-format-panel, #lesson-editor-insert-panel, .arborito-lesson-actions--construct'
                )
            ) {
                return;
            }
            if (t.closest('button, .tool-btn, .block-btn, [role="menuitem"]')) {
                ev.preventDefault();
            }
        };
        document.addEventListener('mousedown', this._lessonToolbarMousedownKeepSel, true);

        const chainLessonToolbarSelCleanup = (prev) => {
            const prevCleanup = typeof prev === 'function' ? prev : null;
            return () => {
                if (prevCleanup) prevCleanup();
                document.removeEventListener('selectionchange', this._lessonOnSelectionChange);
                document.removeEventListener('mousedown', this._lessonToolbarMousedownKeepSel, true);
                this._lessonOnSelectionChange = null;
                this._lessonToolbarMousedownKeepSel = null;
            };
        };

        this.querySelectorAll('.arborito-lesson-actions--construct .tool-btn:not(#btn-lesson-undo)').forEach((btn) => {
            btn.onclick = () => {
                this._pushLessonHistory(editorEl);
                editorEl.focus();
                restoreLessonEditorSelection();
                execCmdOnEditor(editorEl, btn.dataset.cmd, btn.dataset.val);
            };
        });

        const formatToggle = this.querySelector('.lesson-editor-format-toggle');
        const formatPanel = this.querySelector('#lesson-editor-format-panel');
        const formatPanelHome = (formatPanel && formatPanel.parentElement) || null;
        const formatPanelNextSibling = (formatPanel && formatPanel.nextSibling) || null;
        const positionFormatPanel = () => {
            if (!formatToggle || !formatPanel) return;
            const r = formatToggle.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const gap = 6;
            const panelW = Math.min(formatPanel.offsetWidth || 288, vw - 16);
            const desiredLeft = r.left;
            const left = Math.max(8, Math.min(desiredLeft, vw - panelW - 8));
            const panelH = formatPanel.offsetHeight || 0;
            const belowTop = r.bottom + gap;
            const top = belowTop + panelH > vh - 8 && r.top - gap - panelH > 8
                ? Math.max(8, r.top - gap - panelH)
                : belowTop;
            formatPanel.style.position = 'fixed';
            formatPanel.style.left = `${Math.round(left)}px`;
            formatPanel.style.top = `${Math.round(top)}px`;
            formatPanel.style.maxWidth = `${Math.round(Math.min(320, vw - 16))}px`;
            formatPanel.style.zIndex = '2147483647';
        };
        const closeFormatPanel = () => {
            if (!formatPanel) return;
            formatPanel.classList.add('hidden');
            if (formatToggle) formatToggle.setAttribute('aria-expanded', 'false');
            formatPanel.style.position = '';
            formatPanel.style.left = '';
            formatPanel.style.top = '';
            formatPanel.style.maxWidth = '';
            formatPanel.style.zIndex = '';
            if (formatPanel.parentElement === document.body) {
                if (formatPanelHome && formatPanelHome.isConnected) {
                    formatPanelHome.insertBefore(formatPanel, formatPanelNextSibling);
                } else {
                    formatPanel.remove();
                }
            }
        };
        if (formatToggle && formatPanel) {
            formatToggle.onclick = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const opening = formatPanel.classList.contains('hidden');
                if (opening) {
                    if (formatPanel.parentElement !== document.body) {
                        document.body.appendChild(formatPanel);
                    }
                    formatPanel.classList.remove('hidden');
                    formatToggle.setAttribute('aria-expanded', 'true');
                    requestAnimationFrame(positionFormatPanel);
                } else {
                    closeFormatPanel();
                }
            };
            const onDocDownFmt = (ev) => {
                if (!formatPanel || formatPanel.classList.contains('hidden')) return;
                const t = ev.target;
                if (t instanceof Node && (formatPanel.contains(t) || formatToggle.contains(t))) return;
                closeFormatPanel();
            };
            const onRepositionFmt = () => {
                if (formatPanel.classList.contains('hidden')) return;
                positionFormatPanel();
            };
            const onKeyFmt = (ev) => {
                if (ev.key === 'Escape' && !formatPanel.classList.contains('hidden')) closeFormatPanel();
            };
            document.addEventListener('mousedown', onDocDownFmt, true);
            document.addEventListener('touchstart', onDocDownFmt, true);
            window.addEventListener('resize', onRepositionFmt);
            window.addEventListener('scroll', onRepositionFmt, true);
            document.addEventListener('keydown', onKeyFmt);
            const prevCleanup = this._lessonInsertMenuCleanup;
            this._lessonInsertMenuCleanup = () => {
                if (typeof prevCleanup === 'function') prevCleanup();
                document.removeEventListener('mousedown', onDocDownFmt, true);
                document.removeEventListener('touchstart', onDocDownFmt, true);
                window.removeEventListener('resize', onRepositionFmt);
                window.removeEventListener('scroll', onRepositionFmt, true);
                document.removeEventListener('keydown', onKeyFmt);
                closeFormatPanel();
            };
        }

        /* Chain selection/toolbar cleanup onto current cleanup (e.g. format panel). */
        this._lessonInsertMenuCleanup = chainLessonToolbarSelCleanup(this._lessonInsertMenuCleanup);

        const insertToggle = this.querySelector('.lesson-editor-insert-toggle');
        const insertPanel = this.querySelector('#lesson-editor-insert-panel');
        /*
         * Insert panel failed because it lived inside `.lesson-editor-toolbar-row--primary`
         * with mobile `overflow-x-auto` (clipped absolute). Port to `document.body` with
         * `position: fixed` — escapes clipping and always stacks above content.
         */
        const insertPanelHome = (insertPanel && insertPanel.parentElement) || null;
        const insertPanelNextSibling = (insertPanel && insertPanel.nextSibling) || null;
        const positionInsertPanel = () => {
            if (!insertToggle || !insertPanel) return;
            const r = insertToggle.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const gap = 6;
            const panelW = Math.min(insertPanel.offsetWidth || 288, vw - 16);
            const desiredLeft = r.left;
            const left = Math.max(8, Math.min(desiredLeft, vw - panelW - 8));
            const panelH = insertPanel.offsetHeight || 0;
            const belowTop = r.bottom + gap;
            const top = belowTop + panelH > vh - 8 && r.top - gap - panelH > 8
                ? Math.max(8, r.top - gap - panelH)
                : belowTop;
            insertPanel.style.position = 'fixed';
            insertPanel.style.left = `${Math.round(left)}px`;
            insertPanel.style.top = `${Math.round(top)}px`;
            insertPanel.style.maxWidth = `${Math.round(Math.min(288, vw - 16))}px`;
            insertPanel.style.zIndex = '2147483647';
        };
        const closeInsertPanel = () => {
            if (!insertPanel) return;
            insertPanel.classList.add('hidden');
            if (insertToggle instanceof Element) {
                insertToggle.setAttribute('aria-expanded', 'false');
            }
            insertPanel.style.position = '';
            insertPanel.style.left = '';
            insertPanel.style.top = '';
            insertPanel.style.maxWidth = '';
            insertPanel.style.zIndex = '';
            if (insertPanel.parentElement === document.body) {
                if (insertPanelHome && insertPanelHome.isConnected) {
                    insertPanelHome.insertBefore(insertPanel, insertPanelNextSibling);
                } else {
                    /* Tree repainted: original slot gone; remove orphaned portal. */
                    insertPanel.remove();
                }
            }
        };
        if (insertToggle && insertPanel) {
            insertToggle.onclick = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const opening = insertPanel.classList.contains('hidden');
                if (opening) {
                    if (insertPanel.parentElement !== document.body) {
                        document.body.appendChild(insertPanel);
                    }
                    insertPanel.classList.remove('hidden');
                    insertToggle.setAttribute('aria-expanded', 'true');
                    requestAnimationFrame(positionInsertPanel);
                } else {
                    closeInsertPanel();
                }
            };
            const onDocDown = (ev) => {
                if (!insertPanel || insertPanel.classList.contains('hidden')) return;
                const t = ev.target;
                if (t instanceof Node && (insertPanel.contains(t) || insertToggle.contains(t))) return;
                closeInsertPanel();
            };
            const onReposition = () => {
                if (insertPanel.classList.contains('hidden')) return;
                positionInsertPanel();
            };
            const onKey = (ev) => {
                if (ev.key === 'Escape' && !insertPanel.classList.contains('hidden')) closeInsertPanel();
            };
            document.addEventListener('mousedown', onDocDown, true);
            document.addEventListener('touchstart', onDocDown, true);
            window.addEventListener('resize', onReposition);
            window.addEventListener('scroll', onReposition, true);
            document.addEventListener('keydown', onKey);
            const prevInsertCleanup = this._lessonInsertMenuCleanup;
            this._lessonInsertMenuCleanup = () => {
                if (typeof prevInsertCleanup === 'function') prevInsertCleanup();
                document.removeEventListener('mousedown', onDocDown, true);
                document.removeEventListener('touchstart', onDocDown, true);
                window.removeEventListener('resize', onReposition);
                window.removeEventListener('scroll', onReposition, true);
                document.removeEventListener('keydown', onKey);
                closeInsertPanel();
            };
        }

        this.querySelectorAll('.arborito-lesson-actions--construct .block-btn').forEach((btn) => {
            btn.onclick = () => {
                this._pushLessonHistory(editorEl);
                insertBlockInEditor(editorEl, btn.dataset.type);
                closeInsertPanel();
            };
        });

        const quizShortcut = this.querySelector('#btn-insert-quizv2');
        if (quizShortcut) {
            quizShortcut.onclick = () => {
                this._pushLessonHistory(editorEl);
                insertBlockInEditor(editorEl, 'quizv2');
            };
        }

        const saveBtn = this.querySelector('#btn-lesson-save');
        if (saveBtn) {
            saveBtn.onclick = () => void this._saveLessonShell();
            this._setLessonSaveButtonSavedVisual(saveBtn, this._lessonSaveState === 'saved');
        }

        editorEl.oninput = () => {
            this._refreshLessonSaveButton();
        };

        this._bindQuizV2BlockDrag(editorEl);

        const contentArea = this.querySelector('#content-area');
        if (contentArea) contentArea.scrollTop = 0;
    },

    _bindQuizV2BlockDrag(editorEl) {
        if (typeof this._quizV2DragCleanup === 'function') {
            try {
                this._quizV2DragCleanup();
            } catch {
                /* ignore */
            }
            this._quizV2DragCleanup = null;
        }
        if (!editorEl || !this._isLessonConstructEdit()) return;

        /** @type {HTMLElement | null} */
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
            const handle = t.closest('.arborito-quizv2-drag-handle');
            if (!handle || !editorEl.contains(handle)) return;
            const block = handle.closest('.arborito-quizv2-edit');
            if (!(block instanceof HTMLElement) || !editorEl.contains(block)) return;
            dragBlock = block;
            try {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', 'arborito-quizv2');
            } catch {
                /* ignore */
            }
            block.classList.add('arborito-quizv2-edit--dragging');
        };

        const onDragEnd = () => {
            if (dragBlock) dragBlock.classList.remove('arborito-quizv2-edit--dragging');
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
            this._pushLessonHistory(editorEl);
            if (beforeEl == null) editorEl.appendChild(dragBlock);
            else editorEl.insertBefore(dragBlock, beforeEl);
            dragBlock.classList.remove('arborito-quizv2-edit--dragging');
            dragBlock = null;
            editorEl.dispatchEvent(new Event('input', { bubbles: true }));
        };

        editorEl.addEventListener('dragstart', onDragStart, false);
        editorEl.addEventListener('dragend', onDragEnd, false);
        editorEl.addEventListener('dragover', onDragOver);
        editorEl.addEventListener('drop', onDrop);

        this._quizV2DragCleanup = () => {
            editorEl.removeEventListener('dragstart', onDragStart, false);
            editorEl.removeEventListener('dragend', onDragEnd, false);
            editorEl.removeEventListener('dragover', onDragOver);
            editorEl.removeEventListener('drop', onDrop);
            this._quizV2DragCleanup = null;
        };

        bindQuizV2WizardDelegation(editorEl);
        editorEl.querySelectorAll('.arborito-quizv2-edit').forEach((block) => {
            ensureAndBindQuizV2Wizard(block);
        });
        if (!this._quizV2WizardObserver) {
            this._quizV2WizardObserver = new MutationObserver(() => {
                editorEl.querySelectorAll('.arborito-quizv2-edit').forEach((block) => {
                    ensureAndBindQuizV2Wizard(block);
                });
            });
            this._quizV2WizardObserver.observe(editorEl, { childList: true, subtree: true });
        }
    }
};
