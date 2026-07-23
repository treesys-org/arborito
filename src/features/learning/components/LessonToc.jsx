import { useLearning } from '../hooks/useLearning.js';
import { useCallback, useState } from 'react';
import { MmenuRootHero } from '../../../shared/ui/MmenuChrome.jsx';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { LessonTocSheet } from './LessonTocSheet.jsx';
import { TocReadRow, TocConstructRow } from './LessonTocRows.jsx';
import { useLessonTocDrag } from './useLessonTocDrag.js';
import {
    isTocSectionAccessible,
    EXAM_FINAL_TOC_ID,
} from '../api/content-toc.js';
import {
    getTocLineRanges,
    tocRangeOutlineLevel,
} from '../api/lesson-toc-mutations.js';
import {
    tocIndicesHiddenByCollapse,
    tocRowHasChildren,
    tocSubtreeChildCount,
} from '../api/lesson-toc-drag.js';
import { getSectionArcadeQuizStatus } from '../api/quiz-status.js';
import { getQuizState } from '../api/content-panel-quiz.js';
import { isSyntheticIntroItem } from '../api/lesson-section-slices.js';
import {
    nestDepthFromPathOrLevel,
    getTocRowStyle,
    getTocListDisplay,
    getTocPathBadge,
} from './lesson-toc-row-utils.js';

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
    onTocMove: _onTocMove,
    onTocDragTo,
    tocNavRef,
    tocScrollRef
}) {
    const { ui } = useLearning();
    const mobUi = shouldShowMobileUI();
    const [collapsedIds, setCollapsedIds] = useState(() => new Set());

    const outlineBody = bodyMd || '';
    const headingRanges = constructEdit ? getTocLineRanges(outlineBody) : [];
    const filterActive = String(tocFilter || '').trim().length > 0;

    const toggleCollapse = useCallback((sectionId) => {
        const id = sectionId != null ? String(sectionId) : '';
        if (!id) return;
        setCollapsedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const { dragUi, dropLineRef, dropBadgeRef, onDragPointerDown } = useLessonTocDrag({
        constructEdit,
        filterActive,
        tocNavRef,
        headingRanges,
        onTocDragTo,
        ui,
        toc,
        collapsedIds,
        outlineBody,
        tocFilter,
        filteredToc,
    });

    if (!showTocChrome) return null;

    const tocFilterPh = ui.lessonTocFilterPlaceholder || ui.filterPlaceholder || '';
    const addSectionLabel = ui.lessonTocAddSection || 'Add section';
    const addSectionHint = (ui.lessonTocAddSectionHint || addSectionLabel).trim();
    const outlineLevelByTocIdx = constructEdit
        ? toc.map((item, idx) => {
              if (idx >= 0 && idx < headingRanges.length) {
                  return tocRangeOutlineLevel(headingRanges[idx]);
              }
              return Number.isFinite(item?.level) ? item.level : null;
          })
        : [];
    const headingRawByTocIdx = constructEdit
        ? toc.map((item, idx) => {
              if (idx >= 0 && idx < headingRanges.length) {
                  return headingRanges[idx].headingRaw || '';
              }
              return '';
          })
        : [];
    const hiddenByCollapse =
        constructEdit && !filterActive
            ? tocIndicesHiddenByCollapse(headingRanges, toc, collapsedIds)
            : new Set();

    if (toc.length === 0 && !constructEdit) return null;
    if (toc.length <= 1 && !constructEdit) return null;

    const sectionClick = constructEdit ? onConstructSectionClick : onSectionClick;
    const dragging = !!(dragUi?.active);

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
            <nav
                ref={tocNavRef}
                id="lesson-toc-nav"
                className={`flex flex-col w-full relative${constructEdit ? ' arborito-lesson-toc-nav--construct' : ' gap-2'}${dragging ? ' arborito-lesson-toc-nav--dragging' : ''}`}
            >
                {constructEdit ? (
                    <>
                        <div
                            ref={dropLineRef}
                            className="arborito-lesson-toc-drop-indicator"
                            style={{ display: 'none' }}
                            aria-hidden="true"
                        />
                        <div
                            ref={dropBadgeRef}
                            className="arborito-lesson-toc-drop-badge"
                            style={{ display: 'none' }}
                            aria-hidden="true"
                        />
                    </>
                ) : null}
                {toc.map((item, idx) => {
                    if (constructEdit && (isSyntheticIntroItem(item) || item?.id === EXAM_FINAL_TOC_ID)) {
                        return null;
                    }
                    if (filteredToc !== toc && !filteredToc.includes(item)) {
                        return null;
                    }
                    if (constructEdit && hiddenByCollapse.has(idx)) {
                        return null;
                    }
                    if (
                        constructEdit &&
                        dragUi?.active &&
                        idx > dragUi.fromIdx &&
                        idx < dragUi.subEnd
                    ) {
                        return null;
                    }
                    const rowKey = item?.id || `toc:${idx}`;
                    const active = activeSectionIndex === idx;
                    const style = getTocRowStyle(
                        item,
                        constructEdit,
                        constructEdit ? outlineLevelByTocIdx[idx] : null
                    );
                    style.listDisplay = getTocListDisplay(item, ui, { showPath: false });
                    const pathBadge = constructEdit ? getTocPathBadge(item) : '';
                    const completed = isSectionCompleted
                        ? isSectionCompleted(idx)
                        : visitedSections.has(idx);

                    const getQuizStateFn = (id) => getQuizState(quizStates, id);

                    if (!constructEdit) {
                        return (
                            <TocReadRow
                                key={rowKey}
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
                    const hasChildren = tocRowHasChildren(headingRanges, idx);
                    const childCount = tocSubtreeChildCount(headingRanges, idx);
                    const idKey = item?.id != null ? String(item.id) : '';
                    const collapsed = !!(idKey && collapsedIds.has(idKey));
                    const isDragSource = !!(dragUi && dragUi.fromIdx === idx && dragUi.active);
                    const nestDepth = Number.isFinite(style.nestDepth) ? style.nestDepth : 0;
                    const prevNest =
                        idx > 0
                            ? nestDepthFromPathOrLevel(
                                  toc[idx - 1],
                                  outlineLevelByTocIdx[idx - 1]
                              )
                            : -1;
                    const isFirstChild = nestDepth > 0 && prevNest < nestDepth;
                    return (
                        <TocConstructRow
                            key={rowKey}
                            item={item}
                            idx={idx}
                            active={active}
                            style={style}
                            headingRaw={headingRawByTocIdx[idx] || ''}
                            tocInlineEditIdx={tocInlineEditIdx}
                            arcadeStatus={arcadeStatus}
                            questionCount={questionCount}
                            tocFilter={tocFilter}
                            ui={ui}
                            pathBadge={pathBadge}
                            hasChildren={hasChildren}
                            childCount={childCount}
                            collapsed={collapsed}
                            dragMuted={dragging && !isDragSource}
                            isDragSource={isDragSource}
                            isDragSubtree={false}
                            isFirstChild={isFirstChild}
                            nestDepth={nestDepth}
                            onSectionClick={sectionClick}
                            onRenameStart={onTocRenameStart}
                            onRenameCommit={onTocRenameCommit}
                            onRenameCancel={onTocRenameCancel}
                            onAddSub={onTocAddSub}
                            onRemove={onTocRemove}
                            onCollapseToggle={toggleCollapse}
                            onDragPointerDown={onDragPointerDown}
                        />
                    );
                })}
            </nav>
        </LessonTocSheet>
    );
}
