import { useEffect, useRef } from 'react';
import { useShellStore } from '../hooks/useShell.js';
import { shouldShowMobileUI } from '../../shared/ui/breakpoints.js';
import { resolveModalShellEnter, modalType } from '../../shared/ui/modal-enter.js';
import { resolveMobileDockHubLayout, isMobileDockSheetRootFlags } from '../../shared/ui/mobile-fullbleed-modals.js';
import { dockModalPanelSize } from '../../shared/ui/modal-panel-size.js';
import { isModalBackdropEmptyTap } from '../../shared/ui/mobile-tap.js';
import { DockHubShell } from './DockHubShell.jsx';

const VALID_SIZES = new Set([
    'xs', 'compact', 'standard', 'content', 'xl', 'dock-hub',
    'auto-h', 'forum', 'readme', 'certificate', 'certs',
]);

/** Desktop hub sheets (Arcade, Historial, Acerca README…) keep dock layout; compact cards center in viewport. */
const DESKTOP_HUB_SIZE_TIERS = new Set(['HUB', 'FORUM', 'README', 'DOCK-HUB']);

function resolveDesktopModalLayout(mobile, layout, sizeTier) {
    if (mobile) return layout;
    if (layout === 'immersive' || layout === 'bottom-sheet') return layout;
    if (layout === 'centered') return layout;
    const tier = String(sizeTier || '').toUpperCase();
    if (DESKTOP_HUB_SIZE_TIERS.has(tier)) return layout;
    return 'centered';
}

function computeEnterState(layout, shellOpts = {}, shellStore) {
    const o = shellOpts;
    const hasExplicitEnter = Object.prototype.hasOwnProperty.call(o, 'enter');
    const hasExplicitInstant = Object.prototype.hasOwnProperty.call(o, 'instantOpen');
    let instantOpen = !!o.instantOpen;
    let enterOverride = o.enter;
    let dockSwap = false;

    if (!hasExplicitEnter && !hasExplicitInstant) {
        const curType = modalType(shellStore.state?.modal);
        if (curType && shellStore._modalShellPainted && shellStore._modalShellSession === curType) {
            instantOpen = true;
            enterOverride = 'instant';
        } else {
            const policy = resolveModalShellEnter(shellStore._prevModal, shellStore.state?.modal, { layout });
            instantOpen = policy.instantOpen;
            enterOverride = policy.enter;
            dockSwap = !!policy.dockSwap;
        }
    }

    const enter = instantOpen ? 'instant' : (enterOverride || (
        layout === 'dock' || layout === 'dock-bottom' ? 'dock'
        : layout === 'top-anchored' ? 'fade-fast'
        : 'fade-fast'
    ));

    const enterCls = enter === 'instant' || enter === 'none' ? ''
        : enter === 'dock' ? 'arborito-dock-modal-enter'
        : enter === 'fade-fast' ? 'animate-in fade-in duration-200'
        : enter === 'fade-slow' ? 'animate-in fade-in duration-500'
        : enter === 'fade' ? 'animate-in fade-in'
        : 'animate-in fade-in';

    return { instantOpen, enterCls, dockSwap };
}

function panelSizeClass(panelSize) {
    return String(panelSize || '')
        .split(/[\s,]+/)
        .filter((s) => s && VALID_SIZES.has(s))
        .map((s) => ` arborito-float-modal-card--${s}`)
        .join('');
}

/**
 * Modal backdrop + panel, React port of `modalShellHtml`.
 */
