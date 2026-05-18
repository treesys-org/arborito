/**
 * When to offer the tree introduction modal (readme) and per-source-version tracking.
 */

import { store } from '../store.js';
import { fileSystem } from '../services/filesystem.js';

/** @param {string} fullSourceId */
export function readmeIntroSeenKey(fullSourceId) {
    return `arborito-readme-intro-seen-${fullSourceId}`;
}

/**
 * Should we schedule the readme after a full loadData (not an internal refresh)?
 * @param {boolean} suppressReadmeAutoOpen
 */
export function shouldOfferReadmeIntro(suppressReadmeAutoOpen) {
    if (suppressReadmeAutoOpen || !store.state.activeSource || store.state.modal) return false;
    // Construction mode: author already edits “About this tree” in the panel; do not interrupt with intro modal.
    if (store.state.constructionMode) return false;
    // Local garden: author’s material; do not force course readme on plant/load.
    if (fileSystem.isLocal) return false;
    const fullId = store.state.activeSource.id;
    const baseId = fullId.split('-')[0];
    try {
        if (localStorage.getItem(readmeIntroSeenKey(fullId)) === 'true') return false;
        if (localStorage.getItem(`arborito-skip-readme-${baseId}`) === 'true') return false;
    } catch {
        return false;
    }
    return true;
}
