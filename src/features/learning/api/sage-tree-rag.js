/**
 * Collect lesson evidence from the active curriculum tree for Sage dynamic (RAG) mode.
 */

export {
    isMetaAppQuestion,
    wantsModuleOutline,
    isPrimarilyArboritoAppQuery,
    isCasualSageGreeting,
    findNodeById,
    findParentBranch,
    buildModuleOverviewBlock,
    resolveSageQueryTarget,
    queryTerms,
    stripQuizBlocksFromMarkdown,
    extractFirstQuizChallenge,
    expandQueryByProductVocab,
    expandKnownAppStems,
    resolveSageIntentQuery,
    expandSageRagQuery,
    buildSageActiveLessonContext,
    isUnusableLessonContent,
} from './sage-tree-rag-intent.js';

export {
    resolveArboritoDemoRagBudget,
    preloadRagLessonContent,
    collectTreeRagEvidence,
    collectArboritoDemoRagBlock,
} from './sage-tree-rag-collect.js';
