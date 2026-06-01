/**
 * Sage Guide (no AI) — hub → topic → tip navigation (one screen at a time).
 */

import {
    defaultSageGuideNav,
    detectSageGuideContext,
    buildSageGuideHtml
} from './sage-guide-content.js';

export {
    defaultSageGuideNav,
    detectSageGuideContext,
    resolveTipText
} from './sage-guide-content.js';

/**
 * @param {object} ui
 * @param {{ screen: string, topicId?: string, tipText?: string, tipTitle?: string }} nav
 * @param {object} store
 * @param {{ lessonNode?: object|null }} [ctxOpts]
 */
export function buildSageGuideDrillHtml(ui, nav, store, ctxOpts = {}) {
    const ctx = detectSageGuideContext(store, ctxOpts);
    const safeNav = nav && nav.screen ? nav : defaultSageGuideNav();
    return `<div class="sage-guide-stage">
        <div class="sage-guide-stage__scroll">${buildSageGuideHtml(ui, store, safeNav, ctx)}</div>
    </div>`;
}
