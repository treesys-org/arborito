import { useLearning } from '../hooks/useLearning.js';
import { useEffect, useRef, useState } from 'react';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { tocPlainLineForList, tocLabelForDisplay } from '../api/content-toc.js';
import { getTocLineRanges, tocHeadingTitleForEdit } from '../api/lesson-toc-mutations.js';
import { getSectionArcadeQuizStatus } from '../api/quiz-status.js';
import { isTocSectionCompleted } from '../api/content-toc.js';

function TocDragGrip({ idx, canEditRow, ui }) {
    const dragLabel = ui.lessonTocDragReorder || 'Reorder section';
    const dragHint = (ui.lessonTocDragNestHint || '').trim();
    const gutterNest = (ui.lessonTocDropGutterNest || '').trim();
    const dragTitle = [dragHint ? `${dragLabel} — ${dragHint}` : dragLabel, gutterNest].filter(Boolean).join(' · ');
    const gripSvg = (
        <svg className="arborito-lesson-toc-drag__svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="7" r="1.5" />
            <circle cx="15" cy="7" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="17" r="1.5" />
            <circle cx="15" cy="17" r="1.5" />
        </svg>
    );
    if (canEditRow) {
        return (
            <button
                type="button"
                className="js-toc-drag-handle arborito-lesson-toc-drag"
                draggable
                data-idx={idx}
                aria-label={dragLabel}
                title={dragTitle}
            >
                {gripSvg}
            </button>
        );
    }
    return (
        <span className="arborito-lesson-toc-drag arborito-lesson-toc-drag--muted" aria-hidden="true">
            {gripSvg}
        </span>
    );
}

function TocReadRow({ item, idx, active, completed, style, onSectionClick, onTickToggle }) {
    const { depthCls, depthTag, fontSize, iconSize, paddingLeft, listDisplay } = style;
    return (
        <button
            type="button"
            className={`btn-toc arborito-lesson-toc-item ${depthCls} text-left py-3 px-3 rounded-xl ${fontSize} transition-colors w-full flex items-start gap-3 whitespace-normal border border-transparent ${active ? 'is-active' : ''}`}
            data-idx={idx}
            data-toc-depth={depthTag}
            aria-current={active ? 'true' : undefined}
            style={{ paddingLeft: `${paddingLeft}px` }}
            onClick={() => onSectionClick?.(idx)}
        >
            <div
                className={`js-toc-tick mt-0.5 flex-shrink-0 ${iconSize} flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors`}
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
                    <span className="text-green-500 font-bold">✓</span>
                ) : (
                    <span className={`w-2 h-2 rounded-full ${active ? 'bg-sky-500' : 'border border-slate-300 dark:border-slate-600'}`} />
                )}
            </div>
            <span className="leading-tight break-words pt-0.5">{listDisplay}</span>
        </button>
    );
}

