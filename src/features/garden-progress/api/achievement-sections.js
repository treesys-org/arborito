import { TreeUtils } from '../../tree-graph/api/tree-utils.js';
import {
    buildTreeCertificateEntry,
    isSubtreeComplete,
    shouldShowTreeCertificate,
} from './certificate-entries.js';

function completedSet(store) {
    const raw = store?.userStore?.state?.completedNodes;
    return raw instanceof Set ? raw : new Set();
}

function progressPct(done, total, isComplete) {
    if (isComplete) return 100;
    if (!total) return 0;
    return Math.round((done / total) * 100);
}

function enrichEntry(entry, scope) {
    const total = Number(entry.totalLeaves) || 0;
    const done = Number(entry.completedLeaves) || 0;
    return {
        ...entry,
        scope,
        progressPct: progressPct(done, total, !!entry.isComplete),
    };
}

/** Author-issued diplomas only (explicit list or `isCertifiable` modules). */
export function buildDiplomaEntries(store, modules) {
    if (!store?.state?.data) return [];
    const completed = completedSet(store);

    if (store.state.data.certificates) {
        return store.state.data.certificates
            .filter((c) => c.scope !== 'tree')
            .map((c) => {
                const node = TreeUtils.findNode(c.id, store.state.data);
                const isComplete =
                    completed.has(c.id) || (node ? isSubtreeComplete(node, completed) : false);
                const total = node ? Number(node.totalLeaves) || 0 : 0;
                const done = node ? Number(node.completedLeaves) || 0 : 0;
                return enrichEntry(
                    {
                        ...c,
                        isComplete,
                        isCertifiable: true,
                        totalLeaves: c.totalLeaves ?? total,
                        completedLeaves: c.completedLeaves ?? done,
                    },
                    'diploma'
                );
            });
    }

    return (modules || [])
        .filter((m) => m.isCertifiable)
        .map((m) => enrichEntry({ ...m, isCertifiable: true }, 'diploma'));
}

/** Whole-curriculum completion (single branch, Nostr, HTTPS, or composed-tree home). */
export function buildTreeCompletionEntries(store) {
    const tree = buildTreeCertificateEntry(store);
    if (!tree) return [];

    const completed = completedSet(store);
    const data = store.state.data;
    let done = 0;
    let total = 0;

    if (tree.isComplete) {
        total = TreeUtils.collectDescendantCompletableIds(data, []).length;
        done = total;
    } else if (completed) {
        const leafIds = TreeUtils.collectDescendantCompletableIds(data, []);
        total = leafIds.length;
        done = leafIds.filter((id) => completed.has(id)).length;
    }

    return [enrichEntry({ ...tree, totalLeaves: total, completedLeaves: done }, 'tree')];
}

/**
 * Branch completion trophies: one per **library branch** (Biblioteca), not per folder
 * inside the curriculum map. See `docs/terminology.md`.
 */
export function buildBranchCompletionEntries(store, _modules) {
    if (!store?.state?.data) return [];
    const completed = completedSet(store);
    const ctx = store.state.treeContext;
    const data = store.state.data;

    if (ctx?.kind === 'composed-tree' && !ctx.singleBranch) {
        const wrappers = (data.children || []).filter((c) => String(c.id).endsWith('::wrapper'));
        if (wrappers.length) {
            return wrappers.map((w) => {
                const leafIds = TreeUtils.collectDescendantCompletableIds(w, []);
                const done = leafIds.filter((id) => completed.has(id)).length;
                const total = leafIds.length;
                const isComplete = isSubtreeComplete(w, completed);
                return enrichEntry(
                    {
                        id: w.id,
                        name: w.name,
                        icon: w.icon || '🌿',
                        isComplete,
                        totalLeaves: total,
                        completedLeaves: done,
                    },
                    'branch'
                );
            });
        }
    }

    if (ctx?.kind === 'composed-tree' && ctx.singleBranch) {
        return [];
    }

    const isStandalone = !ctx || ctx.kind !== 'composed-tree';
    if (isStandalone && data?.type === 'root') {
        const leafIds = TreeUtils.collectDescendantCompletableIds(data, []);
        const done = leafIds.filter((id) => completed.has(id)).length;
        const total = leafIds.length;
        const isComplete = isSubtreeComplete(data, completed);
        const raw = store.state.rawGraphData;
        const name =
            String(raw?.universeName || store.state.activeSource?.name || data.name || '').trim() ||
            'Branch';
        return [
            enrichEntry(
                {
                    id: data.id,
                    name,
                    icon: data.icon || '🌿',
                    isComplete,
                    totalLeaves: total,
                    completedLeaves: done,
                },
                'branch'
            ),
        ];
    }

    return [];
}

/**
 * @param {import('../../../core/store-singleton.js').ArboritoStore | null} store
 * @param {object[]} modules, from `getModulesStatus`
 */
export function buildAchievementSections(store, modules) {
    const diplomas = buildDiplomaEntries(store, modules);
    const trees = shouldShowTreeCertificate(store) ? buildTreeCompletionEntries(store) : [];
    const branches = buildBranchCompletionEntries(store, modules);
    return { diplomas, trees, branches };
}

export function flattenAchievements(sections) {
    if (!sections) return [];
    return [...(sections.trees || []), ...(sections.branches || []), ...(sections.diplomas || [])];
}

export function countEarnedAchievements(sections) {
    return flattenAchievements(sections).filter((a) => a.isComplete).length;
}

export function countTotalAchievements(sections) {
    return flattenAchievements(sections).length;
}
