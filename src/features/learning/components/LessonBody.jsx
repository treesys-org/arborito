import { useLayoutEffect } from 'react';
import { isMediaSrcBlocked } from '../../privacy-gdpr/api/third-party-media.js';
import { ContentBlock } from './ContentBlock.jsx';
import { LessonQuiz } from './LessonQuiz.jsx';
import { applyEditorSectionMarkdown } from '../../editor/index.js';

/** Lesson prose frame + optional visual editor (construction) + quiz footer. */
export function LessonBody({
    editorRef,
    constructEdit,
    constructSectionMd,
    constructExtraHtml,
    activeSectionIndex,
    activeBlocks,
    allBlocks,
    toc,
    quizStates,
    quizSession,
    currentNode,
    isExam,
    quizActions,
    onViewCertificate,
    onGameLaunch
}) {
    /* Populate the contentEditable shell synchronously after mount / section
     * change. Doing this in a parent useEffect (useLessonConstructDnD) raced
     * with React re-renders and often left the editor empty (border only). */
    useLayoutEffect(() => {
        if (!constructEdit) return;
        const el = editorRef?.current;
        if (!el) return;
        const sectionMd = constructSectionMd || '';
        const extraHtml = constructExtraHtml || '';
        const seedKey = `${activeSectionIndex}\u0001${sectionMd}\u0001${extraHtml}`;
        if (el.dataset.arboritoEditorSeed === seedKey && el.childNodes.length > 0) {
            return;
        }
        applyEditorSectionMarkdown(el, sectionMd, { extraHtml });
        el.dataset.arboritoEditorSeed = seedKey;
        if (extraHtml) {
            const quizEl = el.getElementsByClassName('arborito-quiz-edit')[0];
            quizEl?.setAttribute('data-quiz-meta-proxy', '1');
        }
    }, [constructEdit, constructSectionMd, constructExtraHtml, activeSectionIndex, editorRef]);

    if (constructEdit) {
        return (
            <div
                ref={editorRef}
                id="lesson-visual-editor"
                className="prose prose-slate dark:prose-invert prose-base max-w-none w-full min-h-[12rem] p-4 sm:p-5 rounded-xl border border-amber-200/60 dark:border-amber-500/25 bg-white dark:bg-slate-900/95 outline-none leading-7 text-slate-800 dark:text-slate-100 select-text cursor-text"
                contentEditable
                tabIndex={0}
                role="textbox"
                aria-multiline="true"
                spellCheck={false}
                suppressContentEditableWarning
            />
        );
    }

    const sectionBlocks = activeBlocks.filter((b) => b.type !== 'quiz');

    return (
        <div className="prose prose-slate dark:prose-invert prose-base max-w-none select-text cursor-text">
            {sectionBlocks.map((block, i) => (
                <ContentBlock
                    key={block.id || `${block.type}-${i}`}
                    block={block}
                    isMediaSrcBlocked={isMediaSrcBlocked}
                    onGameLaunch={onGameLaunch}
                />
            ))}
            <LessonQuiz
                allBlocks={allBlocks}
                toc={toc}
                activeSectionIndex={activeSectionIndex}
                quizStates={quizStates}
                quizSession={quizSession}
                currentNode={currentNode}
                isExam={isExam}
                constructEdit={constructEdit}
                quizActions={quizActions}
                onViewCertificate={onViewCertificate}
            />
        </div>
    );
}