export function ModalShell({
    children,
    mobile: mobileProp,
    layout = 'centered',
    panelSize: panelSizeProp,
    panelClass = '',
    panelId,
    panelTone = 'default',
    lift,
    panelRadius: panelRadiusProp,
    scrim: scrimProp,
    z = 70,
    rootFlags = '',
    backdropId = 'modal-backdrop',
    bareBackdrop = false,
    shellOpts = {},
    onBackdropClick,
}) {
    const backdropRef = useRef(null);
    const shellStore = useShellStore();
    const o = shellOpts;
    const mobile = mobileProp == null ? shouldShowMobileUI() : !!mobileProp;
    const { instantOpen, enterCls, dockSwap } = computeEnterState(layout, o, shellStore);

    useEffect(() => {
        const paintedType = modalType(shellStore.state?.modal);
        if (paintedType && shellStore._modalShellSession === paintedType) {
            shellStore._modalShellPainted = true;
        }
    });

    const scrim = scrimProp || o.scrim || (layout === 'immersive' ? 'black' : 'opaque');
    const scrimCls = scrim === 'translucent' ? 'bg-slate-950/70'
        : scrim === 'translucent-strong' ? 'bg-slate-950/80'
        : scrim === 'blur' ? 'bg-slate-950/60 backdrop-blur-sm'
        : scrim === 'black' ? 'bg-black'
        : scrim === 'none' ? ''
        : 'bg-slate-950';

    const panelSizeMod = panelSizeClass(panelSizeProp || o.panelSize || '');
    const liftMod = lift === 'strong' ? ' arborito-float-modal-card--lift-strong'
        : lift === 'soft' ? ' arborito-float-modal-card--lift-soft'
        : o.lift === 'strong' ? ' arborito-float-modal-card--lift-strong'
        : o.lift === 'soft' ? ' arborito-float-modal-card--lift-soft'
        : '';

    const panelIdAttr = panelId || ((layout === 'dock' || layout === 'dock-bottom') ? 'modal-panel' : undefined);
    const isMobileFull = (layout === 'dock' || layout === 'dock-bottom') && mobile;
    const isBottomSheet = layout === 'bottom-sheet';
    const isDarkPanel = panelTone === 'dark' || panelTone === 'danger-dark' || o.panelTone === 'dark' || o.panelTone === 'danger-dark';
    const tone = panelTone !== 'default' ? panelTone : (o.panelTone || 'default');

    const borderTone = tone === 'danger'
        ? 'border-red-500/50 dark:border-red-500/30'
        : tone === 'sage'
          ? 'border-purple-200 dark:border-purple-800/40'
          : tone === 'dark'
            ? 'border-slate-700'
            : tone === 'danger-dark'
              ? 'border-red-500/50'
              : 'arborito-surface-panel-border';

    const bgTone = isDarkPanel ? 'bg-slate-900' : 'arborito-surface-panel';

    const radius = panelRadiusProp ?? o.panelRadius ?? (
        isMobileFull || layout === 'immersive' ? 'none'
        : isBottomSheet ? 'sheet-top'
        : layout === 'top-anchored' ? '2xl'
        : layout === 'dock' && mobile ? 'none'
        : layout === 'dock' ? '2xl'
        : '3xl'
    );

    const radiusCls = radius === 'none' ? 'rounded-none'
        : radius === '2xl' ? 'rounded-2xl'
        : radius === 'sheet-top' ? 'rounded-t-2xl sm:rounded-2xl'
        : 'rounded-3xl';

    let panelCls;
    if (isMobileFull) {
        panelCls = `arborito-float-modal-card${liftMod} ${bgTone} w-full flex-1 min-h-0 h-full relative overflow-hidden flex flex-col border-0 shadow-none ${radiusCls} cursor-auto${panelClass ? ` ${panelClass}` : ''}${o.panelClass ? ` ${o.panelClass}` : ''}`;
    } else if (layout === 'immersive') {
        panelCls = `arborito-float-modal-card${liftMod} relative overflow-hidden flex flex-col cursor-auto w-full h-full ${radiusCls}${panelClass ? ` ${panelClass}` : ''}${o.panelClass ? ` ${o.panelClass}` : ''}`;
    } else {
        panelCls = `arborito-float-modal-card${panelSizeMod}${liftMod} ${bgTone} ${radiusCls} shadow-2xl relative overflow-hidden flex flex-col border ${borderTone} cursor-auto${panelClass ? ` ${panelClass}` : ''}${o.panelClass ? ` ${o.panelClass}` : ''}`;
    }

    const instantFlag = instantOpen ? ' arborito-modal-backdrop--instant' : '';
    const swapFlag = dockSwap ? ' arborito-modal-backdrop--dock-swap' : '';
    const rootFlagsCls =
        (rootFlags ? ` ${String(rootFlags).trim()}` : '') +
        (o.rootFlags ? ` ${String(o.rootFlags).trim()}` : '') +
        instantFlag +
        swapFlag;

    const rootFlagsCombined = `${rootFlags || ''} ${o.rootFlags || ''}`.trim();
    const hubDockRoot = isMobileDockSheetRootFlags(rootFlagsCombined);
    const mobileDockSheet = mobile && hubDockRoot && (layout === 'dock' || layout === 'dock-bottom');

    let backdropLayoutCls;
    if (layout === 'dock' && mobile && !hubDockRoot) {
        backdropLayoutCls = `flex flex-col p-0 m-0 ${scrimCls} h-[100dvh] min-h-[100dvh]`;
    } else if ((layout === 'dock-bottom' || mobileDockSheet) && mobile) {
        backdropLayoutCls = `flex flex-col items-stretch justify-start p-0 m-0 ${scrimCls}`;
    } else if (layout === 'dock' && mobile) {
        backdropLayoutCls = `flex flex-col items-stretch justify-start p-0 m-0 ${scrimCls}`;
    } else if (layout === 'bottom-sheet' && mobile) {
        backdropLayoutCls = `flex items-end justify-center p-0 ${scrimCls}`;
    } else if (layout === 'top-anchored') {
        backdropLayoutCls = `flex items-start justify-center pt-[min(18vh,5.5rem)] pb-10 px-4 overflow-y-auto ${scrimCls}`;
    } else if (layout === 'immersive') {
        backdropLayoutCls = `flex flex-col items-stretch justify-start p-0 m-0 h-[100dvh] min-h-[100dvh] ${scrimCls}`;
    } else {
        backdropLayoutCls = `flex items-center justify-center p-4 ${scrimCls}`;
    }

    const backdropPosCls = ((layout === 'dock-bottom' || mobileDockSheet) && mobile) ? 'fixed' : 'fixed inset-0';
    const dockBottomStyle = ((layout === 'dock-bottom' || mobileDockSheet) && mobile)
        ? { top: 0, left: 0, right: 0, bottom: 'var(--arborito-sheet-dock-gap, var(--arborito-chrome-dock-gap, 4.25rem))', width: '100%', maxWidth: '100vw', height: 'auto', minHeight: 0, maxHeight: 'none', boxSizing: 'border-box' }
        : undefined;

    const immersiveFlag = layout === 'immersive' ? ' arborito-modal--immersive' : '';
    const mobileFlag = mobile ? ' arborito-modal--mobile' : '';
    const mobileFullbleedFlag =
        layout === 'dock' && mobile && !hubDockRoot ? ' arborito-modal--mobile-fullbleed' : '';

    const handleBackdropClick = (e) => {
        if (onBackdropClick && isModalBackdropEmptyTap(backdropRef.current, e)) {
            onBackdropClick(e);
        }
    };

    const inside = bareBackdrop ? children : (
        <div id={panelIdAttr} role="dialog" aria-modal="true" className={panelCls}>
            {children}
        </div>
    );

    const zIndex = typeof o.z === 'number' ? o.z : z;
    /* z-index MUST be an inline style, never a Tailwind `z-[${n}]` class: those
     * arbitrary-value classes are interpolated at runtime, so Tailwind's JIT
     * never sees the literal string and never emits the rule. The class silently
     * does nothing → the backdrop falls back to `z-index:auto` and renders BEHIND
     * the forest header, with its opaque scrim blacking out the graph (this is
     * what made the Library modal hide behind the header and construction go all
     * dark). `#modal-backdrop` has no baseline z-index in CSS, so this is the
     * only thing that stacks the modal above the shell. */
    const rootStyle = dockBottomStyle ? { ...dockBottomStyle, zIndex } : { zIndex };

    return (
        <div
            ref={backdropRef}
            id={o.backdropId || backdropId}
            className={`${backdropPosCls} ${backdropLayoutCls} ${enterCls} arborito-modal-root${rootFlagsCls}${immersiveFlag}${mobileFlag}${mobileFullbleedFlag}`.replace(/\s+/g, ' ').trim()}
            style={rootStyle}
            onClick={onBackdropClick ? handleBackdropClick : undefined}
        >
            {inside}
        </div>
    );
}

