import { store } from '../store.js';
import { ContentRenderer } from '../utils/renderer.js';
import { buildTocListMarkup } from './content-toc.js';
import {
    getMediaConsentModalMarkup,
    getPendingExternalMediaDetails,
    isMediaSrcBlocked
} from '../utils/third-party-media.js';

export function renderContentHtml(ctx, allBlocks, toc, filteredToc, activeBlocks, progress, isExam, onExamIntro) {
    const ui = store.ui;
    const isBookmarked = ctx.currentNode ? !!store.getBookmark(ctx.currentNode.id, ctx.currentNode.content) : false;

    const containerClasses = [
        "arborito-lesson-aside",
        "fixed", "flex", "flex-col",
        "z-[125]",
        "transition-all", "duration-500", "ease-[cubic-bezier(0.25,0.8,0.25,1)]",
        "border-l", "border-transparent", "no-print",
        "right-0", "w-full", "max-w-full",
        "arborito-lesson-sheet", "top-0", "bottom-0", "left-0", "right-0", "h-[100dvh]", "max-h-[100dvh]", "min-h-0", "rounded-none", "bg-[#f8fafc]", "dark:bg-[#0c1222]"
    ];

    const isFirstSection = ctx.activeSectionIndex === 0;
    const leftFooterLabel = isFirstSection ? (ui.navBack || ui.close) : ui.previousSection;
    const leftFooterAria = isFirstSection ? (ui.navBack || ui.close) : ui.previousSection;
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

    const tocPillBtn = (toc.length > 1 && !isExam) ? `
        <button type="button" id="btn-toggle-toc" class="arborito-lesson-toc-pill ${ctx.isTocVisible ? 'is-active' : ''}" aria-expanded="${ctx.isTocVisible}" aria-label="${ui.lessonTopics || 'Contents'}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.008v.008H3.75V6.75zm0 5.25h.008v.008H3.75V12zm0 5.25h.008v.008H3.75v-.008z" /></svg>
        </button>` : '';

    const lessonToolsLabel = ui.lessonToolbar || '';
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
    const mobileActionStripHtml = `
        <div class="arborito-lesson-actions" role="toolbar" aria-label="${lessonToolsLabel}">
            ${tocPillBtn}
            ${sageBtnHtml}
            <button type="button" id="btn-toggle-bookmark" class="arborito-lesson-mtool" title="${isBookmarked ? (ui.bookmarkTooltipRemove || ui.bookmarkDeleteTitle) : ui.bookmarkTooltipAdd}" aria-label="${isBookmarked ? (ui.bookmarkTooltipRemove || ui.bookmarkDeleteTitle) : ui.bookmarkTooltipAdd}">${bookmarkIcon}</button>
            <button type="button" id="btn-propose-change" class="arborito-lesson-mtool arborito-lesson-mtool--propose" title="${ui.proposeChange}" aria-label="${ui.proposeChange}">
                <svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
            </button>
            ${pdfBtnHtml}
        </div>
    `;

    const pathBreadcrumb = ctx.currentNode.path
        ? ctx.currentNode.path.split(' / ').slice(0, -1).join(' / ')
        : '';

    const tocFilterPh = ui.lessonTocFilterPlaceholder || ui.filterPlaceholder || '';
    const tocFilterBlock = `
                    <div class="relative mb-3 whitespace-nowrap arborito-lesson-toc-filter-wrap">
                        <input id="toc-filter" type="text" placeholder="${tocFilterPh}" class="arborito-lesson-toc-filter w-full rounded-lg pl-3 pr-4 py-2.5 text-sm font-bold outline-none transition box-border" autocomplete="off" aria-label="${tocFilterPh}">
                    </div>`;

    const tocListMarkup = (toc.length > 1 && !isExam) ? ctx.buildTocListMarkup(toc, filteredToc) : '';

    const pendingMediaDetails = getPendingExternalMediaDetails(allBlocks);
    const showMediaConsentModal =
        pendingMediaDetails.length > 0 && ctx.mediaDeclinedLessonId !== ctx.currentNode?.id;

    const lessonProseBlocks = activeBlocks.map(b => ContentRenderer.renderBlock(b, ui, {
        getQuizState: ctx.getQuizState.bind(ctx),
        isCompleted: (id) => store.isCompleted(id),
        isExam: isExam,
        isMediaSrcBlocked
    })).join('');

    const mediaModalHtml = showMediaConsentModal ? getMediaConsentModalMarkup(ui, pendingMediaDetails) : '';

    return `
    <div id="backdrop-overlay" class="fixed inset-0 z-[115] pointer-events-none arborito-lesson-mobile-scrim" aria-hidden="true"></div>

    <aside class="${containerClasses.join(' ')} transform translate-x-0">
        <header class="arborito-lesson-mobile-head">
            <div class="arborito-lesson-mobile-grab" aria-hidden="true"></div>
            <div class="arborito-lesson-head-main">
                <div class="arborito-lesson-head-primary">
                    <div class="arborito-lesson-mobile-toolbar">
                        ${closeBtnHtml()}
                        <div class="arborito-lesson-mobile-titleblock min-w-0 flex-1 pr-1">
                            <span class="arborito-lesson-emoji" aria-hidden="true">${ctx.currentNode.icon || '📄'}</span>
                            <div class="min-w-0 flex-1">
                                <h1 class="line-clamp-3">${ctx.currentNode.name}${isExam ? ` <span class="text-[10px] align-middle bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">${ui.tagExam || 'EXAM'}</span>` : ''}</h1>
                                ${pathBreadcrumb ? `<p class="arborito-lesson-mobile-breadcrumb">${pathBreadcrumb}</p>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
                ${mobileActionStripHtml}
            </div>
        </header>
        ${toc.length > 1 && !isExam ? `
        <div class="relative z-20 flex items-center justify-between px-4 pt-1">
            <span class="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">${ui.lessonProgress}</span>
            <span class="text-[10px] font-black text-emerald-600 dark:text-emerald-400">${progress}%</span>
        </div>
        <div class="arborito-lesson-progress-slim relative z-20"><div class="arborito-lesson-progress-slim__fill" style="width: ${progress}%"></div></div>
        ` : ''}
        <div class="arborito-lesson-mobile-body flex-1 min-h-0 relative z-10">
            ${toc.length > 1 && !isExam ? `
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
                <div class="max-w-3xl mx-auto w-full pb-24 arborito-lesson-prose-frame">
                    <div class="prose prose-slate dark:prose-invert prose-base max-w-none select-text cursor-text">
                        ${lessonProseBlocks}
                    </div>
                </div>
            </div>
        </div>

        ${toc.length > 0 && !isExam ? `
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

        ${onExamIntro ? `
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
