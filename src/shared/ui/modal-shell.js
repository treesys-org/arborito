import { shouldShowMobileUI } from './breakpoints.js';
import { resolveModalShellEnter, modalType } from './modal-enter.js';
import { store } from '../../core/store.js';

/**
 * modalShellHtml — single source of truth for every Arborito modal shell.
 *
 * Replaces ~33 hand-written `#modal-backdrop` + panel skeletons. The previous
 * helper only covered the centered desktop card; this version covers every
 * shape the app actually uses:
 *
 *   - `centered`         desktop card (default for non-dock modals)
 *   - `dock`             mobile fullbleed (`h-[100dvh]`) + desktop centered card;
 *                        picks the shape from the `mobile` flag.
 *   - `dock-bottom`      dock layout but anchored above the bottom dock pill
 *                        (search-style — `bottom: var(--arborito-mob-dock-clearance)`).
 *   - `bottom-sheet`     mobile = bottom sheet (items-end + rounded-t-2xl);
 *                        desktop = centered card.
 *   - `top-anchored`     scrollable top-anchored card (dialog-style).
 *   - `immersive`        fullscreen black (game-player).
 *
 * The id `modal-backdrop` is preserved verbatim — it is coupled to the global
 * mobile-fullbleed rules in `styles/utilities/modal-backdrop-base.css` and to
 * the dismiss-on-empty-tap logic in `components/modals.js`. The `backdropId`
 * option exists only as an escape hatch for modals that still own their own
 * scrim (you should not introduce new ones).
 *
 * Mobile vs desktop chrome
 * ------------------------
 * `mobile: true` on `dock` / `dock-bottom` / `bottom-sheet` produces a
 * fullbleed / sheet shape with no panel chrome (no rounded corners, no
 * border, no shadow) — the existing `modal-backdrop-base.css` rules expect
 * exactly that. `mobile: false` produces the canonical desktop card with
 * `.arborito-float-modal-card[--<size>]` plus rounded-3xl + slate-200 border
 * + shadow-2xl + bg-white/slate-900.
 *
 * Everything below is plain string composition. No DOM, no escaping — the
 * caller is responsible for escaping any user-supplied text in `bodyHtml`,
 * same convention as the rest of the modals.
 *
 * @param {object} opts
 * @param {string} opts.bodyHtml                                          required panel contents
 * @param {boolean} [opts.mobile]                                         override; defaults to `shouldShowMobileUI()`.
 *                                                                       DO NOT pass `shouldShowMobileUI()` manually — this helper detects it.
 * @param {'centered'|'dock'|'dock-bottom'|'bottom-sheet'|'top-anchored'|'immersive'} [opts.layout]
 * @param {'xs'|'narrow'|'lg-tight'|'md'|'lg'|'xl'|'forum'|'readme'|'search'|'certificate'|'certs'|'auto-h'} [opts.panelSize]
 *                                                                       canonical `.arborito-float-modal-card--<size>` modifier.
 *                                                                       Width grid: xs=24rem · narrow=26rem · lg-tight=32rem · md=36rem ·
 *                                                                       lg=42rem · xl=48rem · huge=64rem · forum=80rem.
 *                                                                       Semantic: auto-h (auto height), readme/search/certificate/certs.
 *                                                                       Do not pass max-w-* via panelClass; add new sizes here and in system-root-and-variants.css.
 * @param {string} [opts.panelClass]                                      extra Tailwind classes for the panel (max-h, ring, etc.)
 * @param {string} [opts.panelId]                                         id for the panel element (default: `modal-panel` on dock layouts)
 * @param {'default'|'danger'|'sage'|'flat'|'dark'|'danger-dark'} [opts.panelTone]
 *                                                                       border tone:
 *                                                                       - `default` slate-200/800 (light card)
 *                                                                       - `danger` red border on light bg (warnings)
 *                                                                       - `sage` purple-tinted (Sage variants)
 *                                                                       - `dark` slate-700 border + bg-slate-900 (game-player loading/consent)
 *                                                                       - `danger-dark` red-500/50 border + bg-slate-900 (game-player error/crash)
 * @param {'soft'|'strong'} [opts.lift]                                   extra outer ring + richer shadow ("lifted" feel).
 *                                                                       Adds `.arborito-float-modal-card--lift-*`. Strong = forum-style.
 * @param {'3xl'|'2xl'|'sheet-top'|'none'} [opts.panelRadius]             radius override; defaults match each layout
 * @param {'opaque'|'translucent'|'translucent-strong'|'blur'|'black'|'none'} [opts.scrim]
 * @param {'fade'|'fade-fast'|'fade-slow'|'dock'|'instant'|'none'} [opts.enter]
 *                                                                       `dock` = `arborito-dock-modal-enter` (sage/search/profile/arcade family)
 * @param {number} [opts.z]                                               z-index for the backdrop (default 70)
 * @param {string} [opts.rootFlags]                                       extra classes on the backdrop. arborito-modal--mobile is
 *                                                                       added automatically when mobile=true — do not pass it here.
 * @param {boolean} [opts.instantOpen]                                    skip enter animation: adds arborito-modal-backdrop--instant
 *                                                                       and enter: 'instant'.
 * @param {string} [opts.backdropId]                                      override `modal-backdrop` (escape hatch, avoid)
 * @param {boolean} [opts.bareBackdrop]                                   when true, emits ONLY the backdrop and inlines `bodyHtml`
 *                                                                       (no canonical panel chrome). Used by modals that own a
 *                                                                       custom panel skeleton (sources/about-embed/etc.).
 * @returns {string}
 */