/**
 * Assembled modal with optional dock hub chrome, React port of `renderModalShell` / `renderDockModalShell`.
 */
export function DockModalShell({
    hero,
    children,
    footer,
    toolbar,
    mobile: mobileProp,
    layout: layoutProp = 'dock',
    useDockChrome,
    rootClass = '',
    skipBodyWrap,
    sizeTier,
    panelClass = '',
    shellOpts = {},
    onBackdropClick,
}) {
    const mob = mobileProp == null ? shouldShowMobileUI() : !!mobileProp;
    const rootFlagsStr = String(shellOpts.rootFlags || '').trim();
    const requestedLayout = resolveDesktopModalLayout(
        mob,
        layoutProp ?? shellOpts.layout ?? 'dock',
        sizeTier,
    );
    const layout = resolveMobileDockHubLayout(mob, requestedLayout, rootFlagsStr);
    const dockSheet = mob && layout === 'dock-bottom';
    const hubChrome =
        useDockChrome === true ||
        (useDockChrome !== false && !!hero && (layout === 'dock' || layout === 'dock-bottom'));

    const dockFullbleed = mob && (layout === 'dock' || layout === 'dock-bottom');
    const panelSize = sizeTier != null ? dockModalPanelSize(sizeTier, dockFullbleed) : undefined;
    const resolvedPanelClass =
        panelClass || shellOpts.panelClass || (dockSheet ? 'arborito-modal-dock-panel w-full max-h-full' : '');

    let inner;
    if (hubChrome) {
        inner = (
            <DockHubShell
                mobile={mob}
                hero={hero}
                toolbar={toolbar}
                rootClass={rootClass}
                skipBodyWrap={skipBodyWrap}
                footer={footer}
            >
                {children}
            </DockHubShell>
        );
    } else {
        inner = (
            <>
                {hero}
                {children}
                {footer}
            </>
        );
    }

    return (
        <ModalShell
            mobile={mob}
            layout={layout}
            panelSize={panelSize}
            panelClass={resolvedPanelClass}
            panelRadius={
                shellOpts.panelRadius ??
                ((layout === 'dock' || layout === 'dock-bottom') && mob ? 'none' : layout === 'dock' ? '2xl' : undefined)
            }
            onBackdropClick={onBackdropClick}
            shellOpts={shellOpts}
            z={shellOpts.z ?? 70}
            panelTone={shellOpts.panelTone}
            rootFlags={shellOpts.rootFlags}
            backdropId={shellOpts.backdropId}
            bareBackdrop={!!shellOpts.bareBackdrop}
        >
            {inner}
        </ModalShell>
    );
}

