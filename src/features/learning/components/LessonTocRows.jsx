import { useEffect, useRef, useState } from 'react';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { CompletedTickIcon } from '../../../shared/ui/CompletedTickIcon.jsx';
import { tocHeadingTitleForEdit } from '../api/lesson-toc-mutations.js';
import { formatCountLabel } from '../../../shared/lib/format-count-label.js';
import { isSyntheticIntroItem } from '../api/lesson-section-slices.js';
import { useBindMobileTapRef } from '../../../shared/ui/useBindMobileTap.js';
import { useViewportShell } from '../../../shared/ui/breakpoints.js';

function TocDragHandle({ label, disabled, muted, onPointerDown }) {
    return (
        <button
            type="button"
            className={`arborito-lesson-toc-drag${muted || disabled ? ' arborito-lesson-toc-drag--muted' : ''}`}
            disabled={disabled}
            aria-label={label}
            title={label}
            onPointerDown={onPointerDown}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            <svg
                className="arborito-lesson-toc-drag__svg"
                width="14"
                height="18"
                viewBox="0 0 14 18"
                aria-hidden="true"
            >
                <circle cx="4" cy="3" r="1.35" fill="currentColor" />
                <circle cx="10" cy="3" r="1.35" fill="currentColor" />
                <circle cx="4" cy="9" r="1.35" fill="currentColor" />
                <circle cx="10" cy="9" r="1.35" fill="currentColor" />
                <circle cx="4" cy="15" r="1.35" fill="currentColor" />
                <circle cx="10" cy="15" r="1.35" fill="currentColor" />
            </svg>
        </button>
    );
}

function TocCollapseBtn({ expanded, label, onToggle }) {
    return (
        <button
            type="button"
            className={`arborito-lesson-toc-collapse${expanded ? '' : ' is-collapsed'}`}
            aria-label={label}
            title={label}
            aria-expanded={expanded ? 'true' : 'false'}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle?.();
            }}
        >
            <svg
                className="arborito-lesson-toc-collapse__svg"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                aria-hidden="true"
            >
                <path
                    d="M3.2 4.2 L6 7.2 L8.8 4.2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </button>
    );
}

export function TocReadRow({ item, idx, active, completed, disabled, style, onSectionClick, onTickToggle, ui, examPreStart = false }) {
    const { depthCls, depthTag, fontSize, iconSize, paddingLeft, listDisplay } = style;
    const quizOnly = item.kind === 'quiz';
    const examFinal = item.kind === 'exam-final';
    const prestartActive = examPreStart && active;
    const rowRef = useRef(null);
    const { mobile } = useViewportShell();

    const onActivate = () => {
        if (!disabled) onSectionClick?.(idx);
    };

    const onMobileTap = (e) => {
        const t = e?.target instanceof Element ? e.target : null;
        if (t?.closest?.('.js-toc-tick')) {
            onTickToggle?.(idx);
            return;
        }
        onActivate();
    };

    useBindMobileTapRef(rowRef, onMobileTap, mobile && !disabled);

    return (
        <button
            ref={rowRef}
            type="button"
            className={`btn-toc arborito-lesson-toc-item ${quizOnly ? 'arborito-lesson-toc-item--quiz' : ''} ${examFinal ? 'arborito-lesson-toc-item--exam-final' : ''} ${examPreStart ? 'arborito-lesson-toc-item--exam-prestart' : ''} ${disabled ? 'arborito-lesson-toc-item--locked' : ''} ${depthCls} text-left py-3 px-3 rounded-xl ${fontSize} transition-colors w-full flex items-start gap-3 whitespace-normal border border-transparent ${active ? 'is-active' : ''} ${prestartActive ? 'is-active-exam-awaiting' : ''}`}
            data-idx={idx}
            data-toc-depth={depthTag}
            aria-current={active ? 'true' : undefined}
            aria-disabled={disabled ? 'true' : undefined}
            disabled={disabled}
            style={{ paddingLeft: `${paddingLeft}px` }}
            onClick={mobile ? undefined : onActivate}
        >
            <div
                className={`js-toc-tick mt-0.5 flex-shrink-0 ${iconSize} flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors`}
                aria-hidden={completed ? 'false' : 'true'}
                onClick={(e) => {
                    e.stopPropagation();
                    onTickToggle?.(idx);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onTickToggle?.(idx);
                    }
                }}
                role="button"
                tabIndex={0}
            >
                {completed ? (
                    <span
                        className="arborito-toc-tick-mark text-green-500 arborito-no-emojify"
                        aria-label={ui.lessonFinished || 'Completed'}
                    >
                        <CompletedTickIcon size={14} />
                    </span>
                ) : (
                    <span
                        className={`arborito-toc-tick-dot w-2 h-2 rounded-full ${
                            prestartActive
                                ? 'bg-slate-400 dark:bg-slate-500 border border-slate-400/70 dark:border-slate-500/70'
                                : active
                                  ? 'bg-sky-500'
                                  : 'border border-slate-300 dark:border-slate-600'
                        }`}
                    />
                )}
            </div>
            <span className="leading-tight break-words pt-0.5">
                {examFinal ? (
                    <>
                        <ChromeEmoji emoji="🏁" size={14} className="arborito-emoji-glyph inline-block mr-0.5" />{' '}
                    </>
                ) : quizOnly ? (
                    <>
                        <ChromeEmoji emoji="🎯" size={14} className="arborito-emoji-glyph inline-block mr-0.5" />{' '}
                    </>
                ) : null}
                {listDisplay}
                {quizOnly ? (
                    <span className="arborito-lesson-toc-quiz-pill">{ui.lessonQuizLabel || 'Quiz'}</span>
                ) : null}
            </span>
        </button>
    );
}

