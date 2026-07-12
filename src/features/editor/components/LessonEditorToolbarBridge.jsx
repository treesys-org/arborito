import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { MATH_SYMBOL_GROUPS } from '../../../shared/lib/math-render.js';
import { useLessonEditorDropdownPortal } from './lesson-editor-dropdown-portal.jsx';

/**
 * Lesson editor toolbar (format + insert) while constructing a lesson.
 * Styles: features/learning/styles/learning/lesson-toc-nav.css
 * Wired from: features/learning/components/LessonHeader.jsx
 */
const ToolbarTipButton = forwardRef(function ToolbarTipButton(
    {
        id,
        className,
        label,
        hint,
        disabled,
        children,
        onClick,
        onMouseDown,
        onPointerDown,
        'data-cmd': dataCmd,
        'data-val': dataVal,
        'data-arbor-tour': dataArborTour,
        'aria-expanded': ariaExpanded,
        'aria-haspopup': ariaHaspopup,
        'aria-controls': ariaControls,
        role,
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
            onMouseDown={onMouseDown}
            onPointerDown={onPointerDown}
        >
            {children}
        </button>
    );
});

function LessonEditorFormatMenu({ ui, onToolCmd, toolbarHandlers }) {
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);
    const toggleRef = useRef(null);
    const { renderPortal } = useLessonEditorDropdownPortal(open, close, toggleRef);

    const stashSel = () => toolbarHandlers?.stashFormatSelection?.();

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

    const structureLabel = ui.editorToolbarStructure || 'Structure';
    const optTitle = ui.editorToolbarTitleButton || 'Title';
    const optSection = ui.editorToolbarSubHeader || 'Part';
    const optSubsection = ui.editorToolbarTopicButton || 'Subpart';

    const runCmd = (cmd, val) => (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        stashSel();
        onToolCmd?.(cmd, val);
        close();
    };

    const keepEditorSel = {
        onMouseDown: (e) => {
            e.preventDefault();
            stashSel();
        },
        onPointerDown: (e) => {
            e.preventDefault();
            stashSel();
        },
    };

    return (
        <div className="lesson-editor-format-wrap">
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
                    setOpen((v) => {
                        if (!v) stashSel();
                        return !v;
                    });
                }}
                onPointerDown={() => {
                    stashSel();
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
            {renderPortal(
                'lesson-editor-format-panel',
                'lesson-editor-format-panel',
                fmtAria,
                <>
                <div className="lesson-editor-format-panel__section">
                    <p className="arborito-eyebrow m-0">{structureLabel}</p>
                    <div className="lesson-editor-format-panel__rows">
                        {[
                            ['H1', optTitle],
                            ['H2', optSection],
                            ['H3', optSubsection],
                        ].map(([val, text]) => (
                            <ToolbarTipButton
                                key={val}
                                className="tool-btn lesson-editor-tool-chip lesson-editor-menu-item"
                                label={text}
                                data-cmd="formatBlock"
                                data-val={val}
                                role="menuitem"
                                onMouseDown={keepEditorSel.onMouseDown}
                                onPointerDown={keepEditorSel.onPointerDown}
                                onClick={runCmd('formatBlock', val)}
                            >
                                {text}
                            </ToolbarTipButton>
                        ))}
                    </div>
                </div>
                <div className="lesson-editor-format-panel__section">
                    <p className="arborito-eyebrow m-0">{sizeLabel}</p>
                    <div className="lesson-editor-format-panel__rows">
                        {[
                            ['normal', optNormal],
                            ['lg', optLarge],
                            ['md', optMed],
                            ['sm', optSmall],
                        ].map(([val, text]) => (
                            <ToolbarTipButton
                                key={val}
                                className="tool-btn lesson-editor-tool-chip lesson-editor-menu-item"
                                label={text}
                                data-cmd="inlineSize"
                                data-val={val}
                                role="menuitem"
                                onMouseDown={keepEditorSel.onMouseDown}
                                onPointerDown={keepEditorSel.onPointerDown}
                                onClick={runCmd('inlineSize', val)}
                            >
                                {text}
                            </ToolbarTipButton>
                        ))}
                    </div>
                </div>
                <div className="lesson-editor-format-panel__section">
                    <p className="arborito-eyebrow m-0">{alignLabel}</p>
                    <div className="lesson-editor-format-panel__rows lesson-editor-format-panel__rows--align">
        {[
                            ['left', optLeft],
                            ['center', optCenter],
                            ['right', optRight],
                        ].map(([val, text]) => (
                            <ToolbarTipButton
                                key={val}
                                className="tool-btn lesson-editor-tool-chip lesson-editor-menu-item"
                                label={text}
                                data-cmd="align"
                                data-val={val}
                                role="menuitem"
                                onMouseDown={keepEditorSel.onMouseDown}
                                onPointerDown={keepEditorSel.onPointerDown}
                                onClick={runCmd('align', val)}
                            >
                                {text}
                            </ToolbarTipButton>
                        ))}
                    </div>
                </div>
                <div className="lesson-editor-format-panel__section">
                    <p className="arborito-eyebrow m-0">{ui.editorToolbarLists || 'Lists'}</p>
                    <div className="lesson-editor-format-panel__rows">
                        <ToolbarTipButton
                            className="tool-btn lesson-editor-tool-chip lesson-editor-menu-item"
                            label={ui.editorToolbarBullets || 'Bullet list'}
                            data-cmd="insertUnorderedList"
                            role="menuitem"
                            onMouseDown={keepEditorSel.onMouseDown}
                            onPointerDown={keepEditorSel.onPointerDown}
                            onClick={runCmd('insertUnorderedList')}
                        >
                            • {ui.editorToolbarBullets || 'Bullets'}
                        </ToolbarTipButton>
                        <ToolbarTipButton
                            className="tool-btn lesson-editor-tool-chip lesson-editor-menu-item"
                            label={ui.editorToolbarNumbered || 'Numbered list'}
                            data-cmd="insertOrderedList"
                            role="menuitem"
                            onMouseDown={keepEditorSel.onMouseDown}
                            onPointerDown={keepEditorSel.onPointerDown}
                            onClick={runCmd('insertOrderedList')}
                        >
                            1. {ui.editorToolbarNumbered || 'Numbered'}
                        </ToolbarTipButton>
                    </div>
                </div>
                <div className="lesson-editor-format-panel__section lesson-editor-format-panel__section--foot">
                    <ToolbarTipButton
                        className="tool-btn lesson-editor-tool-chip lesson-editor-menu-item lesson-editor-menu-item--full"
                        label={lineBreakLabel}
                        data-cmd="insertBr"
                        role="menuitem"
                        onMouseDown={keepEditorSel.onMouseDown}
                        onPointerDown={keepEditorSel.onPointerDown}
                        onClick={runCmd('insertBr')}
                    >
                        ↵ {lineBreakLabel}
                    </ToolbarTipButton>
                </div>
                </>
            )}
        </div>
    );
}

