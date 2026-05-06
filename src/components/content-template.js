import { store } from '../store.js';
import { fileSystem } from '../services/filesystem.js';
import { ContentRenderer } from '../utils/renderer.js';
import { getEditorToolbarInnerHtml } from '../utils/editor-toolbar-html.js';
import {
    getMediaConsentModalMarkup,
    getPendingExternalMediaDetails,
    isMediaSrcBlocked
} from '../utils/third-party-media.js';
import { NODE_PROPERTY_EMOJIS } from '../utils/node-property-emojis.js';
import { escHtml, escAttr } from '../utils/html-escape.js';

export function renderContentHtml(ctx, allBlocks, toc, filteredToc, activeBlocks, progress, isExam, onExamIntro) {
    const ui = store.ui;
    const isBookmarked = ctx.currentNode ? !!store.getBookmark(ctx.currentNode.id, ctx.currentNode.content) : false;

    const constructEdit =
        !!store.value.constructionMode &&
        fileSystem.features.canWrite &&
        ctx.currentNode &&
        (ctx.currentNode.type === 'leaf' || ctx.currentNode.type === 'exam');

    const containerClasses = [
        'arborito-lesson-aside',
        'fixed',
        'flex',
        'flex-col',
        /* Below modal host (125): avoids z-index ties with dialogs */
        'z-[120]',
        'transition-all',
        'duration-500',
        'ease-[cubic-bezier(0.25,0.8,0.25,1)]',
        'border-l',
        'border-transparent',
        'no-print',
        'right-0',
        'w-full',
        'max-w-full',
        'arborito-lesson-sheet',
        'top-0',
        'bottom-0',
        'left-0',
        'right-0',
        'h-[100dvh]',
        'max-h-[100dvh]',
        'min-h-0',
        'rounded-none',
        'bg-[#f8fafc]',
        'dark:bg-[#0c1222]'
    ];

    const isFirstSection = ctx.activeSectionIndex === 0;
    const leftFooterLabel = isFirstSection ? ui.navBack || ui.close : ui.previousSection;
    const leftFooterAria = isFirstSection ? ui.navBack || ui.close : ui.previousSection;
    const leftMobileBtn = isFirstSection
        ? `<button type="button" id="btn-exit-mobile" class="arborito-lesson-footer-btn arborito-lesson-footer-btn--secondary arborito-lesson-footer-btn--back" title="${ui.navBack || ui.close}" aria-label="${leftFooterAria}">
             <span class="arborito-lesson-footer-btn__icon" aria-hidden="true">←</span>
             <span class="arborito-lesson-footer-btn__label">${leftFooterLabel}</span>
           </button>`
        : `<button type="button" id="btn-prev-mobile" class="arborito-lesson-footer-btn arborito-lesson-footer-btn--secondary arborito-lesson-footer-btn--back" aria-label="${leftFooterAria}">
             <span class="arborito-lesson-footer-btn__icon" aria-hidden="true">←</span>
             <span class="arborito-lesson-footer-btn__label">${leftFooterLabel}</span>
           </button>`;

    const closeBtnHtml = () => {
        const closeAria = ui.navBack || ui.close || '';
        return `
       <button type="button" id="btn-close-content-mobile" class="arborito-mmenu-back shrink-0" aria-label="${closeAria}" title="${closeAria}">
          <span class="text-xl font-bold leading-none" aria-hidden="true">←</span>
       </button>`;
    };

    const bookmarkIcon = isBookmarked
        ? `<svg class="w-5 h-5 text-yellow-500 fill-current" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clip-rule="evenodd" /></svg>`
        : `<svg class="w-5 h-5 text-slate-600 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.563.045.797.777.371 1.141l-4.203 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.203-3.602a.563.563 0 01.371-1.141l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>`;

    // Student: TOC only when multiple sections (and not in exam).
    // Construction: always show TOC panel even when TOC is empty
    // (e.g. at start when markdown has no headings yet).
    const showTocChrome = constructEdit ? true : toc.length > 1 && !isExam;
    const tocPillBtn = showTocChrome
        ? `
        <button type="button" id="btn-toggle-toc" class="arborito-lesson-toc-pill ${ctx.isTocVisible ? 'is-active' : ''}" aria-expanded="${ctx.isTocVisible}" aria-label="${ui.lessonTopics || 'Contents'}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.008v.008H3.75V6.75zm0 5.25h.008v.008H3.75V12zm0 5.25h.008v.008H3.75v-.008z" /></svg>
        </button>`
        : '';

    const lessonToolsLabel = constructEdit
        ? (ui.lessonToolbar && ui.navConstruct ? `${ui.lessonToolbar} · ${ui.navConstruct}` : ui.lessonToolbar || ui.navConstruct || '')
        : ui.lessonToolbar || '';
    const sageBtnHtml = !isExam
        ? `<button type="button" id="btn-ask-sage" class="arborito-lesson-mtool arborito-lesson-mtool--sage" title="${ui.navSage}"><span aria-hidden="true">🦉</span><span>${ui.navSage}</span></button>`
        : '';
    const pdfLabel = ui.exportPdfShort || 'PDF';
    const pdfBtnHtml = !isExam
        ? `<button type="button" id="btn-export-pdf" class="arborito-lesson-mtool" title="${ui.exportTitle}" aria-label="${ui.exportTitle}">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <span>${pdfLabel}</span>
            </button>`
        : '';

    const mobileActionStripRead = `
        <div class="arborito-lesson-actions" role="toolbar" aria-label="${lessonToolsLabel}">
            ${tocPillBtn}
            ${sageBtnHtml}
            <button type="button" id="btn-toggle-bookmark" class="arborito-lesson-mtool" title="${isBookmarked ? ui.bookmarkTooltipRemove || ui.bookmarkDeleteTitle : ui.bookmarkTooltipAdd}" aria-label="${isBookmarked ? ui.bookmarkTooltipRemove || ui.bookmarkDeleteTitle : ui.bookmarkTooltipAdd}">${bookmarkIcon}</button>
            ${pdfBtnHtml}
        </div>
    `;

    const mobileActionStripConstruct = `
        <div class="arborito-lesson-actions arborito-lesson-actions--construct" role="toolbar" aria-label="${lessonToolsLabel}">
            ${tocPillBtn}
            <div class="flex flex-col gap-1 min-w-0 flex-1 border border-amber-300/40 dark:border-amber-500/25 rounded-xl px-0.5 sm:px-1 py-1 bg-amber-50/90 dark:bg-amber-950/30 overflow-visible">
                ${getEditorToolbarInnerHtml(ui, {
                    undoButtonId: 'btn-lesson-undo',
                    includeMagicAi: true,
                    includeHeadingStructure: false
                })}
            </div>
            <button type="button" id="btn-lesson-save" class="arborito-lesson-save-btn shrink-0 px-2 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] sm:text-xs font-black transition-[transform,box-shadow] active:scale-[0.98] border border-emerald-700/30 shadow-sm">${ui.editorLocalSave || 'Save'}</button>
        </div>
    `;

    const mobileActionStripHtml = constructEdit ? mobileActionStripConstruct : mobileActionStripRead;

    const pathBreadcrumb = ctx.currentNode.path ? ctx.currentNode.path.split(' / ').slice(0, -1).join(' / ') : '';

    const lessonHeaderEmojiBtnTitle = ui.lessonHeaderIconEmoji || ui.lessonTocEmojiPlaceholder || 'Icon';
    const lessonHeaderEmojiBtnAria = ui.lessonHeaderIconEmojiAria || lessonHeaderEmojiBtnTitle;
    const headerTitleAria = ui.graphPromptLessonName || ui.lessonHeaderEditMeta || 'Lesson name';
    const headerDescAria = ui.editorLabelDesc || 'Description';
    const headerDescPh = ui.treeMetaDescriptionPh || '';
    const lessonHeaderEmojiAria = ui.lessonTocEmojiPlaceholder || 'Emoji';
    const lessonHeaderEmojiGrid = NODE_PROPERTY_EMOJIS.map(
        (e) =>
            `<button type="button" class="btn-lesson-header-emoji js-lesson-header-emoji-choice" aria-label="${escAttr(lessonHeaderEmojiAria)} ${escAttr(e)}">${e}</button>`
    ).join('');

    const lessonTitleBlockConstruct = `
                        <div class="arborito-lesson-meta-hit group flex items-start gap-2 w-full min-w-0 min-h-0 rounded-xl -mx-1 px-1 py-0.5 text-left transition-colors hover:bg-amber-100/40 dark:hover:bg-amber-950/25">
                            <div class="relative shrink-0 arborito-lesson-emoji-wrap">
                            <button type="button" id="btn-lesson-node-meta" class="arborito-lesson-emoji-btn shrink-0 rounded-lg p-0.5 -m-0.5 transition-transform hover:bg-amber-100/60 dark:hover:bg-amber-950/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80" title="${escAttr(lessonHeaderEmojiBtnTitle)}" aria-label="${escAttr(lessonHeaderEmojiBtnAria)}" aria-expanded="false" aria-haspopup="listbox">
                                <span class="arborito-lesson-emoji shrink-0 transition-transform group-hover:scale-105" aria-hidden="true">${ctx.currentNode.icon || '📄'}</span>
                            </button>
                            <div id="lesson-header-emoji-picker" class="arborito-lesson-emoji-picker hidden" role="listbox" aria-label="${escAttr(lessonHeaderEmojiAria)}">
                                <div class="arborito-lesson-emoji-picker__grid">${lessonHeaderEmojiGrid}</div>
                            </div>
                            </div>
                            <div class="min-w-0 flex-1 flex flex-col gap-0.5">
                                <div class="flex items-start gap-1.5 min-w-0">
                                    <input type="text" id="inp-lesson-header-title" class="arborito-lesson-header-title-input w-full min-w-0" value="${escAttr(ctx.lessonHeaderTitleValue)}" autocomplete="off" spellcheck="true" aria-label="${escAttr(headerTitleAria)}" />
                                    ${isExam ? `<span class="shrink-0 text-[10px] align-middle bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">${ui.tagExam || 'EXAM'}</span>` : ''}
                                </div>
                                ${pathBreadcrumb ? `<p class="arborito-lesson-mobile-breadcrumb pointer-events-none">${escHtml(pathBreadcrumb)}</p>` : ''}
                                <input type="text" id="inp-lesson-header-desc" class="arborito-lesson-header-desc-input w-full min-w-0" value="${escAttr(ctx.lessonHeaderDescValue)}" placeholder="${escAttr(headerDescPh)}" autocomplete="off" spellcheck="true" aria-label="${escAttr(headerDescAria)}" />
                            </div>
                        </div>`;

    const lessonTitleBlockRead = `
                        <span class="arborito-lesson-emoji" aria-hidden="true">${ctx.currentNode.icon || '📄'}</span>
                        <div class="min-w-0 flex-1">
                            <h1 class="line-clamp-3">${escHtml(ctx.currentNode.name)}${isExam ? ` <span class="text-[10px] align-middle bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">${escHtml(ui.tagExam || 'EXAM')}</span>` : ''}</h1>
                            ${pathBreadcrumb ? `<p class="arborito-lesson-mobile-breadcrumb">${escHtml(pathBreadcrumb)}</p>` : ''}
                        </div>`;

    const tocFilterPh = ui.lessonTocFilterPlaceholder || ui.filterPlaceholder || '';
    const addSectionLabel = ui.lessonTocAddSection || 'Add section';
    const addSectionHint = (ui.lessonTocAddSectionHint || addSectionLabel).trim();
    /* New part: subsections added with + on each TOC row (construction mode). */
    const tocAddBlock = constructEdit
        ? `<div class="mt-2 mb-1 arborito-lesson-toc-add-wrap">
                <button type="button" class="js-toc-construct-add arborito-lesson-toc-add-btn" title="${escAttr(addSectionHint)}" aria-label="${escAttr(addSectionLabel)}">
                    <span class="arborito-lesson-toc-add-btn__glyph" aria-hidden="true">+</span>
                    <span class="arborito-lesson-toc-add-btn__label">${escHtml(addSectionLabel)}</span>
                </button>
            </div>`
        : '';
    const tocFilterBlock = `
                    <div class="relative mb-3 whitespace-nowrap arborito-lesson-toc-filter-wrap">
                        <input id="toc-filter" type="text" placeholder="${tocFilterPh}" class="arborito-lesson-toc-filter w-full rounded-lg pl-3 pr-4 py-2.5 text-sm font-bold outline-none transition box-border" autocomplete="off" aria-label="${tocFilterPh}">
                        ${tocAddBlock}
                    </div>`;

    const tocListMarkup = showTocChrome ? ctx.buildTocListMarkup(toc, filteredToc) : '';

    const pendingMediaDetails = getPendingExternalMediaDetails(allBlocks);
    const showMediaConsentModal =
        !constructEdit && pendingMediaDetails.length > 0 && ctx.mediaDeclinedLessonId !== (ctx.currentNode && ctx.currentNode.id);

    const lessonProseBlocks = activeBlocks
        .map((b) =>
            ContentRenderer.renderBlock(b, ui, {
                getQuizState: ctx.getQuizState.bind(ctx),
                isCompleted: (id) => store.isCompleted(id),
                isExam: isExam,
                isMediaSrcBlocked
            })
        )
        .join('');

    const lessonShellEditorHtml = `
                <div id="lesson-visual-editor" class="prose prose-slate dark:prose-invert prose-base max-w-none min-h-[55vh] p-4 rounded-xl border border-amber-200/60 dark:border-amber-500/25 bg-white dark:bg-slate-900/95 outline-none leading-7 text-slate-800 dark:text-slate-100" contenteditable="true" spellcheck="false"></div>
            `;

    const lessonMagicOverlayHtml = constructEdit
        ? `
            <div id="lesson-magic-overlay" class="hidden absolute inset-0 z-[50] flex items-center justify-center bg-slate-950/80 backdrop-blur-[1px] rounded-xl" aria-hidden="true">
                <div class="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-purple-500/50">
                    <h3 class="text-lg font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2"><span class="text-2xl" aria-hidden="true">✨</span> ${escHtml(ui.editorMagicDraft)}</h3>
                    <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">${escHtml(ui.editorMagicDraftPrompt)}</p>
                    <input id="inp-lesson-magic-prompt" type="text" class="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold mb-4 focus:ring-2 focus:ring-purple-500 outline-none dark:text-white" placeholder="${escAttr(ui.editorMagicDraftExample)}" autocomplete="off" />
                    <div class="flex gap-3">
                        <button type="button" id="btn-lesson-magic-cancel" class="flex-1 py-2 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg font-bold text-xs uppercase">${escHtml(ui.editorCancelLoading)}</button>
                        <button type="button" id="btn-lesson-magic-run" class="flex-1 py-2 bg-purple-600 text-white rounded-lg font-bold text-xs uppercase hover:bg-purple-500 transition-transform active:scale-[0.98]">${escHtml(ui.editorDraftButton)}</button>
                    </div>
                </div>
            </div>`
        : '';

    const lessonBodyHtml = constructEdit
        ? lessonShellEditorHtml
        : `<div class="prose prose-slate dark:prose-invert prose-base max-w-none select-text cursor-text">
                        ${lessonProseBlocks}
                    </div>`;

    const mediaModalHtml = showMediaConsentModal ? getMediaConsentModalMarkup(ui, pendingMediaDetails) : '';

    const showProgressRow = constructEdit ? false : toc.length > 1 && !isExam;
    const showStudentFooter = toc.length > 0 && !isExam && !constructEdit;
    const showExamIntroFooter = onExamIntro && !constructEdit;

    return `
    <div id="backdrop-overlay" class="fixed inset-0 z-[115] pointer-events-none arborito-lesson-mobile-scrim" aria-hidden="true"></div>

    <aside class="${containerClasses.join(' ')} transform translate-x-0 ${constructEdit ? 'arborito-lesson-aside--construct-edit' : ''}">
        <header class="arborito-lesson-mobile-head">
            <div class="arborito-lesson-mobile-grab" aria-hidden="true"></div>
            <div class="arborito-lesson-head-main">
                <div class="arborito-lesson-head-primary">
                    <div class="arborito-lesson-mobile-toolbar">
                        ${closeBtnHtml()}
                        <div class="arborito-lesson-mobile-titleblock min-w-0 flex-1 pr-1">
                            ${constructEdit ? lessonTitleBlockConstruct : lessonTitleBlockRead}
                        </div>
                    </div>
                </div>
                ${mobileActionStripHtml}
            </div>
        </header>
        ${showProgressRow ? `
        <div class="relative z-20 flex items-center justify-between px-4 pt-1">
            <span class="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">${ui.lessonProgress}</span>
            <span class="text-[10px] font-black text-emerald-600 dark:text-emerald-400">${progress}%</span>
        </div>
        <div class="arborito-lesson-progress-slim relative z-20"><div class="arborito-lesson-progress-slim__fill" style="width: ${progress}%"></div></div>
        ` : ''}
        <div class="arborito-lesson-mobile-body flex-1 min-h-0 relative z-10">
            ${showTocChrome ? `
            <div id="toc-mobile-backdrop" class="arborito-lesson-toc-backdrop ${!ctx.isTocVisible ? 'is-hidden' : ''}"></div>
            <div id="lesson-toc-sheet" class="arborito-lesson-toc-sheet ${!ctx.isTocVisible ? 'is-collapsed' : ''}" role="dialog" aria-modal="true" aria-label="${ui.lessonTopics}">
                <div class="arborito-lesson-toc-sheet__head">
                    <div class="arborito-lesson-toc-sheet__grab" aria-hidden="true"></div>
                    <div class="arborito-lesson-toc-sheet__title">${ui.lessonTopics}</div>
                    ${tocFilterBlock}
                </div>
                <div class="arborito-lesson-toc-sheet__scroll custom-scrollbar">
                    <nav id="lesson-toc-nav" class="flex flex-col gap-2 w-full">${tocListMarkup}</nav>
                </div>
            </div>
            ` : ''}
            <div id="content-area" class="flex-1 overflow-y-auto custom-scrollbar px-4 pt-4 pb-6 scroll-smooth min-h-0">
                <div class="max-w-3xl mx-auto w-full relative ${constructEdit ? 'pb-8' : 'pb-24'} arborito-lesson-prose-frame">
                    ${lessonMagicOverlayHtml}
                    ${lessonBodyHtml}
                </div>
            </div>
        </div>

        ${showStudentFooter ? `
        <div class="arborito-lesson-mobile-footer relative z-20">
            <div class="arborito-lesson-footer-meta-row">
                <div class="arborito-lesson-footer-meta-pill">
                    <span class="arborito-lesson-footer-meta arborito-lesson-footer-meta--progress">${ctx.activeSectionIndex + 1} / ${toc.length}</span>
                    <span class="arborito-lesson-footer-meta-sep" aria-hidden="true">·</span>
                    <button type="button" id="btn-later-mobile" class="arborito-lesson-footer-later">${ui.readLater}</button>
                </div>
            </div>
            <div class="arborito-lesson-footer-nav max-w-3xl mx-auto w-full">
                ${leftMobileBtn}
                <button type="button" id="btn-complete-mobile" class="arborito-lesson-footer-btn arborito-lesson-footer-btn--primary arborito-lesson-footer-btn--next">
                    <span class="arborito-lesson-footer-btn__label">${ctx.activeSectionIndex < toc.length - 1 ? ui.nextSection : ui.completeAndNext}</span>
                    ${ctx.activeSectionIndex < toc.length - 1 ? '<span class="arborito-lesson-footer-btn__icon arborito-lesson-footer-btn__icon--chev" aria-hidden="true">→</span>' : ''}
                </button>
            </div>
        </div>
        ` : ''}

        ${showExamIntroFooter ? `
        <div class="arborito-lesson-mobile-footer relative z-20">
             <button type="button" id="btn-start-exam-mobile" class="w-full justify-center text-center px-4 py-3.5 rounded-xl font-bold flex items-center gap-2 transition-all bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-500/25 active:scale-[0.98]">
                 <span>${ui.quizStart} ${ui.quizLabel}</span>
             </button>
        </div>
        ` : ''}
    </aside>
    ${mediaModalHtml}
    `;
}
