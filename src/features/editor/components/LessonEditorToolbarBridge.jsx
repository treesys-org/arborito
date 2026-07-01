import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

const ToolbarTipButton = forwardRef(function ToolbarTipButton(
    {
        id,
        className,
        label,
        hint,
        disabled,
        children,
        onClick,
        'data-cmd': dataCmd,
        'data-val': dataVal,
        'data-arbor-tour': dataArborTour,
        'aria-expanded': ariaExpanded,
        'aria-haspopup': ariaHaspopup,
        'aria-controls': ariaControls,
        role,
        style,
    },
    ref
) {
    const tip = hint || label;
    return (
        <button
            ref={ref}
            type="button"
            id={id}
            className={className}
            aria-label={label}
            data-arbor-tip={tip}
            disabled={disabled}
            data-cmd={dataCmd}
            data-val={dataVal}
            data-arbor-tour={dataArborTour}
            aria-expanded={ariaExpanded}
            aria-haspopup={ariaHaspopup}
            aria-controls={ariaControls}
            role={role}
            onClick={onClick}
            style={style}
        >
            {children}
        </button>
    );
});

function useFloatingPanel(open, onClose) {
    const toggleRef = useRef(null);
    const panelRef = useRef(null);
    const homeRef = useRef({ parent: null, next: null });

    useEffect(() => {
        const toggle = toggleRef.current;
        const panel = panelRef.current;
        if (!open || !toggle || !panel) return undefined;

        if (!homeRef.current.parent) {
            homeRef.current = { parent: panel.parentElement, next: panel.nextSibling };
        }
        if (panel.parentElement !== document.body) document.body.appendChild(panel);

        const positionPanel = () => {
            const r = toggle.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const gap = 6;
            const panelW = Math.min(panel.offsetWidth || 288, vw - 16);
            const left = Math.max(8, Math.min(r.left, vw - panelW - 8));
            const panelH = panel.offsetHeight || 0;
            const belowTop = r.bottom + gap;
            const top =
                belowTop + panelH > vh - 8 && r.top - gap - panelH > 8
                    ? Math.max(8, r.top - gap - panelH)
                    : belowTop;
            panel.style.position = 'fixed';
            panel.style.left = `${Math.round(left)}px`;
            panel.style.top = `${Math.round(top)}px`;
            panel.style.maxWidth = `${Math.round(Math.min(320, vw - 16))}px`;
            panel.style.zIndex = '2147483647';
        };

        const onDocDown = (ev) => {
            const t = ev.target;
            if (t instanceof Node && (panel.contains(t) || toggle.contains(t))) return;
            onClose();
        };
        const onReposition = () => {
            if (!open) return;
            positionPanel();
        };
        const onKey = (ev) => {
            if (ev.key === 'Escape') onClose();
        };

        requestAnimationFrame(positionPanel);
        document.addEventListener('mousedown', onDocDown, true);
        document.addEventListener('touchstart', onDocDown, true);
        window.addEventListener('resize', onReposition);
        window.addEventListener('scroll', onReposition, true);
        document.addEventListener('keydown', onKey);

        return () => {
            document.removeEventListener('mousedown', onDocDown, true);
            document.removeEventListener('touchstart', onDocDown, true);
            window.removeEventListener('resize', onReposition);
            window.removeEventListener('scroll', onReposition, true);
            document.removeEventListener('keydown', onKey);
            panel.classList.add('hidden');
            panel.style.position = '';
            panel.style.left = '';
            panel.style.top = '';
            panel.style.maxWidth = '';
            panel.style.zIndex = '';
            const { parent, next } = homeRef.current;
            if (panel.parentElement === document.body) {
                if (parent?.isConnected) parent.insertBefore(panel, next);
                else panel.remove();
            }
        };
    }, [open, onClose]);

    return { toggleRef, panelRef };
}