function LessonEditorFormatRow({ ui, undoButtonId, includeHeadingStructure, toolbarHandlers, showInlineLists }) {
    const undoLabel = ui.conUndoDockLabel || ui.editorToolbarUndo || 'Undo';
    const { onUndo, onToolCmd, undoDisabled } = toolbarHandlers || {};

    const cmd = (c, v) => () => onToolCmd?.(c, v);
    const stashSel = () => toolbarHandlers?.stashFormatSelection?.();
    const keepEditorSelMouse = (e) => {
        e.preventDefault();
        stashSel();
    };
    const keepEditorSelTouch = (e) => {
        e.stopPropagation();
        stashSel();
    };

    return (
        <>
            <ToolbarTipButton
                id={undoButtonId}
                className="tool-btn lesson-editor-tool-chip lesson-editor-tool-chip--icon lesson-editor-tool-chip--cmd"
                label={undoLabel}
                disabled={undoDisabled}
                onClick={() => onUndo?.()}
            >
                ↩
            </ToolbarTipButton>
            <div className="lesson-editor-toolbar-divider" aria-hidden="true" />
            <ToolbarTipButton
                className="tool-btn lesson-editor-tool-chip lesson-editor-tool-chip--icon lesson-editor-tool-chip--cmd lesson-editor-tool-chip--cmd-bold"
                label="Bold"
                data-cmd="bold"
                onMouseDown={keepEditorSelMouse}
                onTouchStart={keepEditorSelTouch}
                onClick={cmd('bold')}
            >
                B
            </ToolbarTipButton>
            <ToolbarTipButton
                className="tool-btn lesson-editor-tool-chip lesson-editor-tool-chip--icon lesson-editor-tool-chip--cmd lesson-editor-tool-chip--cmd-italic"
                label="Italic"
                data-cmd="italic"
                onMouseDown={keepEditorSelMouse}
                onTouchStart={keepEditorSelTouch}
                onClick={cmd('italic')}
            >
                I
            </ToolbarTipButton>
            <LessonEditorFormatMenu ui={ui} onToolCmd={onToolCmd} toolbarHandlers={toolbarHandlers} />
            {showInlineLists ? (
                <>
                    <ToolbarTipButton
                        className="tool-btn lesson-editor-tool-chip lesson-editor-tool-chip--icon lesson-editor-tool-chip--cmd"
                        label={ui.editorToolbarBullets || 'Bullet list'}
                        data-cmd="insertUnorderedList"
                        onClick={cmd('insertUnorderedList')}
                    >
                        •
                    </ToolbarTipButton>
                    <ToolbarTipButton
                        className="tool-btn lesson-editor-tool-chip lesson-editor-tool-chip--icon lesson-editor-tool-chip--cmd"
                        label={ui.editorToolbarNumbered || 'Numbered list'}
                        data-cmd="insertOrderedList"
                        onClick={cmd('insertOrderedList')}
                    >
                        1.
                    </ToolbarTipButton>
                </>
            ) : null}
            {includeHeadingStructure ? (
                <>
                    <ToolbarTipButton
                        className="tool-btn lesson-editor-tool-chip lesson-editor-tool-chip--text lesson-editor-tool-chip--heading"
                        label={ui.editorToolbarTitleButton || 'Title'}
                        hint={ui.editorTitleAttrH1}
                        data-cmd="formatBlock"
                        data-val="H1"
                        onClick={cmd('formatBlock', 'H1')}
                    >
                        {ui.editorToolbarTitleButton}
                    </ToolbarTipButton>
                    <ToolbarTipButton
                        className="tool-btn lesson-editor-tool-chip lesson-editor-tool-chip--text lesson-editor-tool-chip--heading"
                        label={ui.editorToolbarSubHeader || 'Part'}
                        hint={ui.editorTitleAttrH2}
                        data-cmd="formatBlock"
                        data-val="H2"
                        onClick={cmd('formatBlock', 'H2')}
                    >
                        {ui.editorToolbarSubHeader}
                    </ToolbarTipButton>
                    <ToolbarTipButton
                        className="tool-btn lesson-editor-tool-chip lesson-editor-tool-chip--text lesson-editor-tool-chip--heading"
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

function LessonEditorInsertBlock({ ui, layout }) {
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);
    const toggleRef = useRef(null);
    const { renderPortal } = useLessonEditorDropdownPortal(open, close, toggleRef, { variant: 'insert' });
    const mobileKeyActions = layout === 'mobile-split';

    useEffect(() => {
        const onDelegatedClose = () => close();
        window.addEventListener('arborito-lesson-insert-panel-close', onDelegatedClose);
        return () => window.removeEventListener('arborito-lesson-insert-panel-close', onDelegatedClose);
    }, [close]);

    const insertMenuLabel = ui.editorToolbarInsertBlocks || ui.editorToolbarMore || 'Insert';
    const insertMenuAria = ui.editorToolbarInsertBlocksAria || ui.editorToolbarMore || insertMenuLabel;
    const quizLabel = ui.editorToolbarQuizShortcut || ui.lessonQuizLabel || 'Quiz';
    const quizHint = ui.editorToolbarQuizShortcutHint || quizLabel;
    const imgLabel = ui.editorBlockInsertImage || ui.mediaPlaceholderImage || 'Image';
    const vidLabel = ui.editorBlockInsertVideo || ui.mediaPlaceholderVideo || 'Video';
    const audLabel = ui.editorBlockInsertAudio || ui.mediaPlaceholderAudio || 'Audio';

    const insertToggleClass = mobileKeyActions
        ? 'lesson-editor-insert-toggle arborito-lesson-key-action arborito-lesson-key-action--insert'
        : 'lesson-editor-insert-toggle lesson-editor-tool-chip lesson-editor-tool-chip--insert lesson-editor-insert-toggle--default';

    const quizBtnClass = mobileKeyActions
        ? 'lesson-editor-toolbar-quiz arborito-lesson-key-action arborito-lesson-key-action--quiz'
        : 'lesson-editor-toolbar-quiz lesson-editor-tool-chip lesson-editor-tool-chip--icon';

    const blockOpts = [
        ['audio', '🔊', audLabel],
        ['callout', '💡', ui.editorBlockAddNote],
        ['code', '⌨', ui.editorBlockInsertCode || ui.codeTerminalLabel || 'Command'],
        ['game', '🎮', ui.editorBlockGame || 'Game'],
        ['image', '🖼', imgLabel],
        ['math', '∑', ui.editorBlockMath || 'Math formula'],
        ['video', '🎬', vidLabel],
    ].sort((a, b) => String(a[2]).localeCompare(String(b[2]), undefined, { sensitivity: 'base' }));

    const mathGroups = MATH_SYMBOL_GROUPS.map((group) => ({
        label: ui[group.labelKey] || group.labelKey,
        symbols: group.symbols,
    }));

    return (
        <div
            className={`lesson-editor-insert-wrap${mobileKeyActions ? ' arborito-lesson-key-actions' : ''}`}
            data-arbor-tour="lesson-edit-insert"
        >
            <ToolbarTipButton
                id="btn-insert-quiz"
                className={quizBtnClass}
                label={quizLabel}
                hint={quizHint}
                data-arbor-tour="lesson-edit-quiz"
            >
                {mobileKeyActions ? (
                    <ChromeEmoji emoji="📋" size={18} />
                ) : (
                    <span className="arborito-emoji-glyph" aria-hidden="true">
                        <ChromeEmoji emoji="📋" size={16} />
                    </span>
                )}
            </ToolbarTipButton>
            <div className="lesson-editor-insert-menu-wrap">
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
                    {mobileKeyActions ? (
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.75"
                            strokeLinecap="round"
                            aria-hidden="true"
                            className="arborito-lesson-key-action__plus"
                        >
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                    ) : (
                        <>
                            {insertMenuLabel}
                            <span aria-hidden="true" className="lesson-editor-tool-chip__chev">
                                ▾
                            </span>
                        </>
                    )}
                </ToolbarTipButton>
                {renderPortal(
                    'lesson-editor-insert-panel',
                    'lesson-editor-insert-panel',
                    insertMenuAria,
                    <>
                    {blockOpts.map(([type, emoji, label]) => (
                        <button
                            key={type}
                            type="button"
                            className="block-btn lesson-editor-insert-panel__opt"
                            data-type={type}
                        >
                            <span className="arborito-emoji-glyph" aria-hidden="true">
                                <ChromeEmoji emoji={emoji} size={16} />
                            </span>{' '}
                            {label}
                        </button>
                    ))}
                    <div className="lesson-editor-insert-panel__math" role="group" aria-label={ui.editorMathSymbols || 'Math symbols'}>
                        <p className="arborito-eyebrow m-0 lesson-editor-insert-panel__math-label">
                            {ui.editorMathSymbols || 'Math symbols'}
                        </p>
                        {mathGroups.map((group) => (
                            <div key={group.label} className="lesson-editor-insert-panel__math-group">
                                <p className="lesson-editor-insert-panel__math-group-label">{group.label}</p>
                                <div className="lesson-editor-insert-panel__math-grid">
                                    {group.symbols.map((sym) => (
                                        <button
                                            key={sym}
                                            type="button"
                                            className="lesson-editor-math-symbol"
                                            data-math-char={sym}
                                            aria-label={sym}
                                            title={sym}
                                        >
                                            {sym}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    </>
                )}
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
            <div className="arborito-lesson-toolbar-clusters" role="group" aria-label={toolbarLabel}>
                <div className="arborito-lesson-toolbar-cluster arborito-lesson-toolbar-cluster--format">
                    <div className="lesson-editor-toolbar-row lesson-editor-toolbar-row--format">
                        <LessonEditorFormatRow
                            ui={ui}
                            undoButtonId={undoButtonId}
                            includeHeadingStructure={includeHeadingStructure}
                            toolbarHandlers={toolbarHandlers}
                            showInlineLists={false}
                        />
                    </div>
                </div>
                <div className="arborito-lesson-toolbar-cluster arborito-lesson-toolbar-cluster--insert">
                    <div className="lesson-editor-toolbar-row lesson-editor-toolbar-row--insert">
                        {includeQuizShortcut ? (
                            <LessonEditorInsertBlock ui={ui} layout={layout} />
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="lesson-editor-toolbar-rows" role="group" aria-label={toolbarLabel}>
            <div className="lesson-editor-toolbar-row lesson-editor-toolbar-row--primary">
                <LessonEditorFormatRow
                    ui={ui}
                    undoButtonId={undoButtonId}
                    includeHeadingStructure={includeHeadingStructure}
                    toolbarHandlers={toolbarHandlers}
                    showInlineLists={false}
                />
                {includeQuizShortcut ? <LessonEditorInsertBlock ui={ui} layout={layout} /> : null}
                <span className="lesson-editor-toolbar-spacer" aria-hidden="true" />
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

    return <div className="arborito-lesson-toolbar-inner">{content}</div>;
}
