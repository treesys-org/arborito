import { useEffect, useLayoutEffect, useState } from 'react';
import { useLearningStore } from './useLearning.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import {
    ensureLessonInsertToolbarDelegation,
    performLessonInsertBlock,
    setLessonInsertContext,
} from '../../editor/api/lesson-insert-block.js';
import { useLessonConstructDnD } from '../../editor/components/LessonConstructDnD.jsx';
import { syncLessonToolbarScroll, teardownLessonToolbarScroll } from '../api/lesson-toolbar-scroll.js';
import {
    scrollLessonContentToQuiz,
    pulseTocRowAttention,
    scrollTocRowIntoView
} from '../api/content-panel-scroll.js';

/** Editor-only effects (construct toolbar scroll, magic quiz insert). */
export function useContentEffects(rootRef, ctx) {
    const store = useLearningStore();
    const {
        panel,
        constructApiRef,
        scheduleUpdate,
        patchPanel,
        isLessonConstructEdit,
        parseApi,
        lessonEditor,
        contentAreaRef,
        editorRef,
        tocNavRef,
        tocScrollRef,
        lastRenderSectionRef,
        contentScrollSnapshotRef,
        pendingQuizScrollRef,
        pendingTocAttentionIdxRef,
        scrollTocOnRenderRef,
    } = ctx;

    useLayoutEffect(() => {
        if (!panel.currentNode) return;

        const sectionChanged = lastRenderSectionRef.current !== panel.activeSectionIndex;
        if (sectionChanged) {
            const area = contentAreaRef?.current;
            if (area && !isLessonConstructEdit()) {
                if (contentScrollSnapshotRef.current != null) {
                    area.scrollTop = contentScrollSnapshotRef.current;
                    contentScrollSnapshotRef.current = null;
                } else if (!pendingQuizScrollRef.current) {
                    area.scrollTop = 0;
                }
            }
            lastRenderSectionRef.current = panel.activeSectionIndex;
        }

        if (scrollTocOnRenderRef.current) {
            scrollTocOnRenderRef.current = false;
            scrollTocRowIntoView(tocScrollRef?.current, tocNavRef?.current, panel.activeSectionIndex);
        }

        const attentionIdx = pendingTocAttentionIdxRef.current;
        if (attentionIdx != null && attentionIdx >= 0) {
            pendingTocAttentionIdxRef.current = null;
            pulseTocRowAttention(tocNavRef?.current, attentionIdx);
        }

        if (pendingQuizScrollRef.current) {
            pendingQuizScrollRef.current = false;
            scrollLessonContentToQuiz(contentAreaRef?.current);
        }
    }, [
        panel.currentNode,
        panel.activeSectionIndex,
        isLessonConstructEdit,
        contentAreaRef,
        tocNavRef,
        tocScrollRef,
        lastRenderSectionRef,
        contentScrollSnapshotRef,
        pendingQuizScrollRef,
        pendingTocAttentionIdxRef,
        scrollTocOnRenderRef
    ]);

    const insertCtx = { panel, lessonEditor, editorRef, patchPanel, getLessonBodyForToc: parseApi.getLessonBodyForToc };

    useEffect(() => {
        setLessonInsertContext(insertCtx);
    }, [lessonEditor, editorRef, patchPanel, panel, parseApi.getLessonBodyForToc]);

    useEffect(() => {
        if (!isLessonConstructEdit()) return;
        ensureLessonInsertToolbarDelegation();
    }, [isLessonConstructEdit]);

    useLessonConstructDnD({
        editorRef,
        contentAreaRef,
        panel,
        constructApiRef,
        isLessonConstructEdit,
        patchPanel,
        lessonEditor
    });

    useEffect(() => {
        const onBreakpoint = () => {
            patchPanel({ isTocVisible: false });
            scheduleUpdate(true);
        };
        window.addEventListener('arborito-viewport', onBreakpoint);
        return () => window.removeEventListener('arborito-viewport', onBreakpoint);
    }, [patchPanel, scheduleUpdate]);

    useEffect(() => {
        const onMagic = () => {
            performLessonInsertBlock('quiz', insertCtx);
        };
        store.addEventListener('arborito-lesson-magic-open', onMagic);
        return () => store.removeEventListener('arborito-lesson-magic-open', onMagic);
    }, [store, lessonEditor, editorRef, patchPanel, panel]);

    useEffect(() => {
        const root = rootRef.current;
        if (!root || !panel.currentNode) return undefined;
        teardownLessonToolbarScroll(root);
        if (shouldShowMobileUI()) syncLessonToolbarScroll(root);
        return () => teardownLessonToolbarScroll(root);
    }, [panel.currentNode, isLessonConstructEdit, rootRef]);
}

/** Read-aloud button state for LessonHeader. */
export function useReadAloudState(proseFrameRef) {
    const [speaking, setSpeaking] = useState(false);

    useEffect(() => {
        const onVoice = () => setSpeaking(false);
        import('../api/sage-voice.js' ).then(({ sageVoice }) => {
            const prev = sageVoice.onStateChange;
            sageVoice.onStateChange = () => {
                prev?.();
                setSpeaking(false);
            };
            return () => {
                sageVoice.onStateChange = prev || null;
            };
        });
    }, []);

    const toggleRead = async () => {
        const { speakText, stopSpeaking, isReadAloudActive, textFromLessonSectionEl } = await import('../api/read-aloud.js');
        const { plainTextForSpeech, primeWebSpeechForBrowser } = await import('../api/sage-voice.js');
        if (isReadAloudActive()) {
            stopSpeaking();
            setSpeaking(false);
            return;
        }
        const frame = proseFrameRef.current;
        if (!frame) return;
        let text = textFromLessonSectionEl(frame);
        if (!plainTextForSpeech(text)) {
            const inner =
                frame.querySelector('.arborito-lesson-section-body') ||
                frame.querySelector('[data-lesson-section]') ||
                frame.querySelector('article') ||
                frame.querySelector('.prose');
            if (inner) text = textFromLessonSectionEl(inner);
        }
        if (!plainTextForSpeech(text)) {
            const store = (await import('../../../core/store-singleton.js')).getArboritoStore();
            const ui = store?.ui || {};
            store?.notify?.(
                ui.sageVoiceReadEmpty ||
                    ui.sageVoiceEmpty ||
                    'There is no text to read in this section.',
                true
            );
            return;
        }
        setSpeaking(true);
        try {
            await primeWebSpeechForBrowser();
            await speakText(text);
        } catch (e) {
            const store = (await import('../../../core/store-singleton.js')).getArboritoStore();
            const { formatSageVoiceError } = await import('../api/sage-voice.js');
            const msg = formatSageVoiceError(e?.message ? String(e.message) : e, 'tts', store?.ui);
            if (msg && store?.notify) store.notify(msg, true);
        } finally {
            setSpeaking(false);
        }
    };

    return { speaking, toggleRead };
}
