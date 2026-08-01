import { canonicalNetworkTreeUrlString } from './sources-helpers.js';

/**
 * Keys for courses that appear as members of local playlists (composed trees).
 * Used to hide “echo” rows in Mis cursos when the playlist is the unit.
 *
 * @param {object[]|null|undefined} trees
 * @returns {{
 *   branchIds: Set<string>,
 *   networkBackedBranchIds: Set<string>,
 *   networkUrls: Set<string>,
 * }}
 */
export function collectPlaylistMemberCoverage(trees) {
    const branchIds = new Set();
    const networkBackedBranchIds = new Set();
    const networkUrls = new Set();

    const addNetworkUrl = (raw) => {
        const u = String(raw || '').trim();
        if (!u || u.startsWith('branch://')) return false;
        networkUrls.add(u);
        const canon = canonicalNetworkTreeUrlString(u);
        if (canon) networkUrls.add(canon);
        return true;
    };

    for (const t of trees || []) {
        for (const r of t?.branchRefs || []) {
            const bid = String(r?.branchId || r?.refId || '').trim();
            const sourceUrl = String(r?.sourceUrl || '').trim();
            const networkUrl = String(r?.networkUrl || '').trim();
            let fromBranchUrl = '';
            if (sourceUrl.startsWith('branch://')) {
                fromBranchUrl = sourceUrl.slice('branch://'.length).split('/')[0] || '';
            }
            const id = bid || fromBranchUrl;
            if (id) branchIds.add(id);

            const hasNet = addNetworkUrl(networkUrl) || addNetworkUrl(sourceUrl);
            if (hasNet && id) networkBackedBranchIds.add(id);
        }
    }

    return { branchIds, networkBackedBranchIds, networkUrls };
}

/**
 * True when this course is a network-backed member of some local playlist
 * (installed via playlist / Discover member), not a purely local authored branch
 * that the user put into a playlist.
 *
 * @param {{ branchIds: Set<string>, networkBackedBranchIds: Set<string>, networkUrls: Set<string> }} coverage
 * @param {{ branchId?: string, url?: string }} identity
 */
export function isNetworkPlaylistMemberCourse(coverage, identity) {
    if (!coverage) return false;
    const url = String(identity?.url || '').trim();
    if (url) {
        if (coverage.networkUrls.has(url)) return true;
        const canon = canonicalNetworkTreeUrlString(url);
        if (canon && coverage.networkUrls.has(canon)) return true;
    }
    const branchId = String(identity?.branchId || '').trim();
    if (branchId && coverage.networkBackedBranchIds.has(branchId)) return true;
    return false;
}

/**
 * Network-backed members of `treeEntry` that are not used by any other local playlist.
 * Used when deleting a playlist with “also remove its courses”.
 *
 * @param {object|null|undefined} treeEntry
 * @param {object[]|null|undefined} allTrees
 * @param {{
 *   branches?: object[],
 *   skipBranchId?: (id: string) => boolean,
 *   skipBranch?: (branch: object) => boolean,
 * }} [opts]
 * @returns {{ branchId: string, networkUrl: string }[]}
 */
export function listRemovablePlaylistOrphanCourses(treeEntry, allTrees, opts = {}) {
    const treeId = String(treeEntry?.id || '').trim();
    if (!treeId) return [];
    const otherTrees = (allTrees || []).filter((t) => String(t?.id || '') !== treeId);
    const otherCoverage = collectPlaylistMemberCoverage(otherTrees);
    const branches = Array.isArray(opts.branches) ? opts.branches : [];
    const skipBranchId = typeof opts.skipBranchId === 'function' ? opts.skipBranchId : null;
    const skipBranch = typeof opts.skipBranch === 'function' ? opts.skipBranch : null;

    const seen = new Set();
    const out = [];
    for (const r of treeEntry?.branchRefs || []) {
        const sourceUrl = String(r?.sourceUrl || '').trim();
        const networkUrlRaw = String(r?.networkUrl || '').trim();
        let fromBranchUrl = '';
        if (sourceUrl.startsWith('branch://')) {
            fromBranchUrl = sourceUrl.slice('branch://'.length).split('/')[0] || '';
        }
        const branchId = String(r?.branchId || r?.refId || fromBranchUrl || '').trim();
        const networkUrl =
            (!networkUrlRaw.startsWith('branch://') && networkUrlRaw) ||
            (!sourceUrl.startsWith('branch://') && sourceUrl) ||
            '';
        if (!networkUrl && !branchId) continue;
        /* Local-only playlist members stay; only network installs cascade. */
        if (!networkUrl) continue;
        if (
            isNetworkPlaylistMemberCourse(otherCoverage, {
                branchId,
                url: networkUrl,
            })
        ) {
            continue;
        }
        if (branchId && skipBranchId?.(branchId)) continue;
        const local = branchId ? branches.find((b) => String(b?.id || '') === branchId) : null;
        if (local && skipBranch?.(local)) continue;
        const key = `${branchId}|${canonicalNetworkTreeUrlString(networkUrl) || networkUrl}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ branchId, networkUrl });
    }
    return out;
}

/** True when this network course was added by the user (Discover / share), not only via a playlist. */
export function isUserInstalledNetworkCourse(communitySources, networkUrl) {
    const url = String(networkUrl || '').trim();
    if (!url) return false;
    const canon = canonicalNetworkTreeUrlString(url);
    for (const s of communitySources || []) {
        if (String(s?.contentKind || '').trim() === 'composed-tree') continue;
        const su = String(s?.url || '').trim();
        if (!su) continue;
        if (su !== url && !(canon && canonicalNetworkTreeUrlString(su) === canon)) continue;
        return String(s?.installOrigin || '').trim() === 'user';
    }
    return false;
}

/**
 * @param {{ branchId: string, networkUrl: string }[]} orphans
 * @param {object[]|null|undefined} communitySources
 */
export function playlistDeleteAlsoMembersDefault(orphans, communitySources) {
    const list = Array.isArray(orphans) ? orphans : [];
    if (!list.length) return true;
    /* Any member also installed on its own → leave checkbox off (safer). */
    return !list.some((o) => isUserInstalledNetworkCourse(communitySources, o?.networkUrl));
}
