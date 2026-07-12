import { useLearning } from '../hooks/useLearning.js';
import { useEffect, useRef, useState } from 'react';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { MmenuRootHero } from '../../../shared/ui/MmenuChrome.jsx';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { LessonTocSheet } from './LessonTocSheet.jsx';
import { tocPlainLineForList, tocLabelForDisplay, isTocSectionAccessible, EXAM_FINAL_TOC_ID } from '../api/content-toc.js';
import {
    getTocLineRanges,
    tocHeadingTitleForEdit,
    tocSectionMoveAvailability
} from '../api/lesson-toc-mutations.js';
import { getSectionArcadeQuizStatus } from '../api/quiz-status.js';
import { getQuizState } from '../api/content-panel-quiz.js';
import { formatCountLabel } from '../../../shared/lib/format-count-label.js';

function TocNudgeBtn({ label, disabled, onClick, children }) {
    return (
        <button
            type="button"
            className="arborito-toc-nudge"
            disabled={disabled}
            aria-label={label}
            title={label}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!disabled) onClick?.();
            }}
        >
            {children}
        </button>
    );
}

function TocReadRow({ item, idx, active, completed, disabled, style, onSectionClick, onTickToggle, ui, examPreStart = false }) {
    const { depthCls, depthTag, fontSize, iconSize, paddingLeft, listDisplay } = style;
    const quizOnly = item.kind === 'quiz';
    const examFinal = item.kind === 'exam-final';
    const prestartActive = examPreStart && active;
    return (
        <button
            type="button"
            className={`btn-toc arborito-lesson-toc-item ${quizOnly ? 'arborito-lesson-toc-item--quiz' : ''} ${examFinal ? 'arborito-lesson-toc-item--exam-final' : ''} ${examPreStart ? 'arborito-lesson-toc-item--exam-prestart' : ''} ${disabled ? 'arborito-lesson-toc-item--locked' : ''} ${depthCls} text-left py-3 px-3 rounded-xl ${fontSize} transition-colors w-full flex items-start gap-3 whitespace-normal border border-transparent ${active ? 'is-active' : ''} ${prestartActive ? 'is-active-exam-awaiting' : ''}`}
            data-idx={idx}
            data-toc-depth={depthTag}
            aria-current={active ? 'true' : undefined}
            aria-disabled={disabled ? 'true' : undefined}
            disabled={disabled}
            style={{ paddingLeft: `${paddingLeft}px` }}
            onClick={() => !disabled && onSectionClick?.(idx)}
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
                    <span className="arborito-toc-tick-mark text-green-500 font-bold" aria-label="Completado">
                        ✓
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

function TocConstructRow({
    item,
    idx,
    active,
    style,
    headingRaw,
    tocInlineEditIdx,
    arcadeStatus,
    questionCount = 0,
    bodyMd,
    tocFilter,
    toc,
    ui,
    onSectionClick,
    onRenameStart,
    onRenameCommit,
    onRenameCancel,
    onAddSub,
    onRemove,
    onMove
}) {
    const editInputRef = useRef(null);
    const [editValue, setEditValue] = useState('');
    const { depthCls, depthTag, fontSize, depthIndent, listDisplay } = style;
    const canEditRow = item.id !== 'intro';
    const editing = tocInlineEditIdx === idx;
    const filterBlocked = String(tocFilter || '').trim().length > 0;
    const filterHint = ui.lessonTocReorderFilterBlocked || 'Clear the filter to reorder';
    const moveUpLabel = ui.lessonTocReorderMoveUp || 'Move up';
    const moveDownLabel = ui.lessonTocReorderMoveDown || 'Move down';
    const outdentLabel = ui.lessonTocReorderOutdent || 'Nest less';
    const indentLabel = ui.lessonTocReorderIndent || 'Nest more';
    const { canUp, canDown, canOutdent, canIndent } = canEditRow
        ? tocSectionMoveAvailability(bodyMd || '', idx, toc)
        : { canUp: false, canDown: false, canOutdent: false, canIndent: false };
    const renameHint = ui.lessonTocRename || 'Rename';
    const deleteHint = ui.lessonTocDeleteSection || ui.graphDelete || 'Delete section';
    const addSubHint = (ui.lessonTocAddSubsectionHint || ui.lessonTocAddSubsection || 'Add sub-topic').trim();
    const openSectionHint = (ui.lessonTocTapSectionHint || '').trim();
    const renameViaBtn = (ui.lessonTocRenameViaPencilHint || '').trim();
    const nameTitle = canEditRow
        ? [openSectionHint, renameViaBtn ? `${renameHint}: ${renameViaBtn}` : renameHint].filter(Boolean).join(' · ')
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
        );
    }

    const arcadeReadyLbl = ui.lessonTocArcadeReady || 'Quiz ready for Arcade';
    const arcadeDraftLbl = ui.lessonTocArcadeDraft || 'Quiz incomplete';
    const questionCountLbl = formatCountLabel(
        questionCount,
        ui.lessonTocQuizQuestionCountOne || '1 question',
        ui.lessonTocQuizQuestionCount || '{count} questions'
    );
    const nudgeTitle = filterBlocked ? filterHint : undefined;

    return (
        <div
            className={`arborito-lesson-toc-row arborito-lesson-toc-row--construct ${depthCls}${active ? ' is-active' : ''}`}
            data-toc-idx={idx}
            data-toc-depth={depthTag}
            style={{ marginLeft: `${depthIndent}px` }}
        >
            {canEditRow ? (
                <div className="arborito-toc-nudge-group" aria-label={ui.lessonTocDragReorder || 'Reorder'}>
                    <TocNudgeBtn
                        label={nudgeTitle || moveUpLabel}
                        disabled={filterBlocked || !canUp}
                        onClick={() => onMove?.(idx, 'up')}
                    >
                        ↑
                    </TocNudgeBtn>
                    <TocNudgeBtn
                        label={nudgeTitle || moveDownLabel}
                        disabled={filterBlocked || !canDown}
                        onClick={() => onMove?.(idx, 'down')}
                    >
                        ↓
                    </TocNudgeBtn>
                    <TocNudgeBtn
                        label={nudgeTitle || outdentLabel}
                        disabled={filterBlocked || !canOutdent}
                        onClick={() => onMove?.(idx, 'outdent')}
                    >
                        ←
                    </TocNudgeBtn>
                    <TocNudgeBtn
                        label={nudgeTitle || indentLabel}
                        disabled={filterBlocked || !canIndent}
                        onClick={() => onMove?.(idx, 'indent')}
                    >
                        →
                    </TocNudgeBtn>
                </div>
            ) : null}
            <button
                type="button"
                className={`btn-toc arborito-lesson-toc-item text-left py-2 px-2 rounded-xl ${fontSize} transition-colors border border-transparent ${active ? 'is-active' : ''} ${active ? 'bg-sky-50/80 dark:bg-sky-950/20' : ''}`}
                data-idx={idx}
                aria-current={active ? 'true' : undefined}
                onClick={() => onSectionClick?.(idx)}
            >
                <span
                    className={`leading-snug min-w-0 text-left js-toc-name-slot block py-1 ${canEditRow ? 'cursor-pointer' : 'cursor-default opacity-90'}`}
                    data-toc-renamable={canEditRow ? '1' : '0'}
                    title={nameTitle}
                >
                    {listDisplay}
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
                                    ? `${arcadeReadyLbl} — ${questionCountLbl}`
                                    : `${arcadeDraftLbl} — ${questionCountLbl}`
                            }
                            title={
                                arcadeStatus === 'ready'
                                    ? `${arcadeReadyLbl} — ${questionCountLbl}`
                                    : `${arcadeDraftLbl} — ${questionCountLbl}`
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
                            onAddSub?.(idx);
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
    if (item.kind === 'exam-final') {
        return ui.examFinalEvaluation || 'Final evaluation';
    }
    if (item.kind === 'quiz' || item.kind === 'quiz-mixed') {
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
    tocAccess = 'all',
    examStarted = false,
    examPreStart = false,
    examShowResults = false,
    examSectionOpts = {},
    quizStates = {},
    onSectionClick,
    onConstructSectionClick,
    onTocAdd,
    onTocAddSub,
    onTocRemove,
    onTocRenameStart,
    onTocRenameCommit,
    onTocRenameCancel,
    onTocTickToggle,
    onTocMove,
    tocNavRef,
    tocScrollRef
}) {
    const { ui } = useLearning();
    const mobUi = shouldShowMobileUI();

    if (!showTocChrome) return null;

    const tocFilterPh = ui.lessonTocFilterPlaceholder || ui.filterPlaceholder || '';
    const addSectionLabel = ui.lessonTocAddSection || 'Add section';
    const addSectionHint = (ui.lessonTocAddSectionHint || addSectionLabel).trim();
    const headingRaws = constructEdit ? getTocLineRanges(bodyMd || '').map((r) => r.headingRaw || '') : [];

    if (toc.length === 0 && !constructEdit) return null;
    if (toc.length <= 1 && !constructEdit) return null;

    const sectionClick = constructEdit ? onConstructSectionClick : onSectionClick;

    const tocFilterBlock = (
        <div className="relative whitespace-nowrap arborito-lesson-toc-filter-wrap">
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
    );

    const tocHead = mobUi ? (
        <MmenuRootHero
            ui={ui}
            title={ui.lessonTopics}
            onBack={onBackdropClick}
            backAria={ui.navBack || ui.close || 'Back'}
        />
    ) : (
        <div className="arborito-lesson-toc-sheet__head">
            <div className="arborito-lesson-toc-sheet__grab" aria-hidden="true" />
            <div className="arborito-lesson-toc-sheet__title">{ui.lessonTopics}</div>
            <div className="mb-3">{tocFilterBlock}</div>
        </div>
    );

    const tocToolbar = mobUi ? tocFilterBlock : null;

    return (
        <LessonTocSheet
            open={visible}
            ariaLabel={ui.lessonTopics}
            tourAttr={constructEdit ? 'lesson-edit-toc' : undefined}
            onBackdropClick={onBackdropClick}
            head={tocHead}
            toolbar={tocToolbar}
            scrollRef={tocScrollRef}
        >
            <nav ref={tocNavRef} id="lesson-toc-nav" className="flex flex-col gap-2 w-full">
                        {filteredToc.map((item) => {
                            if (constructEdit && (item?.id === 'intro' || item?.id === EXAM_FINAL_TOC_ID)) {
                                return null;
                            }
                            const idx = toc.indexOf(item);
                            if (idx < 0) return null;
                            const active = activeSectionIndex === idx;
                            const style = getTocRowStyle(item, constructEdit);
                            style.listDisplay = getTocListDisplay(item, ui);
                            const completed = isSectionCompleted
                                ? isSectionCompleted(idx)
                                : visitedSections.has(idx);

                            const getQuizStateFn = (id) => getQuizState(quizStates, id);

                            if (!constructEdit) {
                                return (
                                    <TocReadRow
                                        key={item.id || idx}
                                        item={item}
                                        idx={idx}
                                        active={active}
                                        completed={completed}
                                        disabled={
                                            !isTocSectionAccessible(
                                                tocAccess,
                                                idx,
                                                toc,
                                                allBlocks,
                                                visitedSections,
                                                getQuizStateFn,
                                                examSectionOpts
                                            )
                                        }
                                        style={style}
                                        ui={ui}
                                        examPreStart={examPreStart}
                                        onSectionClick={sectionClick}
                                        onTickToggle={onTocTickToggle}
                                    />
                                );
                            }

                            const { status: arcadeStatus, questionCount } = getSectionArcadeQuizStatus(
                                bodyMd,
                                allBlocks,
                                toc,
                                idx
                            );
                            return (
                                <TocConstructRow
                                    key={`toc-${idx}`}
                                    item={item}
                                    idx={idx}
                                    active={active}
                                    style={style}
                                    headingRaw={headingRaws[idx] || ''}
                                    tocInlineEditIdx={tocInlineEditIdx}
                                    arcadeStatus={arcadeStatus}
                                    questionCount={questionCount}
                                    bodyMd={bodyMd}
                                    tocFilter={tocFilter}
                                    toc={toc}
                                    ui={ui}
                                    onSectionClick={sectionClick}
                                    onRenameStart={onTocRenameStart}
                                    onRenameCommit={onTocRenameCommit}
                                    onRenameCancel={onTocRenameCancel}
                                    onAddSub={onTocAddSub}
                                    onRemove={onTocRemove}
                                    onMove={onTocMove}
                                />
                            );
                        })}
            </nav>
        </LessonTocSheet>
    );
}
