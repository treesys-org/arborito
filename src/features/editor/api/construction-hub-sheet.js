/**
 * Construction dock hub sheet sizing, compact bottom sheets vs full-height hubs.
 * Compact = profile / language pattern (auto height, anchored above dock).
 */

/** @typedef {'localDraft' | 'localPublished' | 'networkOwner' | 'networkGuest' | 'noNetworkTree'} ContributorHubView */

export const CONSTRUCTION_HUB_COMPACT_SHEET_CLASS = 'arborito-sheet--hub-compact';

/**
 * @param {string | null | undefined} type
 * @param {{ contributorView?: ContributorHubView }} [ctx]
 */
export function isConstructionHubCompact(type, { contributorView } = {}) {
    if (type === 'construction-curriculum-lang' || type === 'construction-about') return true;
    if (type === 'contributor') {
        return (
            contributorView === 'localDraft' ||
            contributorView === 'noNetworkTree' ||
            contributorView === 'localPublished'
        );
    }
    return false;
}

/**
 * @param {string | null | undefined} type
 * @param {{ contributorView?: ContributorHubView }} [ctx]
 */
export function constructionHubSheetClassName(type, ctx = {}) {
    return isConstructionHubCompact(type, ctx) ? CONSTRUCTION_HUB_COMPACT_SHEET_CLASS : '';
}
