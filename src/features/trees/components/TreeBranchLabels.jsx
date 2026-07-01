import { formatBranchNamesSummary, resolveBranchRefDisplayNames } from '../api/tree-branch-labels.js';

/** Vertical list of branch names — port of `treeBranchListHtml`. */
export function TreeBranchList({ branchRefs, ui }) {
    const names = resolveBranchRefDisplayNames(branchRefs);
    if (!names.length) {
        return (
            <p className="m-0 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {ui.sourcesTreeNoBranchesYet || ui.emptyTreeNoBranches || 'No branches yet.'}
            </p>
        );
    }
    return (
        <ul className="arborito-tree-branch-list" aria-label={ui.sourcesTreeBranchCount || 'branches'}>
            {names.map((n) => (
                <li key={n} className="arborito-tree-branch-list__item">
                    <span className="arborito-tree-branch-list__icon" aria-hidden="true">
                        🌿
                    </span>
                    <span className="arborito-tree-branch-list__name">{n}</span>
                </li>
            ))}
        </ul>
    );
}

/** One-line summary for compact cards — port of `treeBranchSummaryLineHtml`. */
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

/** Horizontal chips — port of `treeBranchChipsHtml`. */
export function TreeBranchChips({ branchRefs, ui, maxChips = 4 }) {
    const names = resolveBranchRefDisplayNames(branchRefs);
    if (!names.length) {
        return (
            <p className="m-0 mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                {ui.sourcesTreeNoBranchesYet || ui.emptyTreeNoBranches || 'No branches yet.'}
            </p>
        );
    }
    const cap = Math.max(1, Number(maxChips) || 4);
    const shown = names.slice(0, cap);
    const extra = names.length - cap;
    return (
        <div className="arborito-tree-branch-chips">
            {shown.map((n) => (
                <span key={n} className="arborito-tree-branch-chip" title={n}>
                    🌿 {n}
                </span>
            ))}
            {extra > 0 ? (
                <span className="arborito-tree-branch-chip arborito-tree-branch-chip--more">+{extra}</span>
            ) : null}
        </div>
    );
}