function LessonEditorFormatMenu({ ui, onToolCmd }) {
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);
    const { toggleRef, panelRef } = useFloatingPanel(open, close);

    const fmtLabel = ui.editorToolbarText || ui.editorToolbarFormat || 'Text';
    const fmtAria = ui.editorToolbarTextAria || ui.editorToolbarFormat || fmtLabel;
    const sizeLabel = (ui.editorToolbarTextSize || 'Size').trim();
    const alignLabel = (ui.editorToolbarAlign || 'Align').trim();
    const lineBreakLabel = ui.editorToolbarLineBreak || 'Line break';
    const optNormal = ui.editorToolbarTextNormal || 'Normal';
    const optLarge = ui.editorToolbarTextLarge || 'Large';
    const optMed = ui.editorToolbarTextMedium || 'Medium';
    const optSmall = ui.editorToolbarTextSmall || 'Small';
    const optLeft = ui.alignLeft || 'Left';
    const optCenter = ui.alignCenter || 'Center';
    const optRight = ui.alignRight || 'Right';

    const runCmd = (cmd, val) => {
        close();
        onToolCmd?.(cmd, val);
    };

    return (
        <div className="lesson-editor-format-wrap relative shrink-0 self-center">
            <ToolbarTipButton
                className="lesson-editor-format-toggle lesson-editor-tool-chip lesson-editor-tool-chip--icon lesson-editor-tool-chip--format"
                label={fmtLabel}
                hint={fmtAria}
                aria-expanded={open}
                aria-haspopup="true"
                aria-controls="lesson-editor-format-panel"
                onClick={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    setOpen((v) => !v);
                }}
                ref={toggleRef}
            >
                <span aria-hidden="true" className="lesson-editor-tool-chip__glyph">
                    Aa
                </span>
                <span aria-hidden="true" className="lesson-editor-tool-chip__chev">
                    ▾
                </span>
            </ToolbarTipButton>
            <div
                ref={panelRef}
                id="lesson-editor-format-panel"
                className={`lesson-editor-format-panel${open ? '' : ' hidden'} absolute left-0 top-[calc(100%+0.35rem)] z-[90] flex flex-col gap-2 min-w-[12rem] max-w-[min(18rem,calc(100vw-2rem))] p-2 rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-xl`}
                role="menu"
                aria-label={fmtAria}
            >
                <div className="px-1 pt-0.5">
                    <p className="arborito-eyebrow m-0">{sizeLabel}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                        {[
                            ['P', optNormal],
                            ['H4', optLarge],
                            ['H5', optMed],
                            ['H6', optSmall],
                        ].map(([val, text]) => (
                            <ToolbarTipButton
                                key={val}
                                className="tool-btn lesson-editor-tool-chip px-2.5 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 font-bold text-xs"
                                label={text}
                                data-cmd="formatBlock"
                                data-val={val}
                                role="menuitem"
                                onClick={() => runCmd('formatBlock', val)}
                            >
                                {text}
                            </ToolbarTipButton>
                        ))}
                    </div>
                </div>
                <div className="px-1 pb-0.5">
                    <p className="arborito-eyebrow m-0">{alignLabel}</p>
                    <div className="mt-1 flex gap-1.5">
                        {[
                            ['left', `⟸ ${optLeft}`],
                            ['center', `⇔ ${optCenter}`],
                            ['right', `⟹ ${optRight}`],
                        ].map(([val, text]) => (
                            <ToolbarTipButton
                                key={val}
                                className="tool-btn lesson-editor-tool-chip px-2.5 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 font-bold text-xs"
                                label={text}
                                data-cmd="align"
                                data-val={val}
                                role="menuitem"
                                onClick={() => runCmd('align', val)}
                            >
                                {text}
                            </ToolbarTipButton>
                        ))}
                    </div>
                </div>
                <div className="px-1 pb-0.5 border-t border-slate-200/70 dark:border-slate-700/60 pt-2">
                    <ToolbarTipButton
                        className="tool-btn lesson-editor-tool-chip w-full px-2.5 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 font-bold text-xs text-left"
                        label={lineBreakLabel}
                        data-cmd="insertBr"
                        role="menuitem"
                        onClick={() => runCmd('insertBr')}
                    >
                        ↵ {lineBreakLabel}
                    </ToolbarTipButton>
                </div>
            </div>
        </div>
    );
}

