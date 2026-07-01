import { useEffect, useState } from 'react';
import { useLearningStore } from './useLearning.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { insertBlockInEditor } from '../../editor/api/editor-commands.js';
import { useLessonEditorToc } from '../../editor/components/LessonEditorToc.jsx';
import { useLessonConstructDnD } from '../../editor/components/LessonConstructDnD.jsx';
import { syncLessonToolbarScroll, teardownLessonToolbarScroll } from '../api/lesson-toolbar-scroll.js';

/** Editor-only effects (TOC DnD, construct toolbar scroll, magic quiz insert). */
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
        setTocDropTarget
    } = ctx;

    useLessonEditorToc({
        tocNavRef,
        tocScrollRef,
        panel,
        constructApiRef,
        isLessonConstructEdit,
        patchPanel,
        scheduleUpdate,
        getContentForTocParse: parseApi.getContentForTocParse,
        getLessonParseModel: parseApi.getLessonParseModel,
        setTocDropTarget
    });

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
            if (!isLessonConstructEdit() || !panel.currentNode) return;
            const editorEl = lessonEditor.getEditorEl?.();
            if (!editorEl) return;
            lessonEditor.pushHistory(editorEl);
            insertBlockInEditor(editorEl, 'quiz');
            patchPanel({ lessonUserHasEdited: true });
        };
        store.addEventListener('arborito-lesson-magic-open', onMagic);
        return () => store.removeEventListener('arborito-lesson-magic-open', onMagic);
    }, [isLessonConstructEdit, panel.currentNode, patchPanel, lessonEditor]);

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
        const { speakText, stopSpeaking, isReadAloudActive, textFromLessonSectionEl } = await import('../api/read-aloud.js' );
        if (isReadAloudActive()) {
            stopSpeaking();
            setSpeaking(false);
            return;
        }
        const frame = proseFrameRef.current;
        if (!frame) return;
        setSpeaking(true);
        try {
            await speakText(textFromLessonSectionEl(frame));
        } finally {
            setSpeaking(false);
        }
    };

    return { speaking, toggleRead };
}
