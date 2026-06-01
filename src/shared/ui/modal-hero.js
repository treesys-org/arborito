import { modalNavBackHtml, modalWindowCloseXHtml } from './dock-sheet-chrome.js';
import { shouldShowMobileUI } from './breakpoints.js';

/**
 * Canonical dock-modal hero row.
 *
 * Replaces ~25 hand-rolled copies of the same `<div class="arborito-sheet__hero
 * arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero …">← title ×</div>`
 * scattered across modal templates (search, arcade-ui, profile, sources,
 * manual, releases, admin, tree-info, tree-report, construction-history,
 * publish-diff, pick-curriculum-lang, construction-curriculum-lang,
 * certificates, progress-widget, sage-ui-chat).
 *
 * The wrapper picks one of two canonical class strings based on `mobile`:
 *   - Mobile  → `arborito-sheet__hero arborito-sheet__hero--mmenu-sub
 *                arborito-dock-modal-hero shrink-0 …`
 *   - Desktop → `arborito-float-modal-head arborito-dock-modal-hero shrink-0
 *                px-4 pt-4 pb-2 …`
 *
 * Inside the wrapper, in order:
 *   1. `←` back (mobile only — see `modalNavBackHtml`)
 *   2. `leadingIcon` (optional, raw HTML)
 *   3. Title block:
 *        - With `subtitle`: `<div class="min-w-0 flex-1"><h2/><p/></div>`
 *        - Without:        `<h2 class="… flex-1 min-w-0">…</h2>`
 *   4. `trailingHtml` (optional — e.g. Sage mode toggle)
 *   5. `×` close (desktop window-X; hidden on mobile unless
 *        `closeShowOnMobile: true`)
 *   6. `trailingSpacer` (mobile only) — keeps the title visually centered
 *        when no close × is rendered (tree-info pattern)
 *
 * All text MUST be pre-escaped by the caller (same convention as the rest of
 * Arborito's template-string templates — see `escHtml()` callers).
 */
export function modalHeroHtml(ui, opts) {
    const o = opts || {};
    /* Default to the current viewport. Pass `mobile: true` to force the mobile wrap on
     * desktop too (canonical pattern for the "tree drill" family: tree-info, tree-report,
     * sources, readme — all read as one panel). Pass `mobile: false` to force desktop. */
    const mobile = o.mobile == null ? shouldShowMobileUI() : !!o.mobile;
    const align = o.align === 'start' ? 'items-start' : 'items-center';
    /* tone: 'danger' adds the red-tinted wrap + large red title used by
     * security-warning / load-warning. Callers can still override titleClass. */
    const danger = o.tone === 'danger';

    const baseWrap = mobile
        ? 'arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0'
        : 'arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2';

    const toneWrap = danger ? 'bg-red-50 dark:bg-red-900/10' : '';

    const extraWrap = [
        toneWrap,
        o.extraWrapClass || '',
        mobile ? (o.extraWrapClassMobile || '') : (o.extraWrapClassDesktop || ''),
    ]
        .filter(Boolean)
        .join(' ');

    const wrapCls = [baseWrap, `flex ${align} gap-2`, extraWrap].filter(Boolean).join(' ');

    const backTag = o.backTagClass || o.tagClass || 'btn-close';
    const closeTag = o.closeTagClass || o.tagClass || 'btn-close';
    const backAlignTweak = align === 'start' ? ' mt-0.5' : '';
    /* tone:'danger' uses the red-bordered back chip both warning modals shared. */
    const backDangerExtra = danger
        ? ' w-10 h-10 flex items-center justify-center rounded-xl border border-red-200 dark:border-red-800/50 bg-white/80 dark:bg-slate-900/80 text-red-800 dark:text-red-200'
        : '';
    const backClasses = o.backClass || `arborito-mmenu-back shrink-0${backAlignTweak}${backDangerExtra}`;
    const backHtml = o.showBack === false
        ? ''
        : modalNavBackHtml(ui, backClasses, { tagClass: backTag });
    const closeHtml = o.showClose === false
        ? ''
        : modalWindowCloseXHtml(ui, closeTag, { showOnMobile: !!o.closeShowOnMobile });

    const titleClass = o.titleClass
        || (danger ? 'font-black text-xl text-red-800 dark:text-red-300 m-0' : 'arborito-mmenu-subtitle m-0');
    const titleIdAttr = o.titleId ? ` id="${o.titleId}"` : '';
    const titleTruncCls = o.titleTruncate ? ' truncate' : '';

    let titleBlock;
    if (o.subtitle) {
        const subCls = o.subtitleClass
            || 'text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5 leading-snug';
        titleBlock =
            `<div class="min-w-0 flex-1">` +
                `<h2${titleIdAttr} class="${titleClass}${titleTruncCls}">${o.title || ''}</h2>` +
                `<p class="${subCls}">${o.subtitle}</p>` +
            `</div>`;
    } else {
        titleBlock = `<h2${titleIdAttr} class="${titleClass} flex-1 min-w-0${titleTruncCls}">${o.title || ''}</h2>`;
    }

    const trailing = o.trailingHtml || '';
    const spacer = (o.trailingSpacer && mobile && !closeHtml)
        ? '<span class="w-10 shrink-0" aria-hidden="true"></span>'
        : '';

    const idAttr = o.wrapperId ? ` id="${o.wrapperId}"` : '';
    return `<div${idAttr} class="${wrapCls}">${backHtml}${o.leadingIcon || ''}${titleBlock}${trailing}${closeHtml}${spacer}</div>`;
}
