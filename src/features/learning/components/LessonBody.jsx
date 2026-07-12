import { useLayoutEffect } from 'react';
import { isMediaSrcBlocked } from '../../privacy-gdpr/api/third-party-media.js';
import { ContentBlock } from './ContentBlock.jsx';
import { InlineQuizBlock } from './InlineQuizBlock.jsx';
import { applyEditorSectionMarkdown } from '../../editor/index.js';

/** Lesson prose frame + optional visual editor (construction) + inline quizzes. */
export function LessonBody({
    editorRef,
    constructEdit,
    constructSectionMd,
    activeSectionIndex,
    activeBlocks,
    nodeId,
    isExam = false,
    examPlayable = true,
    blockSessions,
    quizStates,
    quizPassRecord = {},
    quizActions,
    onStartBlock,
    onAdvanceBlock,
    onBackBlock,
    onDismissBlockSession,
    onViewCertificate,
    onGameLaunch,
    quizAttentionNonce = 0,
    topicCatalog = [],
    onMediaRetry,
}) {
    useLayoutEffect(() => {
        if (!constructEdit) return;
        const el = editorRef?.current;
        if (!el) return;
        const sectionMd = constructSectionMd || '';
        const seedKey = `${activeSectionIndex}\u0001${sectionMd}`;
        if (el.dataset.arboritoEditorSeed === seedKey && el.childNodes.length > 0) {
            return;
        }
        const boundSection = el.dataset.arboritoEditorSeed?.split('\u0001')[0];
        if (el.dataset.arboritoEditorDirty === '1' && boundSection === String(activeSectionIndex)) {
            return;
        }
        if (el.dataset.arboritoEditorDirty === '1') {
            delete el.dataset.arboritoEditorDirty;
        }
        applyEditorSectionMarkdown(el, sectionMd);
        el.dataset.arboritoEditorSeed = seedKey;
    }, [constructEdit, constructSectionMd, activeSectionIndex, editorRef]);

    if (constructEdit) {
        return (
            <div
                ref={editorRef}
                id="lesson-visual-editor"
                className="prose prose-slate dark:prose-invert prose-base max-w-none w-full min-h-[12rem] outline-none leading-7 text-slate-800 dark:text-slate-100 select-text cursor-text arborito-lesson-editor--wysiwyg"
                contentEditable
                tabIndex={0}
                role="textbox"
                aria-multiline="true"
                spellCheck={false}
                suppressContentEditableWarning
            />
        );
    }

    const quizVariant = isExam && examPlayable ? 'exam' : 'quiz';

    return (
        <div className="prose prose-slate dark:prose-invert prose-base max-w-none select-text cursor-text">
            {activeBlocks.map((block, i) => {
                if (block.type === 'quiz') {
                    return (
                        <InlineQuizBlock
                            key={block.id || `quiz-${i}`}
                            block={block}
                            nodeId={nodeId}
                            sectionIndex={activeSectionIndex}
                            variant={quizVariant}
                            isExam={isExam}
                            examPlayable={examPlayable}
                            blockSessions={blockSessions}
                            quizStates={quizStates}
                            quizPassRecord={quizPassRecord}
                            quizActions={quizActions}
                            onStartBlock={onStartBlock}
                            onAdvanceBlock={onAdvanceBlock}
                            onBackBlock={onBackBlock}
                            onDismissBlockSession={onDismissBlockSession}
                            onViewCertificate={onViewCertificate}
                            attentionNonce={quizAttentionNonce}
                        />
                    );
                }
                return (
                    <ContentBlock
                        key={block.id || `${block.type}-${i}`}
                        block={block}
                        isMediaSrcBlocked={isMediaSrcBlocked}
                        onGameLaunch={onGameLaunch}
                        topicCatalog={topicCatalog}
                        onMediaRetry={onMediaRetry}
                    />
                );
            })}
        </div>
    );
}