/** Trusted HTML from legacy helpers (calloutHtml, modalHeroHtml strings, …). */
export function ModalHtml({ html, as: Tag = 'div', className, id, ...rest }) {
    if (!html) return null;
    return (
        <Tag
            className={className}
            id={id}
            dangerouslySetInnerHTML={{ __html: html }}
            {...rest}
        />
    );
}

/** Centered card modal, `layout: 'centered'`, no dock hub chrome. */
export function ModalCenteredShell({
    children,
    hero,
    footer,
    layout = 'centered',
    sizeTier,
    shellOpts = {},
    onBackdropEmptyTap,
    onBackdropClick,
    mobile: mobileProp,
    ...rest
}) {
    const mobile = mobileProp == null ? shouldShowMobileUI() : !!mobileProp;
    const resolvedLayout = resolveDesktopModalLayout(mobile, layout, sizeTier);
    const dockFullbleed = false;
    const panelSize = sizeTier != null ? dockModalPanelSize(sizeTier, dockFullbleed) : undefined;
    const click = onBackdropEmptyTap || onBackdropClick;
    const heroNode =
        hero == null || hero === false
            ? null
            : typeof hero === 'string'
              ? hero.trim()
                  ? <ModalHtml html={hero} />
                  : null
              : hero;
    return (
        <ModalShell
            layout={resolvedLayout}
            panelSize={panelSize}
            onBackdropClick={click}
            shellOpts={shellOpts}
            mobile={mobile}
            {...rest}
        >
            {heroNode}
            {children}
            {footer}
        </ModalShell>
    );
}