export function modalShellHtml(opts) {
    const o = opts || {};
    const body = o.bodyHtml || '';
    /* Auto-detect mobile when callers omit the flag. */
    const mobile = o.mobile == null ? shouldShowMobileUI() : !!o.mobile;
    const layout = o.layout || 'centered';
    const z = typeof o.z === 'number' ? o.z : 70;
    const backdropId = o.backdropId || 'modal-backdrop';
    const hasExplicitEnter = Object.prototype.hasOwnProperty.call(o, 'enter');
    const hasExplicitInstant = Object.prototype.hasOwnProperty.call(o, 'instantOpen');
    let instantOpen = !!o.instantOpen;
    let enterOverride = o.enter;
    let dockSwap = false;

    if (!hasExplicitEnter && !hasExplicitInstant) {
        const curType = modalType(store.state?.modal);
        if (curType && store._modalShellPainted && store._modalShellSession === curType) {
            instantOpen = true;
            enterOverride = 'instant';
        } else {
            const policy = resolveModalShellEnter(store._prevModal, store.state?.modal, { layout });
            instantOpen = policy.instantOpen;
            enterOverride = policy.enter;
            dockSwap = !!policy.dockSwap;
        }
    }

    /* --- Scrim ------------------------------------------------------------ */
    const scrim = o.scrim || (layout === 'immersive' ? 'black' : 'opaque');
    const scrimCls = scrim === 'translucent' ? 'bg-slate-950/70'
        : scrim === 'translucent-strong' ? 'bg-slate-950/80'
        : scrim === 'blur' ? 'bg-slate-950/60 backdrop-blur-sm'
        : scrim === 'black' ? 'bg-black'
        : scrim === 'none' ? ''
        : 'bg-slate-950';

    /* --- Enter animation -------------------------------------------------- */
    /* `instantOpen` skips enter animation when switching between modals (sage/profile/search). */
    const enter = instantOpen ? 'instant' : (enterOverride || (
        layout === 'dock' || layout === 'dock-bottom' ? 'dock'
        : layout === 'top-anchored' ? 'fade-fast'
        : 'fade-fast'
    ));
    const enterCls = enter === 'instant' || enter === 'none' ? ''
        : enter === 'dock' ? 'arborito-dock-modal-enter'
        : enter === 'fade-fast' ? 'animate-in fade-in duration-200'
        : enter === 'fade-slow' ? 'animate-in fade-in duration-500'
        : 'animate-in fade-in';

    /* --- Panel chrome ----------------------------------------------------- */
    /* Canonical width grid — add new sizes here and in system-root-and-variants.css.
     * panelSize accepts one token or several (e.g. 'lg-tight auto-h'). */
    const validSizes = new Set([
        'xs', 'narrow', 'lg-tight', 'md', 'lg', 'xl',
        'auto-h', 'forum', 'readme', 'search', 'certificate', 'certs',
    ]);
    const panelSizeMod = (o.panelSize || '')
        .split(/[\s,]+/)
        .filter((s) => s && validSizes.has(s))
        .map((s) => ` arborito-float-modal-card--${s}`)
        .join('');
    /* "lift" — extra outer ring + richer shadow shared by the forum and any modal
     * that wants the same lifted feel. The actual ring/shadow lives in
     * `styles/modals/system-root-and-variants.css` (.arborito-float-modal-card--lift-*). */
    const liftMod = o.lift === 'strong' ? ' arborito-float-modal-card--lift-strong'
        : o.lift === 'soft' ? ' arborito-float-modal-card--lift-soft'
        : '';
    const panelExtra = o.panelClass ? ' ' + o.panelClass : '';
    const panelIdAttr = o.panelId
        ? ` id="${o.panelId}"`
        : ((layout === 'dock' || layout === 'dock-bottom') ? ' id="modal-panel"' : '');
    /* Inject dialog role when callers omit it (WCAG 2.1). */
    const callerAttrs = o.panelAttrs || '';
    const hasRoleAttr = /\brole\s*=/.test(callerAttrs);
    const a11yAttrs = hasRoleAttr ? '' : ' role="dialog" aria-modal="true"';
    const panelAttrs = callerAttrs ? ' ' + callerAttrs + a11yAttrs : a11yAttrs;

    const isMobileFull = (layout === 'dock' || layout === 'dock-bottom') && mobile;
    const isBottomSheet = layout === 'bottom-sheet';

    const isDarkPanel = o.panelTone === 'dark' || o.panelTone === 'danger-dark';
    const borderTone = o.panelTone === 'danger'
        ? 'border-red-500/50 dark:border-red-500/30'
        : o.panelTone === 'sage'
            ? 'border-purple-200 dark:border-purple-800/40'
            : o.panelTone === 'dark'
                ? 'border-slate-700'
                : o.panelTone === 'danger-dark'
                    ? 'border-red-500/50'
                    : 'arborito-surface-panel-border';
    /* Canonical modal surface tokens live in system-root-and-variants.css. */
    const bgTone = isDarkPanel ? 'bg-slate-900' : 'arborito-surface-panel';

    const radius = o.panelRadius || (
        isMobileFull || layout === 'immersive' ? 'none'
        : isBottomSheet ? 'sheet-top'
        : layout === 'top-anchored' ? '2xl'
        : '3xl'
    );
    const radiusCls = radius === 'none' ? 'rounded-none'
        : radius === '2xl' ? 'rounded-2xl'
        : radius === 'sheet-top' ? 'rounded-t-2xl sm:rounded-2xl'
        : 'rounded-3xl';

    let panelCls;
    if (isMobileFull) {
        // Mobile fullbleed: no chrome — global rules in modal-backdrop-base.css
        // force the panel to span the viewport.
        panelCls = `arborito-float-modal-card${liftMod} ${bgTone} w-full flex-1 min-h-0 h-full relative overflow-hidden flex flex-col border-0 shadow-none ${radiusCls} cursor-auto${panelExtra}`;
    } else if (layout === 'immersive') {
        panelCls = `arborito-float-modal-card${liftMod} relative overflow-hidden flex flex-col cursor-auto w-full h-full ${radiusCls}${panelExtra}`;
    } else {
        panelCls = `arborito-float-modal-card${panelSizeMod}${liftMod} ${bgTone} ${radiusCls} shadow-2xl relative overflow-hidden flex flex-col border ${borderTone} cursor-auto${panelExtra}`;
    }

    /* --- Backdrop --------------------------------------------------------- */
    /* instantOpen also flags the backdrop so CSS can skip scrim fade-in. */
    const instantFlag = instantOpen ? ' arborito-modal-backdrop--instant' : '';
    const swapFlag = dockSwap ? ' arborito-modal-backdrop--dock-swap' : '';
    const rootFlags = (o.rootFlags ? ' ' + o.rootFlags : '') + instantFlag + swapFlag;

    let backdropLayoutCls;
    if (layout === 'dock' && mobile) {
        // Full viewport fullbleed (height 100dvh). Used by sage/profile/arcade/tree-info/etc.
        backdropLayoutCls = `flex flex-col p-0 m-0 ${scrimCls} h-[100dvh] min-h-[100dvh]`;
    } else if (layout === 'dock-bottom' && mobile) {
        // Anchored above the bottom dock pill; backdrop stops short of the dock.
        backdropLayoutCls = `flex flex-col items-stretch justify-start p-0 m-0 ${scrimCls}`;
    } else if (layout === 'bottom-sheet' && mobile) {
        backdropLayoutCls = `flex items-end justify-center p-0 ${scrimCls}`;
    } else if (layout === 'top-anchored') {
        backdropLayoutCls = `flex items-start justify-center pt-[min(18vh,5.5rem)] pb-10 px-4 overflow-y-auto ${scrimCls}`;
    } else if (layout === 'immersive') {
        backdropLayoutCls = `flex ${scrimCls}`;
    } else {
        // centered (and desktop variants of dock / dock-bottom / bottom-sheet)
        backdropLayoutCls = `flex items-center justify-center p-4 ${scrimCls}`;
    }

    const backdropPosCls = (layout === 'dock-bottom' && mobile)
        ? 'fixed'
        : 'fixed inset-0';

    const dockBottomStyle = (layout === 'dock-bottom' && mobile)
        ? ' style="top:0;left:0;right:0;bottom:var(--arborito-mob-dock-clearance,4.25rem);width:100%;max-width:100vw;height:auto;min-height:0;max-height:none;box-sizing:border-box;"'
        : '';

    const immersiveFlag = layout === 'immersive' ? ' arborito-modal--immersive' : '';
    /* Auto-add mobile flags so fullbleed dock CSS applies without per-modal rootFlags.
     * IMPORTANT: this initial paint set of the fullbleed flag will be re-evaluated by
     * `_syncOpenModalBackdropChrome()` in `components/modals.js` on every store tick. If
     * your modal's type string is NOT in `MOBILE_FULLBLEED_MODAL_TYPES` over there, the
     * class will be stripped — and the modal will look like it has 0.75rem of padding
     * on all sides on mobile (so it does not "cover the margins"). Always add new dock-layout
     * modal types to that Set when you wire them up. */
    const mobileFlag = mobile ? ' arborito-modal--mobile' : '';
    const mobileFullbleedFlag = (layout === 'dock' && mobile) ? ' arborito-modal--mobile-fullbleed' : '';

    const inside = o.bareBackdrop
        ? body
        : `<div${panelIdAttr}${panelAttrs} class="${panelCls}">${body}</div>`;

    const paintedType = modalType(store.state?.modal);
    if (paintedType && store._modalShellSession === paintedType) {
        store._modalShellPainted = true;
    }

    return `<div id="${backdropId}" class="${backdropPosCls} z-[${z}] ${backdropLayoutCls} ${enterCls} arborito-modal-root${rootFlags}${immersiveFlag}${mobileFlag}${mobileFullbleedFlag}"${dockBottomStyle}>
        ${inside}
    </div>`;
}
