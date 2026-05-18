/**
 * Normaliza el JSON devuelto por red / local / Nostr antes de DataProcessor.
 * (bundles .arborito, meta, etc.) — sin tocar loading ni el store salvo applyBundlePayload.
 */

import {
    isArboritoBundle,
    extractTreeAndPayloadFromBundle,
    mergeBundleMetaIntoTree
} from './arborito-bundle.js';

/**
 * @param {unknown} json
 * @param {{ applyBundlePayload: Function }} store
 * @param {object|null} finalSource
 * @returns {object|null}
 */
export function normalizeLoadedTreeJson(json, store, finalSource) {
    let graphJson = json;
    if (graphJson && isArboritoBundle(graphJson)) {
        const unpacked = extractTreeAndPayloadFromBundle(graphJson);
        if (unpacked) {
            store.applyBundlePayload(unpacked, finalSource);
            graphJson = unpacked.tree;
            if (unpacked.meta) mergeBundleMetaIntoTree(graphJson, unpacked.meta);
        }
    }
    return graphJson && typeof graphJson === 'object' ? graphJson : null;
}
