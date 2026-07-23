import { isPublishedResourceOwner } from './published-owner.js';
import { computeBranchSetHashSync } from '../../forest/api/branch-set-hash.js';

function branchRefIntegrity(branchRefs, branches) {
    const refs = Array.isArray(branchRefs) ? branchRefs : [];
    const local = Array.isArray(branches) ? branches : [];
    let missing = 0;
    for (const ref of refs) {
        const bid = String(ref?.branchId || ref?.refId || '').trim();
        if (!bid) {
            missing += 1;
            continue;
        }
        const net = String(ref?.networkUrl || '').trim();
        if (!net && !local.some((b) => String(b?.id || '') === bid)) missing += 1;
    }
    return { broken: missing > 0, total: refs.length };
}

/**
 * Owner publish/sync state for a composed tree row (Biblioteca).
 * @returns {{ mode: 'publish'|'update'|'repair'|'upToDate', isOwner: boolean, canAct: boolean }}
 */
export function getComposedTreeSyncState(tree, { getNostrPublisherPair, branches } = {}) {
    const published = !!String(tree?.publishedNetworkUrl || '').trim();
    if (!published) {
        return { mode: 'publish', isOwner: false, canAct: true };
    }
    const isOwner = isPublishedResourceOwner(tree, getNostrPublisherPair);
    if (!isOwner) {
        return { mode: 'upToDate', isOwner: false, canAct: false };
    }

    const integrity = branchRefIntegrity(tree?.branchRefs, branches);
    const currentHash = computeBranchSetHashSync(tree?.branchRefs || []);
    const publishedHash = String(tree?.publishedBranchSetHash || '').trim();

    if (integrity.broken || !publishedHash || (integrity.total > 0 && !currentHash)) {
        return { mode: 'repair', isOwner: true, canAct: true };
    }
    if (publishedHash && currentHash && currentHash !== publishedHash) {
        return { mode: 'update', isOwner: true, canAct: true };
    }
    return { mode: 'upToDate', isOwner: true, canAct: false };
}

/**
 * Owner publish/sync state for a published branch row (Biblioteca).
 * @returns {{ mode: 'update'|'repair'|'upToDate', isOwner: boolean, canAct: boolean }}
 */
export function getBranchSyncState(branch, { getNostrPublisherPair } = {}) {
    const published = !!String(branch?.publishedNetworkUrl || '').trim();
    if (!published) {
        return { mode: 'upToDate', isOwner: false, canAct: false };
    }
    const isOwner = isPublishedResourceOwner(branch, getNostrPublisherPair);
    if (!isOwner) {
        return { mode: 'upToDate', isOwner: false, canAct: false };
    }

    const snapHash = String(branch?.publishedSnapshotHash || '').trim();
    const draftHash = String(branch?.draftHash || '').trim();
    const data = branch?.data;
    const snap = branch?.publishedSnapshot;
    const langCount = (obj) =>
        obj?.languages && typeof obj.languages === 'object' ? Object.keys(obj.languages).length : 0;
    const dataLangs = langCount(data);
    const snapLangs = langCount(snap);

    if (!snapHash || (dataLangs === 0 && snapLangs > 0)) {
        return { mode: 'repair', isOwner: true, canAct: true };
    }
    if (snapHash && draftHash && draftHash !== snapHash) {
        return { mode: 'update', isOwner: true, canAct: true };
    }
    return { mode: 'upToDate', isOwner: true, canAct: false };
}
