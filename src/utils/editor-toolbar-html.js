function escToolbarAttr(s) {
    return String(s != null ? s : '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

/**
 * Formatting toolbar buttons (lesson shell in construction mode).
 * @param {Record<string, string>} ui - store.ui
 * @param {{ includeMagicAi?: boolean, undoButtonId?: string, magicButtonHint?: string, includeHeadingStructure?: boolean }} [opts]
 */
export function getEditorToolbarInnerHtml(ui, opts = {}) {
    const includeHeadingStructure = opts.includeHeadingStructure !== false;
    const includeMagicAi = opts.includeMagicAi !== false;
    const undoId = opts.undoButtonId || 'btn-undo';
    const undoAria = escToolbarAttr(ui.conUndoDockLabel || ui.editorToolbarUndo || 'Undo');
    const magicHint = opts.magicButtonHint || ui.editorToolbarMagicAiHint || '';
    const magicLabel = magicHint || ui.editorToolbarMagicAi || 'AI';
    const magicBtn = includeMagicAi
        ? `<button type="button" id="btn-magic-draft" class="lesson-editor-toolbar-magic shrink-0 min-h-[2.75rem] sm:min-h-0 px-2.5 py-2 sm:px-3 sm:py-1.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 rounded-lg text-[10px] sm:text-xs font-bold uppercase hover:bg-purple-500/20 inline-flex items-center gap-1 transition-colors" title="${escToolbarAttr(magicHint)}" aria-label="${escToolbarAttr(magicLabel)}">
                    <span aria-hidden="true">✨</span><span class="hidden sm:inline">${escToolbarAttr(ui.editorToolbarMagicAi || 'AI')}</span>
                </button>`
        : '';
    const insertMenuLabel = escToolbarAttr(ui.editorToolbarInsertBlocks || ui.editorToolbarMore || 'Insert');
    const insertMenuAria = escToolbarAttr(ui.editorToolbarInsertBlocksAria || ui.editorToolbarMore || 'Insert');
    const headingFmt = includeHeadingStructure
        ? `<button type="button" class="tool-btn lesson-editor-tool-chip min-h-[2.5rem] sm:min-h-0 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 font-black text-xs uppercase transition-colors" data-cmd="formatBlock" data-val="H1" title="${escToolbarAttr(ui.editorTitleAttrH1)}" aria-label="${escToolbarAttr(ui.editorToolbarTitleButton)}">${escToolbarAttr(ui.editorToolbarTitleButton)}</button>
                <button type="button" class="tool-btn lesson-editor-tool-chip min-h-[2.5rem] sm:min-h-0 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 font-black text-xs uppercase transition-colors" data-cmd="formatBlock" data-val="H2" title="${escToolbarAttr(ui.editorTitleAttrH2)}" aria-label="${escToolbarAttr(ui.editorToolbarSubHeader)}">${escToolbarAttr(ui.editorToolbarSubHeader)}</button>
                <button type="button" class="tool-btn lesson-editor-tool-chip min-h-[2.5rem] sm:min-h-0 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 font-bold text-[10px] sm:text-xs uppercase transition-colors" data-cmd="formatBlock" data-val="H3" title="${escToolbarAttr(ui.editorTitleAttrH3)}" aria-label="${escToolbarAttr(ui.editorToolbarTopicButton)}">${escToolbarAttr(ui.editorToolbarTopicButton)}</button>`
        : '';

    const fmtLabel = escToolbarAttr(ui.editorToolbarText || ui.editorToolbarFormat || 'Text');
    const fmtAria = escToolbarAttr(ui.editorToolbarTextAria || ui.editorToolbarFormat || 'Text');
    const sizeLabel = (ui.editorToolbarTextSize || ui.size || 'Size').trim();
    const alignLabel = (ui.editorToolbarAlign || ui.align || 'Align').trim();
    const optNormal = escToolbarAttr(ui.editorToolbarTextNormal || ui.normal || 'Normal');
    const optLarge = escToolbarAttr(ui.editorToolbarTextLarge || ui.large || 'Large');
    const optMed = escToolbarAttr(ui.editorToolbarTextMedium || ui.medium || 'Medium');
    const optSmall = escToolbarAttr(ui.editorToolbarTextSmall || ui.small || 'Small');
    const optLeft = escToolbarAttr(ui.left || ui.alignLeft || 'Left');
    const optCenter = escToolbarAttr(ui.center || ui.alignCenter || 'Center');
    const optRight = escToolbarAttr(ui.right || ui.alignRight || 'Right');

    const formatMenu = `
                    <div class="lesson-editor-format-wrap relative shrink-0 self-center">
                        <button type="button" class="lesson-editor-format-toggle lesson-editor-tool-chip min-h-[2.75rem] px-3 rounded-lg border border-slate-300/60 dark:border-slate-600/45 bg-white/80 dark:bg-slate-900/40 text-[10px] sm:text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900/60 transition-colors whitespace-nowrap"
                            aria-expanded="false" aria-haspopup="true" aria-controls="lesson-editor-format-panel" title="${fmtAria}">Aa <span class="hidden sm:inline">${fmtLabel}</span> <span aria-hidden="true" class="opacity-70">▾</span></button>
                        <div id="lesson-editor-format-panel" class="lesson-editor-format-panel hidden absolute left-0 top-[calc(100%+0.35rem)] z-[90] flex flex-col gap-2 min-w-[12rem] max-w-[min(18rem,calc(100vw-2rem))] p-2 rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-xl" role="menu" aria-label="${fmtAria}">
                            <div class="px-1 pt-0.5">
                                <p class="m-0 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">${escToolbarAttr(sizeLabel)}</p>
                                <div class="mt-1 flex flex-wrap gap-1.5">
                                    <button type="button" class="tool-btn lesson-editor-tool-chip px-2.5 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 font-bold text-xs" data-cmd="formatBlock" data-val="P" role="menuitem">${optNormal}</button>
                                    <button type="button" class="tool-btn lesson-editor-tool-chip px-2.5 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 font-bold text-xs" data-cmd="formatBlock" data-val="H4" role="menuitem">${optLarge}</button>
                                    <button type="button" class="tool-btn lesson-editor-tool-chip px-2.5 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 font-bold text-xs" data-cmd="formatBlock" data-val="H5" role="menuitem">${optMed}</button>
                                    <button type="button" class="tool-btn lesson-editor-tool-chip px-2.5 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 font-bold text-xs" data-cmd="formatBlock" data-val="H6" role="menuitem">${optSmall}</button>
                                </div>
                            </div>
                            <div class="px-1 pb-0.5">
                                <p class="m-0 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">${escToolbarAttr(alignLabel)}</p>
                                <div class="mt-1 flex gap-1.5">
                                    <button type="button" class="tool-btn lesson-editor-tool-chip px-2.5 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 font-bold text-xs" data-cmd="align" data-val="left" role="menuitem">⟸ ${optLeft}</button>
                                    <button type="button" class="tool-btn lesson-editor-tool-chip px-2.5 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 font-bold text-xs" data-cmd="align" data-val="center" role="menuitem">⇔ ${optCenter}</button>
                                    <button type="button" class="tool-btn lesson-editor-tool-chip px-2.5 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 font-bold text-xs" data-cmd="align" data-val="right" role="menuitem">⟹ ${optRight}</button>
                                </div>
                            </div>
                        </div>
                    </div>`;
    const rowFmt = `
                <button type="button" id="${undoId}" class="tool-btn lesson-editor-tool-chip w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 opacity-50 transition-colors shrink-0" disabled aria-label="${undoAria}">↩</button>
                <div class="w-px h-6 sm:h-6 bg-slate-400/30 mx-0.5 shrink-0 self-center" aria-hidden="true"></div>
                <button type="button" class="tool-btn lesson-editor-tool-chip min-w-[2.5rem] h-10 sm:min-w-0 sm:h-8 px-2.5 sm:px-3 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 font-bold text-sm transition-colors" data-cmd="bold" aria-label="Bold">B</button>
                <button type="button" class="tool-btn lesson-editor-tool-chip min-w-[2.5rem] h-10 sm:min-w-0 sm:h-8 px-2.5 sm:px-3 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 italic text-sm transition-colors" data-cmd="italic" aria-label="Italic">I</button>
                ${formatMenu}
                ${headingFmt}`;
    const imgLabel = ui.editorBlockInsertImage || ui.mediaPlaceholderImage || 'Image';
    const vidLabel = ui.editorBlockInsertVideo || ui.mediaPlaceholderVideo || 'Video';
    const rowBlocks = `
                <button type="button" class="block-btn lesson-editor-insert-panel__opt" data-type="image"><span aria-hidden="true">🖼</span> ${escToolbarAttr(imgLabel)}</button>
                <button type="button" class="block-btn lesson-editor-insert-panel__opt" data-type="video"><span aria-hidden="true">🎬</span> ${escToolbarAttr(vidLabel)}</button>
                <button type="button" class="block-btn lesson-editor-insert-panel__opt" data-type="quiz"><span aria-hidden="true">❓</span> ${escToolbarAttr(ui.quizLabel)}</button>
                <button type="button" class="block-btn lesson-editor-insert-panel__opt" data-type="callout"><span aria-hidden="true">💡</span> ${escToolbarAttr(ui.editorBlockAddNote)}</button>
                <button type="button" class="block-btn lesson-editor-insert-panel__opt" data-type="game"><span aria-hidden="true">🎮</span> ${escToolbarAttr(ui.editorBlockGame || 'Game')}</button>`;
    return `
            <div class="lesson-editor-toolbar-rows flex flex-col gap-1.5 min-w-0 flex-1" role="group" aria-label="${escToolbarAttr(ui.lessonToolbar || 'Lesson editor')}">
                <div class="lesson-editor-toolbar-row lesson-editor-toolbar-row--primary flex flex-nowrap items-stretch sm:items-center gap-1.5 min-w-0 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0 sm:flex-wrap">${rowFmt}
                    <div class="lesson-editor-insert-wrap relative shrink-0 self-center">
                        <button type="button" class="lesson-editor-insert-toggle lesson-editor-tool-chip min-h-[2.75rem] px-3 rounded-lg border border-amber-400/55 dark:border-amber-600/45 bg-amber-100/50 dark:bg-amber-950/35 text-[10px] sm:text-xs font-black uppercase tracking-wide text-amber-900 dark:text-amber-100 hover:bg-amber-200/60 dark:hover:bg-amber-900/40 transition-colors whitespace-nowrap" aria-expanded="false" aria-haspopup="true" aria-controls="lesson-editor-insert-panel" title="${insertMenuAria}">${insertMenuLabel} <span aria-hidden="true" class="opacity-70">▾</span></button>
                        <div id="lesson-editor-insert-panel" class="lesson-editor-insert-panel hidden absolute left-0 top-[calc(100%+0.35rem)] z-[90] flex flex-col gap-1 min-w-[11.5rem] max-w-[min(18rem,calc(100vw-2rem))] p-2 rounded-xl border border-amber-300/50 dark:border-amber-600/50 bg-white dark:bg-slate-900 shadow-xl" role="menu" aria-label="${insertMenuAria}">${rowBlocks}</div>
                    </div>
                    <span class="lesson-editor-toolbar-spacer flex-1 min-w-[0.25rem] sm:min-w-[0.5rem]" aria-hidden="true"></span>
                    ${magicBtn}
                </div>
            </div>`;
}
