/**
 * Nostr bundle for composed trees (árboles), references branches, no curriculum duplication.
 */

import { normalizeAttribution } from '../../../shared/lib/arborito-attribution.js';

const TREE_BUNDLE_FORMAT = 'arborito-tree';
const TREE_BUNDLE_VERSION = 1;

/**
 * @param {object} treeEntry - local composed tree entry
 * @param {object} [meta]
 * @param {object} [attribution]
 */
export function buildArboritoTreeBundleObject(treeEntry, meta = {}, attribution = null) {
    const id = String(treeEntry.id || '').trim();
    const title = String(treeEntry.name || '').trim() || 'Tree';
    const branchRefs = Array.isArray(treeEntry.branchRefs)
        ? treeEntry.branchRefs.map((r) => ({
              refId: String(r.refId || r.branchId || ''),
              branchId: String(r.branchId || ''),
              sourceUrl: String(r.sourceUrl || ''),
              networkUrl: String(r.networkUrl || ''),
              shareCode: String(r.shareCode || ''),
              displayName: String(r.displayName || ''),
              authorPub: String(r.authorPub || ''),
          }))
        : [];

    const pres =
        treeEntry.presentation && typeof treeEntry.presentation === 'object'
            ? treeEntry.presentation
            : {};
    const attr = normalizeAttribution(
        attribution ||
            {
                description: pres.description,
                authorName: pres.authorName,
                authorAbout: pres.authorAbout,
                supportUrl: pres.supportUrl,
                ownerPub: pres.ownerPub,
                collaborators: pres.collaborators,
                forkOf: treeEntry.forkOf || pres.forkOf,
                contentKind: 'composed-tree',
            }
    );

    return {
        format: TREE_BUNDLE_FORMAT,
        version: TREE_BUNDLE_VERSION,
        generatedAt: new Date().toISOString(),
        tree: {
            id,
            title,
            branchRefs,
            forkOf: treeEntry.forkOf || null,
            presentation: attr,
        },
        meta: {
            title,
            universeName: title,
            description: attr.description || '',
            authorName: attr.authorName || '',
            authorAbout: attr.authorAbout || '',
            supportUrl: attr.supportUrl || '',
            license: attr.license,
            licenseUrl: attr.licenseUrl,
            attribution: attr,
            ...meta,
        },
    };
}

/** @param {object} bundle */
export function parseArboritoTreeBundle(bundle) {
    if (!bundle || bundle.format !== TREE_BUNDLE_FORMAT) return null;
    const tree = bundle.tree;
    if (!tree || !Array.isArray(tree.branchRefs)) return null;
    return tree;
}