function LessonEditorFormatRow({ ui, undoButtonId, includeHeadingStructure, toolbarHandlers }) {
    const undoLabel = ui.conUndoDockLabel || ui.editorToolbarUndo || 'Undo';
    const { onUndo, onToolCmd, undoDisabled } = toolbarHandlers || {};

    const cmd = (c, v) => () => onToolCmd?.(c, v);

    return (
        <>
            <ToolbarTipButton
                id={undoButtonId}
                className="tool-btn lesson-editor-tool-chip lesson-editor-tool-chip--icon w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 opacity-50 transition-colors shrink-0"
                label={undoLabel}
                disabled={undoDisabled}
                style={undoDisabled ? { opacity: 0.5 } : { opacity: 1 }}
                onClick={() => onUndo?.()}
            >
                ↩
            </ToolbarTipButton>
            <div className="w-px h-5 bg-slate-400/30 mx-0.5 shrink-0 self-center" aria-hidden="true" />
            <ToolbarTipButton
                className="tool-btn lesson-editor-tool-chip lesson-editor-tool-chip--icon w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 font-bold text-sm transition-colors"
                label="Bold"
                data-cmd="bold"
                onClick={cmd('bold')}
            >
                B
            </ToolbarTipButton>
            <ToolbarTipButton
                className="tool-btn lesson-editor-tool-chip lesson-editor-tool-chip--icon w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 italic text-sm transition-colors"
                label="Italic"
                data-cmd="italic"
                onClick={cmd('italic')}
            >
                I
            </ToolbarTipButton>
            <LessonEditorFormatMenu ui={ui} onToolCmd={onToolCmd} />
            {includeHeadingStructure ? (
                <>
                    <ToolbarTipButton
                        className="tool-btn lesson-editor-tool-chip lesson-editor-tool-chip--text px-2 sm:px-2.5 py-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 font-bold text-[10px] sm:text-xs transition-colors"
                        label={ui.editorToolbarTitleButton || 'Title'}
                        hint={ui.editorTitleAttrH1}
                        data-cmd="formatBlock"
                        data-val="H1"
                        onClick={cmd('formatBlock', 'H1')}
                    >
                        {ui.editorToolbarTitleButton}
                    </ToolbarTipButton>
                    <ToolbarTipButton
                        className="tool-btn lesson-editor-tool-chip lesson-editor-tool-chip--text px-2 sm:px-2.5 py-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 font-bold text-[10px] sm:text-xs transition-colors"
                        label={ui.editorToolbarSubHeader || 'Part'}
                        hint={ui.editorTitleAttrH2}
                        data-cmd="formatBlock"
                        data-val="H2"
                        onClick={cmd('formatBlock', 'H2')}
                    >
                        {ui.editorToolbarSubHeader}
                    </ToolbarTipButton>
                    <ToolbarTipButton
                        className="tool-btn lesson-editor-tool-chip lesson-editor-tool-chip--text px-2 sm:px-2.5 py-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 font-bold text-[10px] sm:text-xs transition-colors"
                        label={ui.editorToolbarTopicButton || 'Subpart'}
                        hint={ui.editorTitleAttrH3}
                        data-cmd="formatBlock"
                        data-val="H3"
                        onClick={cmd('formatBlock', 'H3')}
                    >
                        {ui.editorToolbarTopicButton}
                    </ToolbarTipButton>
                </>
            ) : null}
        </>
    );
}