function TocConstructRow({
    item,
    idx,
    active,
    style,
    headingRaw,
    tocInlineEditIdx,
    arcadeStatus,
    ui,
    dropTarget,
    onSectionClick,
    onRenameStart,
    onRenameCommit,
    onRenameCancel,
    onAddSub,
    onRemove
}) {
    const editInputRef = useRef(null);
    const [editValue, setEditValue] = useState('');
    const { depthCls, depthTag, fontSize, depthIndent, listDisplay } = style;
    const canEditRow = item.id !== 'intro';
    const editing = tocInlineEditIdx === idx;
    const renameHint = ui.lessonTocRename || 'Rename';
    const deleteHint = ui.lessonTocDeleteSection || ui.graphDelete || 'Delete section';
    const addSubHint = (ui.lessonTocAddSubsectionHint || ui.lessonTocAddSubsection || 'Add sub-topic').trim();
    const openSectionHint = (ui.lessonTocTapSectionHint || '').trim();
    const renameViaBtn = (ui.lessonTocRenameViaPencilHint || '').trim();
    const nameTitle = canEditRow
        ? [openSectionHint, renameViaBtn ? `${renameHint}: ${renameViaBtn}` : renameHint].filter(Boolean).join(' · ')
        : '';

    const isDropTarget = dropTarget?.idx === idx;
    const dropCls = isDropTarget
        ? ` is-toc-drop-target${dropTarget.nestMode ? ' is-toc-drop-nest' : ''}`
        : '';
    const dropStyle =
        isDropTarget && dropTarget.desiredDepth
            ? { '--toc-drop-depth': String(dropTarget.desiredDepth) }
            : undefined;

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
        const onDocPtr = (ev) => {
            const el = ev.target;
            const inp = editInputRef.current;
            if (!(el instanceof Node) || !inp) return;
            if (el === inp || inp.contains(el)) return;
            onRenameCommit?.(idx, editValue);
        };
        document.addEventListener('pointerdown', onDocPtr, true);
        return () => document.removeEventListener('pointerdown', onDocPtr, true);
    }, [editing, idx, editValue, onRenameCommit]);

    if (editing && canEditRow) {
        const editHint = (ui.lessonTocEditHint || '').trim();
        return (
            <div
                className={`arborito-lesson-toc-row ${depthCls} flex flex-col gap-2 py-2 px-2 rounded-xl border border-amber-300/50 dark:border-amber-600/40 bg-amber-50/80 dark:bg-amber-950/30 w-full`}
                data-toc-idx={idx}
                data-toc-depth={depthTag}
                style={{ marginLeft: `${depthIndent}px` }}
            >
                <div className="flex items-start gap-2 w-full">
                    <TocDragGrip idx={idx} canEditRow={canEditRow} ui={ui} />
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
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
                                    onRenameCommit?.(idx, editValue);
                                } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    onRenameCancel?.();
                                }
                            }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    const arcadeReadyLbl = ui.lessonTocArcadeReady || 'Quiz ready for Arcade';
    const arcadeDraftLbl = ui.lessonTocArcadeDraft || 'Quiz incomplete';

    return (
        <div
            className={`arborito-lesson-toc-row arborito-lesson-toc-row--construct ${depthCls} flex items-stretch gap-1 min-w-0${active ? ' is-active' : ''}${dropCls}`}
            data-toc-idx={idx}
            data-toc-depth={depthTag}
            style={{ marginLeft: `${depthIndent}px`, ...dropStyle }}
        >
            <TocDragGrip idx={idx} canEditRow={canEditRow} ui={ui} />
            <button
                type="button"
                className={`btn-toc arborito-lesson-toc-item flex-1 min-w-0 text-left py-3 px-2 rounded-xl ${fontSize} transition-colors flex items-start gap-1 whitespace-normal border border-transparent ${active ? 'is-active' : ''} ${active ? 'bg-sky-50/80 dark:bg-sky-950/20' : ''}`}
                data-idx={idx}
                aria-current={active ? 'true' : undefined}
                onClick={() => onSectionClick?.(idx)}
            >
                <span
                    className={`leading-tight break-words min-w-0 flex-1 text-left js-toc-name-slot self-stretch flex items-center py-2 -my-1 min-h-[2.75rem] ${canEditRow ? 'cursor-pointer' : 'cursor-default opacity-90 pt-0.5'}`}
                    data-toc-renamable={canEditRow ? '1' : '0'}
                    title={nameTitle}
                >
                    {listDisplay}
                </span>
            </button>
            {arcadeStatus !== 'none' ? (
                <button
                    type="button"
                    className={`js-toc-arcade-badge arborito-lesson-toc-arcade ${arcadeStatus === 'ready' ? 'arborito-lesson-toc-arcade--ready' : 'arborito-lesson-toc-arcade--draft'}`}
                    data-idx={idx}
                    aria-label={arcadeStatus === 'ready' ? arcadeReadyLbl : arcadeDraftLbl}
                    title={arcadeStatus === 'ready' ? arcadeReadyLbl : arcadeDraftLbl}
                >
                    <ChromeEmoji emoji="🎮" size={16} />
                </button>
            ) : null}
            {canEditRow ? (
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
            ) : null}
            {canEditRow ? (
                <button
                    type="button"
                    className="js-toc-row-add-sub arborito-lesson-toc-add-inline"
                    data-idx={idx}
                    aria-label={addSubHint}
                    title={addSubHint}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onAddSub?.(idx);
                    }}
                >
                    <span aria-hidden="true">+</span>
                </button>
            ) : null}
            {canEditRow ? (
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
            ) : null}
        </div>
    );
}

function getTocRowStyle(item, construct) {
    const lv = Math.min(8, Math.max(1, item.level || 1));
    const outlineDepth = Math.max(0, Math.min(5, lv - 2));
    const depthIndent = construct ? Math.min(72, outlineDepth * 16) : 0;
    const paddingLeft = construct ? 0 : 6 + Math.max(0, lv - 1) * 18;
    const fontSize =
        lv >= 6
            ? 'text-[10px] font-bold'
            : lv >= 5
              ? 'text-[11px] font-bold'
              : lv === 4
                ? 'text-xs font-bold'
                : lv === 3
                  ? 'text-xs font-medium'
                  : 'text-sm font-bold';
    const iconSize = lv >= 4 ? 'w-5 h-5' : 'w-6 h-6';
    const depthTag = Math.min(6, outlineDepth + 1);
    const depthCls = `arborito-lesson-toc-depth-${depthTag}`;
    return { depthCls, depthTag, fontSize, iconSize, paddingLeft, depthIndent };
}

function getTocListDisplay(item, ui) {
    const listLine = tocPlainLineForList(item);
    let listDisplay = tocLabelForDisplay(listLine);
    if (item.isQuiz) {
        const quizTag = ui.lessonTocQuizSection || 'Repaso';
        listDisplay = listDisplay ? `${listDisplay} · ${quizTag}` : quizTag;
    }
    return listDisplay;
}