export function TocConstructRow({
    item,
    idx,
    active,
    style,
    headingRaw,
    tocInlineEditIdx,
    arcadeStatus,
    questionCount = 0,
    tocFilter,
    ui,
    pathBadge = '',
    hasChildren = false,
    childCount = 0,
    collapsed = false,
    dragMuted = false,
    isDragSource = false,
    isDragSubtree = false,
    isFirstChild = false,
    nestDepth = 0,
    onSectionClick,
    onRenameStart,
    onRenameCommit,
    onRenameCancel,
    onAddSub,
    onRemove,
    onCollapseToggle,
    onDragPointerDown,
}) {
    const editInputRef = useRef(null);
    const sectionBtnRef = useRef(null);
    const { mobile } = useViewportShell();
    const [editValue, setEditValue] = useState('');
    const { depthCls, depthTag, fontSize, depthIndent, listDisplay } = style;
    const canEditRow = !isSyntheticIntroItem(item);
    const editing = tocInlineEditIdx === idx;
    const filterBlocked = String(tocFilter || '').trim().length > 0;
    const filterHint = ui.lessonTocReorderFilterBlocked || 'Clear the filter to reorder';
    const dragLabel = filterBlocked
        ? filterHint
        : ui.lessonTocDragReorder || 'Reorder in outline';
    const nestHint = ui.lessonTocDragNestHint || ui.lessonTocDropGutterNest || '';
    const renameHint = ui.lessonTocRename || 'Rename';
    const deleteHint = ui.lessonTocDeleteSection || ui.graphDelete || 'Delete section';
    const addSubHint = (ui.lessonTocAddSubsectionHint || ui.lessonTocAddSubsection || 'Add sub-topic').trim();
    const openSectionHint = (ui.lessonTocTapSectionHint || '').trim();
    const renameViaBtn = (ui.lessonTocRenameViaPencilHint || '').trim();
    const nameTitle = canEditRow
        ? [openSectionHint, renameViaBtn ? `${renameHint}: ${renameViaBtn}` : renameHint].filter(Boolean).join(' · ')
        : '';
    const collapseLbl = collapsed
        ? ui.lessonTocExpandBranch || 'Show subsections'
        : ui.lessonTocCollapseBranch || 'Hide subsections';
    const hiddenKidsLbl =
        collapsed && childCount > 0
            ? formatCountLabel(
                  childCount,
                  ui.lessonTocHiddenChildrenOne || '1 hidden',
                  ui.lessonTocHiddenChildren || '{count} hidden'
              )
            : '';
    const dragKidsLbl =
        isDragSource && childCount > 0
            ? formatCountLabel(
                  childCount,
                  ui.lessonTocDragChildrenOne || 'moves with 1 subsection',
                  ui.lessonTocDragChildren || 'moves with {count} subsections'
              )
            : '';

    useEffect(() => {
        if (!editing) return undefined;
        setEditValue(tocHeadingTitleForEdit(headingRaw));
        const t = requestAnimationFrame(() => {
            try {
                editInputRef.current?.focus();
                editInputRef.current?.select();
            } catch {
                /* ignore */
            }
        });
        return () => cancelAnimationFrame(t);
    }, [editing, headingRaw]);

    useEffect(() => {
        if (!editing) return undefined;
        /* Ignore the opening tap’s residual pointer/mouse events (touch → synthetic mouse). */
        const ignoreUntil = Date.now() + 450;
        const onDocPtr = (ev) => {
            if (Date.now() < ignoreUntil) return;
            const el = ev.target;
            const inp = editInputRef.current;
            if (!(el instanceof Node) || !inp) return;
            if (el === inp || inp.contains(el)) return;
            onRenameCommit?.(idx, editValue, item?.id);
        };
        document.addEventListener('pointerdown', onDocPtr, true);
        return () => document.removeEventListener('pointerdown', onDocPtr, true);
    }, [editing, idx, editValue, item?.id, onRenameCommit]);

    const onSectionActivate = () => onSectionClick?.(idx);
    useBindMobileTapRef(sectionBtnRef, onSectionActivate, mobile && !editing);

    if (editing && canEditRow) {
        const editHint = (ui.lessonTocEditHint || '').trim();
        return (
            <div
                className={`arborito-lesson-toc-row ${depthCls} flex flex-col gap-2 py-2 px-2 rounded-xl border border-amber-300/50 dark:border-amber-600/40 bg-amber-50/80 dark:bg-amber-950/30 w-full`}
                data-toc-idx={idx}
                data-toc-id={item?.id || undefined}
                data-toc-depth={depthTag}
                style={{ marginLeft: `${depthIndent}px` }}
            >
                <input
                    ref={editInputRef}
                    type="text"
                    className="js-toc-edit-title w-full min-w-0 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm py-1.5 px-2 font-bold"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder={editHint || renameHint}
                    aria-label={renameHint}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            onRenameCommit?.(idx, editValue, item?.id);
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            onRenameCancel?.();
                        }
                    }}
                />
            </div>
        );
    }

    const arcadeReadyLbl = ui.lessonTocArcadeReady || 'Quiz ready for Arcade';
    const arcadeDraftLbl = ui.lessonTocArcadeDraft || 'Quiz incomplete';
    const questionCountLbl = formatCountLabel(
        questionCount,
        ui.lessonTocQuizQuestionCountOne || '1 question',
        ui.lessonTocQuizQuestionCount || '{count} questions'
    );

    return (
        <div
            className={`arborito-lesson-toc-row arborito-lesson-toc-row--construct${depthCls ? ` ${depthCls}` : ''}${active ? ' is-active' : ''}${isDragSource ? ' is-toc-dragging' : ''}${isDragSubtree ? ' is-toc-drag-subtree' : ''}${isFirstChild ? ' is-toc-first-child' : ''}`}
            data-toc-idx={idx}
            data-toc-id={item?.id || undefined}
            data-toc-depth={depthTag}
            data-toc-nest={String(Number.isFinite(nestDepth) ? nestDepth : 0)}
            style={{ marginLeft: `${depthIndent}px` }}
        >
            {canEditRow ? (
                <div className="arborito-toc-lead" aria-label={dragLabel}>
                    <TocDragHandle
                        label={nestHint ? `${dragLabel}. ${nestHint}` : dragLabel}
                        disabled={filterBlocked}
                        muted={dragMuted || filterBlocked}
                        onPointerDown={(e) => {
                            if (filterBlocked) return;
                            onDragPointerDown?.(e, idx);
                        }}
                    />
                    {hasChildren ? (
                        <TocCollapseBtn
                            expanded={!collapsed}
                            label={collapseLbl}
                            onToggle={() => onCollapseToggle?.(item?.id)}
                        />
                    ) : (
                        <span className="arborito-lesson-toc-collapse arborito-lesson-toc-collapse--spacer" aria-hidden="true" />
                    )}
                </div>
            ) : null}
            <button
                ref={sectionBtnRef}
                type="button"
                className={`btn-toc arborito-lesson-toc-item text-left py-2 px-2 rounded-xl ${fontSize} transition-colors border border-transparent${active ? ' is-active' : ''}`}
                data-idx={idx}
                aria-current={active ? 'true' : undefined}
                onClick={mobile ? undefined : onSectionActivate}
            >
                <span
                    className={`leading-snug min-w-0 text-left js-toc-name-slot block py-1 ${canEditRow ? 'cursor-pointer' : 'cursor-default opacity-90'}`}
                    data-toc-renamable={canEditRow ? '1' : '0'}
                    title={nameTitle}
                >
                    {pathBadge ? (
                        <span className="arborito-lesson-toc-path" title={pathBadge}>
                            {pathBadge}
                        </span>
                    ) : null}
                    <span className="arborito-lesson-toc-title-text">{listDisplay}</span>
                    {hiddenKidsLbl ? (
                        <span className="arborito-lesson-toc-collapsed-count">{hiddenKidsLbl}</span>
                    ) : null}
                    {dragKidsLbl ? (
                        <span className="arborito-lesson-toc-drag-kids">{dragKidsLbl}</span>
                    ) : null}
                </span>
            </button>
            {canEditRow ? (
                <div className="arborito-toc-row-actions">
                    {arcadeStatus !== 'none' ? (
                        <button
                            type="button"
                            className={`js-toc-arcade-badge arborito-lesson-toc-arcade ${arcadeStatus === 'ready' ? 'arborito-lesson-toc-arcade--ready' : 'arborito-lesson-toc-arcade--draft'}`}
                            data-idx={idx}
                            aria-label={
                                arcadeStatus === 'ready'
                                    ? `${arcadeReadyLbl}: ${questionCountLbl}`
                                    : `${arcadeDraftLbl}: ${questionCountLbl}`
                            }
                            title={
                                arcadeStatus === 'ready'
                                    ? `${arcadeReadyLbl}: ${questionCountLbl}`
                                    : `${arcadeDraftLbl}: ${questionCountLbl}`
                            }
                        >
                            <ChromeEmoji emoji="🎮" size={16} />
                            {questionCount > 0 ? (
                                <span className="arborito-lesson-toc-arcade-count">{questionCount}</span>
                            ) : null}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className="js-toc-rename arborito-lesson-toc-rename"
                        data-idx={idx}
                        aria-label={renameHint}
                        title={renameHint}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRenameStart?.(idx);
                        }}
                    >
                        <ChromeEmoji emoji="✏️" size={14} />
                    </button>
                    <button
                        type="button"
                        className="js-toc-row-add-sub arborito-lesson-toc-add-inline"
                        data-idx={idx}
                        aria-label={addSubHint}
                        title={addSubHint}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onAddSub?.(idx, item?.id);
                        }}
                    >
                        <span aria-hidden="true">+</span>
                    </button>
                    <button
                        type="button"
                        className="js-toc-construct-delete arborito-lesson-toc-del"
                        data-idx={idx}
                        aria-label={deleteHint}
                        title={deleteHint}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRemove?.(idx);
                        }}
                    >
                        <span aria-hidden="true">✕</span>
                    </button>
                </div>
            ) : null}
        </div>
    );
}