function LessonEditorInsertBlock({ ui, layout, toolbarHandlers }) {
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);
    const { toggleRef, panelRef } = useFloatingPanel(open, close);
    const { onInsertBlock, onInsertQuiz } = toolbarHandlers || {};

    const insertMenuLabel = ui.editorToolbarInsertBlocks || ui.editorToolbarMore || 'Insert';
    const insertMenuAria = ui.editorToolbarInsertBlocksAria || ui.editorToolbarMore || insertMenuLabel;
    const quizLabel = ui.editorToolbarQuizShortcut || ui.lessonQuizLabel || 'Quiz';
    const quizHint = ui.editorToolbarQuizShortcutHint || quizLabel;
    const imgLabel = ui.editorBlockInsertImage || ui.mediaPlaceholderImage || 'Image';
    const vidLabel = ui.editorBlockInsertVideo || ui.mediaPlaceholderVideo || 'Video';

    const insertToggleClass =
        layout === 'mobile-split'
            ? 'lesson-editor-insert-toggle lesson-editor-tool-chip lesson-editor-tool-chip--insert lesson-editor-tool-chip--insert-icon w-8 h-8 flex items-center justify-center rounded-lg border border-indigo-400/45 dark:border-indigo-500/40 bg-indigo-100/45 dark:bg-indigo-950/35 text-indigo-900 dark:text-indigo-100 hover:bg-indigo-200/55 dark:hover:bg-indigo-900/40 transition-colors'
            : 'lesson-editor-insert-toggle lesson-editor-tool-chip lesson-editor-tool-chip--insert px-2 sm:px-2.5 rounded-lg border border-amber-400/55 dark:border-amber-600/45 bg-amber-100/50 dark:bg-amber-950/35 text-[10px] sm:text-xs font-bold text-amber-900 dark:text-amber-100 hover:bg-amber-200/60 dark:hover:bg-amber-900/40 transition-colors whitespace-nowrap';

    const blockOpts = [
        ['image', '🖼', imgLabel],
        ['video', '🎬', vidLabel],
        ['callout', '💡', ui.editorBlockAddNote],
        ['game', '🎮', ui.editorBlockGame || 'Game'],
    ];

    return (
        <div className="lesson-editor-insert-wrap relative shrink-0 self-center flex flex-nowrap items-center gap-0.5" data-arbor-tour="lesson-edit-insert">
            <ToolbarTipButton
                id="btn-insert-quiz"
                className="lesson-editor-toolbar-quiz lesson-editor-tool-chip lesson-editor-tool-chip--icon shrink-0"
                label={quizLabel}
                hint={quizHint}
                data-arbor-tour="lesson-edit-quiz"
                onClick={() => onInsertQuiz?.()}
            >
                <span className="arborito-emoji-glyph" aria-hidden="true">
                    <ChromeEmoji emoji="📋" size={16} />
                </span>
            </ToolbarTipButton>
            <div className="lesson-editor-insert-menu-wrap relative shrink-0 self-center">
            <ToolbarTipButton
                className={insertToggleClass}
                label={insertMenuLabel}
                hint={insertMenuAria}
                aria-expanded={open}
                aria-haspopup="true"
                aria-controls="lesson-editor-insert-panel"
                onClick={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    setOpen((v) => !v);
                }}
                ref={toggleRef}
            >
                {layout === 'mobile-split' ? (
                    <>
                        <span
                            aria-hidden="true"
                            className="lesson-editor-tool-chip__glyph lesson-editor-tool-chip__glyph--plus"
                        >
                            +
                        </span>
                        <span aria-hidden="true" className="lesson-editor-tool-chip__chev">
                            ▾
                        </span>
                    </>
                ) : (
                    <>
                        {insertMenuLabel}
                        <span aria-hidden="true" className="lesson-editor-tool-chip__chev">
                            ▾
                        </span>
                    </>
                )}
            </ToolbarTipButton>
            <div
                ref={panelRef}
                id="lesson-editor-insert-panel"
                className={`lesson-editor-insert-panel${open ? '' : ' hidden'} absolute left-0 top-[calc(100%+0.35rem)] z-[90] flex flex-col gap-1 min-w-[11.5rem] max-w-[min(18rem,calc(100vw-2rem))] p-2 rounded-xl border border-amber-300/50 dark:border-amber-600/50 bg-white dark:bg-slate-900 shadow-xl`}
                role="menu"
                aria-label={insertMenuAria}
            >
                {blockOpts.map(([type, emoji, label]) => (
                    <button
                        key={type}
                        type="button"
                        className="block-btn lesson-editor-insert-panel__opt"
                        data-type={type}
                        onClick={() => {
                            close();
                            onInsertBlock?.(type);
                        }}
                    >
                        <span className="arborito-emoji-glyph" aria-hidden="true">
                            <ChromeEmoji emoji={emoji} size={16} />
                        </span>{' '}
                        {label}
                    </button>
                ))}
            </div>
            </div>
        </div>
    );
}