/** TOC sheet (filter + nav list). */
export function LessonToc({
    visible,
    constructEdit,
    tocFilter,
    onFilterChange,
    onBackdropClick,
    showTocChrome,
    toc,
    filteredToc,
    activeSectionIndex,
    visitedSections,
    allBlocks,
    bodyMd,
    tocInlineEditIdx,
    isSectionCompleted,
    onSectionClick,
    onConstructSectionClick,
    onTocAdd,
    onTocAddSub,
    onTocRemove,
    onTocRenameStart,
    onTocRenameCommit,
    onTocRenameCancel,
    onTocTickToggle,
    tocDropTarget,
    tocNavRef,
    tocScrollRef
}) {
    const { ui } = useLearning();

    if (!showTocChrome) return null;    const tocFilterPh = ui.lessonTocFilterPlaceholder || ui.filterPlaceholder || '';
    const addSectionLabel = ui.lessonTocAddSection || 'Add section';
    const addSectionHint = (ui.lessonTocAddSectionHint || addSectionLabel).trim();
    const headingRaws = constructEdit ? getTocLineRanges(bodyMd || '').map((r) => r.headingRaw || '') : [];

    if (toc.length === 0) return null;
    if (toc.length <= 1 && !constructEdit) return null;

    const sectionClick = constructEdit ? onConstructSectionClick : onSectionClick;

    return (
        <>
            <div
                id="toc-mobile-backdrop"
                className={`arborito-lesson-toc-backdrop ${!visible ? 'is-hidden' : ''}`}
                onClick={onBackdropClick}
                role="presentation"
            />
            <div
                id="lesson-toc-sheet"
                className={`arborito-lesson-toc-sheet ${!visible ? 'is-collapsed' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-label={ui.lessonTopics}
                {...(constructEdit ? { 'data-arbor-tour': 'lesson-edit-toc' } : {})}
            >
                <div className="arborito-lesson-toc-sheet__head">
                    <div className="arborito-lesson-toc-sheet__grab" aria-hidden="true" />
                    <div className="arborito-lesson-toc-sheet__title">{ui.lessonTopics}</div>
                    <div className="relative mb-3 whitespace-nowrap arborito-lesson-toc-filter-wrap">
                        <input
                            id="toc-filter"
                            type="text"
                            placeholder={tocFilterPh}
                            className="arborito-lesson-toc-filter w-full rounded-lg pl-3 pr-4 py-2.5 text-sm font-bold outline-none transition box-border"
                            autoComplete="off"
                            aria-label={tocFilterPh}
                            value={tocFilter}
                            onChange={(e) => onFilterChange(e.target.value)}
                        />
                        {constructEdit ? (
                            <div className="mt-2 mb-1 arborito-lesson-toc-add-wrap">
                                <button
                                    type="button"
                                    className="js-toc-construct-add arborito-lesson-toc-add-btn"
                                    title={addSectionHint}
                                    aria-label={addSectionLabel}
                                    onClick={() => onTocAdd?.()}
                                >
                                    <span className="arborito-lesson-toc-add-btn__glyph" aria-hidden="true">
                                        +
                                    </span>
                                    <span className="arborito-lesson-toc-add-btn__label">{addSectionLabel}</span>
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
                <div
                    ref={tocScrollRef}
                    className="arborito-lesson-toc-sheet__scroll custom-scrollbar"
                >
                    <nav ref={tocNavRef} id="lesson-toc-nav" className="flex flex-col gap-2 w-full">
                        {filteredToc.map((item) => {
                            if (constructEdit && item?.id === 'intro') return null;
                            const idx = toc.indexOf(item);
                            if (idx < 0) return null;
                            const active = activeSectionIndex === idx;
                            const style = getTocRowStyle(item, constructEdit);
                            style.listDisplay = getTocListDisplay(item, ui);
                            const completed = isSectionCompleted
                                ? isSectionCompleted(idx)
                                : visitedSections.has(idx);

                            if (!constructEdit) {
                                return (
                                    <TocReadRow
                                        key={item.id || idx}
                                        item={item}
                                        idx={idx}
                                        active={active}
                                        completed={completed}
                                        style={style}
                                        onSectionClick={sectionClick}
                                        onTickToggle={onTocTickToggle}
                                    />
                                );
                            }

                            const arcadeStatus = getSectionArcadeQuizStatus(bodyMd, allBlocks, toc, idx);
                            return (
                                <TocConstructRow
                                    key={item.id || idx}
                                    item={item}
                                    idx={idx}
                                    active={active}
                                    style={style}
                                    headingRaw={headingRaws[idx] || ''}
                                    tocInlineEditIdx={tocInlineEditIdx}
                                    arcadeStatus={arcadeStatus}
                                    ui={ui}
                                    dropTarget={tocDropTarget}
                                    onSectionClick={sectionClick}
                                    onRenameStart={onTocRenameStart}
                                    onRenameCommit={onTocRenameCommit}
                                    onRenameCancel={onTocRenameCancel}
                                    onAddSub={onTocAddSub}
                                    onRemove={onTocRemove}
                                />
                            );
                        })}
                    </nav>
                </div>
            </div>
        </>
    );
}
