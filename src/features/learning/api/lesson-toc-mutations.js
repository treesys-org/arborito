/**
 * Construct-mode TOC outline math (temario).
 *
 * Re-exports the public API from `lesson-toc-outline-core.js` and
 * `lesson-toc-outline-edits.js`.
 */
export {
    stripOutlinePathId,
    outlinePathIdFromText,
    isOutlinePathId,
    OUTLINE_MAX_PATH_DEPTH,
    OUTLINE_MAX_LEVEL,
    outlineLevelFromPathId,
    pathDepthFromOutlineLevel,
    renumberOutlinePaths,
    getTocLineRanges,
    tocRangeOutlineLevel,
    tocSubtreeExclusiveEnd,
    tocBodyTailAfterSubtree,
    reorderTocSectionRange,
    maxOutlineLevelInSubtree,
    resolveTocRangeIndex,
    normalizeConstructOutlineRoots,
    promoteOutlineAtxToSyllabus,
    flattenOutlineFencesToAtx,
    materializeSyllabusAsSectionFences,
    prepareConstructOutlineMath,
    prepareConstructOutlineBody,
    buildConstructOutline,
    repairEmptyOutlineTitles,
    tocHeadingTitleForEdit,
} from './lesson-toc-outline-core.js';

export {
    tocSelectedIndexAfterMove,
    applyTocSectionMove,
    constructOutlineInvariants,
    tocSectionMoveAvailabilityFromRanges,
    tocSectionMoveAvailability,
    moveTocSectionByAction,
    setTocSectionLevel,
    renameTocSection,
    removeTocSection,
    buildConstructStarterProse,
    addTocSectionAfter,
    childOutlineLevelForParent,
    insertLineAfterTocSubtree,
    repairSubsectionNesting,
    addTocSubsectionAfter,
} from './lesson-toc-outline-edits.js';