/** Lesson editor formatting toolbar (construction lesson edit mode). */
export function LessonEditorToolbarContent({
    ui,
    undoButtonId = 'btn-lesson-undo',
    includeQuizShortcut = true,
    includeHeadingStructure = false,
    layout = 'default',
    toolbarHandlers,
}) {
    const toolbarLabel = ui.lessonToolbar || 'Lesson editor';

    if (layout === 'mobile-split') {
        return (
            <div
                className="arborito-lesson-toolbar-clusters flex flex-nowrap items-center gap-1.5 min-w-0 shrink-0"
                role="group"
                aria-label={toolbarLabel}
            >
                <div className="arborito-lesson-toolbar-cluster arborito-lesson-toolbar-cluster--format flex flex-nowrap items-center gap-0.5 px-1 py-0.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 box-border shrink-0">
                    <div className="lesson-editor-toolbar-row lesson-editor-toolbar-row--format flex flex-nowrap items-center gap-1 min-w-0">
                        <LessonEditorFormatRow
                            ui={ui}
                            undoButtonId={undoButtonId}
                            includeHeadingStructure={includeHeadingStructure}
                            toolbarHandlers={toolbarHandlers}
                        />
                    </div>
                </div>
                <div className="arborito-lesson-toolbar-cluster arborito-lesson-toolbar-cluster--insert flex flex-nowrap items-center gap-0.5 px-0.5 py-0.5 rounded-xl bg-indigo-50/85 dark:bg-indigo-950/25 box-border shrink-0">
                    <div className="lesson-editor-toolbar-row lesson-editor-toolbar-row--insert flex flex-nowrap items-center gap-0.5 min-w-0">
                        {includeQuizShortcut ? (
                            <LessonEditorInsertBlock ui={ui} layout={layout} toolbarHandlers={toolbarHandlers} />
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="lesson-editor-toolbar-rows flex flex-col gap-1 min-w-0 flex-1" role="group" aria-label={toolbarLabel}>
            <div className="lesson-editor-toolbar-row lesson-editor-toolbar-row--primary flex flex-nowrap items-center gap-1 min-w-0">
                <LessonEditorFormatRow
                    ui={ui}
                    undoButtonId={undoButtonId}
                    includeHeadingStructure={includeHeadingStructure}
                    toolbarHandlers={toolbarHandlers}
                />
                {includeQuizShortcut ? (
                    <LessonEditorInsertBlock ui={ui} layout={layout} toolbarHandlers={toolbarHandlers} />
                ) : null}
                <span
                    className="lesson-editor-toolbar-spacer flex flex-1 min-w-[0.1rem] sm:min-w-[0.25rem]"
                    aria-hidden="true"
                />
            </div>
        </div>
    );
}

export function LessonEditorToolbarBridge({ ui, isMobile, toolbarHandlers }) {
const content = (
        <LessonEditorToolbarContent
            ui={ui}
            undoButtonId="btn-lesson-undo"
            includeQuizShortcut
            includeHeadingStructure={false}
            layout={isMobile ? 'mobile-split' : 'default'}
            toolbarHandlers={toolbarHandlers}
        />
    );

    if (isMobile) {
        return content;
    }

    return (
        <div className="arborito-lesson-toolbar-inner flex items-center flex-nowrap gap-0.5 px-1 py-0.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 box-border min-w-0 max-w-full">
            {content}
        </div>
    );
}
