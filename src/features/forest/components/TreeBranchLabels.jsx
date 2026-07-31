import { formatBranchNamesSummary, resolveBranchRefDisplayNames } from '../api/tree-branch-labels.js';

/** One-line summary for compact cards, port of `treeBranchSummaryLineHtml`. */
export function TreeBranchSummaryLine({ branchRefs, ui, max = 4 }) {
    const names = resolveBranchRefDisplayNames(branchRefs);
    if (!names.length) {
        return (
            <p className="m-0 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {ui.sourcesTreeNoBranchesYet || 'No branches yet.'}
            </p>
        );
    }
    return (
        <p className="m-0 mt-1 text-[11px] font-semibold leading-snug text-violet-800 dark:text-violet-200">
            {formatBranchNamesSummary(names, ui, { max })}
        </p>
    );
}
