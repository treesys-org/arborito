/**
 * Import composed trees (árboles) from Nostr bundles or remix locally.
 */

import { formatNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { parseArboritoTreeBundle } from './arborito-tree-bundle.js';

/**
 * Ensure branch refs can be resolved when opening a composed tree.
 * @param {import('../../../core/store.js' ).Store} store
 * @param {object[]} branchRefs
 */
export async function enrichBranchRefsForLoad(store, branchRefs) {
    const out = [];
    for (const ref of branchRefs || []) {
        const next = { ...ref };
        const branchId = String(ref.branchId || '').trim();
        const networkUrl = String(ref.networkUrl || ref.sourceUrl || '').trim();

        if (branchId && networkUrl.startsWith('nostr://')) {
            const exists = store.userStore.state.branches?.some((b) => b.id === branchId);
            if (!exists) {
                const installed = (store.state.communitySources || []).find(
                    (s) => String(s.url) === networkUrl
                );
                if (!installed) {
                    try {
                        await store.addCommunitySource(networkUrl, {
                            listMeta: { title: ref.displayName || branchId },
                        });
                    } catch {
                        /* branch may still load via networkUrl */
                    }
                }
            }
            next.networkUrl = networkUrl;
            next.sourceUrl = networkUrl;
        } else if (branchId && !next.sourceUrl) {
            next.sourceUrl = `branch://${branchId}`;
        }
        out.push(next);
    }
    return out;
}

/**
 * Import a composed tree from a portable .arborito archive (with embedded branches).
 * @param {import('../../../core/store.js' ).Store} store
 * @param {ArrayBuffer | Uint8Array} input
 */
export async function importComposedTreeFromArchive(store, input) {
    const { readComposedTreeArchive } = await import('./arborito-tree-archive.js');
    const { readArboritoArchive } = await import('../../../shared/lib/arborito-archive.js' );
    const { manifest, bundle, embedded } = await readComposedTreeArchive(input);
    const parsed = parseArboritoTreeBundle(bundle);
    if (!parsed) throw new Error(store.ui.composedTreeInvalidBundle || 'Invalid composed tree package.');

    await store.userStore.ensureBranchesHydrated();
    const idMap = new Map();

    for (const [oldId, zipBytes] of embedded.entries()) {
        const branchData = await readArboritoArchive(zipBytes);
        const imported = store.userStore.importBranch(branchData);
        idMap.set(oldId, imported.id);
    }

    const branchRefs = (parsed.branchRefs || []).map((ref) => {
        const oldBid = String(ref.branchId || ref.refId || '').trim();
        const newBid = idMap.get(oldBid) || oldBid;
        const local = store.userStore.state.branches?.find((b) => b.id === newBid);
        return {
            refId: newBid,
            branchId: newBid,
            sourceUrl: newBid ? `branch://${newBid}` : String(ref.sourceUrl || ''),
            networkUrl: String(ref.networkUrl || ref.sourceUrl || '').trim(),
            shareCode: String(ref.shareCode || ''),
            displayName: String(local?.name || ref.displayName || newBid || ''),
            authorPub: String(ref.authorPub || ''),
        };
    });

    const title = String(parsed.title || manifest?.meta?.name || 'Tree').trim();
    const entry = store.userStore.createTree(title, branchRefs);
    const presentation = parsed.presentation || manifest?.meta?.attribution || bundle?.meta?.attribution || null;
    const patch = {};
    if (parsed.forkOf) patch.forkOf = parsed.forkOf;
    if (presentation) patch.presentation = presentation;
    const { computeBranchSetHashSync } = await import('./branch-set-hash.js');
    const hash = computeBranchSetHashSync(branchRefs);
    if (hash) patch.branchSetHash = hash;
    if (Object.keys(patch).length) store.userStore.updateTree(entry.id, patch);
    return store.userStore.getTree(entry.id);
}

/**
 * @param {import('../../../core/store.js' ).Store} store
 * @param {object} bundle - raw Nostr bundle
 * @param {{ treeRef?: { pub: string, universeId: string }, shareCode?: string, remix?: boolean }} opts
 */
export async function importComposedTreeFromBundle(store, bundle, opts = {}) {
    const parsed = parseArboritoTreeBundle(bundle);
    if (!parsed) throw new Error(store.ui.composedTreeInvalidBundle || 'Invalid composed tree package.');

    await store.userStore.ensureBranchesHydrated();
    const branchRefs = await enrichBranchRefsForLoad(store, parsed.branchRefs);
    const title = String(parsed.title || bundle?.meta?.title || 'Tree').trim();

    let entry;
    if (opts.remix) {
        entry = store.userStore.createTree(`${title} (remix)`, branchRefs);
        entry.forkOf = {
            treeUrl: opts.treeRef
                ? formatNostrTreeUrl(opts.treeRef.pub, opts.treeRef.universeId)
                : parsed.forkOf?.treeUrl || null,
            name: title,
        };
        store.userStore.updateTree(entry.id, { branchRefs, forkOf: entry.forkOf });
        entry = store.userStore.getTree(entry.id);
    } else {
        const existing = (store.userStore.state.trees || []).find(
            (t) =>
                opts.treeRef &&
                t.publishedNetworkUrl ===
                    formatNostrTreeUrl(opts.treeRef.pub, opts.treeRef.universeId)
        );
        if (existing) {
            store.userStore.updateTree(existing.id, { name: title, branchRefs });
            entry = store.userStore.getTree(existing.id);
        } else {
            entry = store.userStore.createTree(title, branchRefs);
        }
    }

    if (opts.treeRef) {
        store.userStore.setTreePublishedNetworkUrl(
            entry.id,
            formatNostrTreeUrl(opts.treeRef.pub, opts.treeRef.universeId)
        );
        entry = store.userStore.getTree(entry.id);
    }
    if (opts.shareCode && entry) {
        /* shareCode lives on directory row; stored on refs if needed later */
    }

    const presentation = parsed.presentation || bundle?.meta?.attribution || null;
    const metaPatch = {};
    if (presentation) metaPatch.presentation = presentation;
    if (parsed.forkOf && !entry.forkOf) metaPatch.forkOf = parsed.forkOf;
    if (Object.keys(metaPatch).length) {
        store.userStore.updateTree(entry.id, metaPatch);
        entry = store.userStore.getTree(entry.id);
    }
    return entry;
}

/**
 * @param {import('../../../core/store.js' ).Store} store
 * @param {string[]} branchIds
 */
export function branchRefsFromIds(store, branchIds) {
    const branches = store.userStore.state.branches || [];
    return (branchIds || [])
        .map((branchId) => {
            const b = branches.find((x) => x.id === branchId);
            if (!b) return null;
            const pubUrl = store.userStore.getBranchPublishedNetworkUrl?.(b.id);
            return {
                refId: b.id,
                branchId: b.id,
                sourceUrl: `branch://${b.id}`,
                networkUrl: pubUrl || '',
                displayName: b.name || b.id,
            };
        })
        .filter(Boolean);
}
