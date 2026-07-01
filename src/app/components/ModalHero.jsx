import { shouldShowMobileUI } from '../../shared/ui/breakpoints.js';

const MODAL_WIN_X_SVG = (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        aria-hidden="true"
        className="w-[1.125rem] h-[1.125rem]"
    >
        <path d="M18 6 6 18M6 6l12 12" />
    </svg>
);

function ModalBackButton({ ui, className, tagClass, ariaLabel, onClick }) {
    if (!shouldShowMobileUI()) return null;
    const label = ariaLabel || ui?.navBack || ui?.close || 'Back';
    return (
        <button
            type="button"
            className={`${tagClass} ${className}`.trim()}
            aria-label={label}
            onClick={onClick}
        >
            ←
        </button>
    );
}

function ModalCloseButton({ ui, className, showOnMobile, onClick }) {
    if (!showOnMobile && shouldShowMobileUI()) return null;
    const label = ui?.close || 'Close';
    return (
        <button
            type="button"
            className={`arborito-modal-window-x ${className}`.trim()}
            aria-label={label}
            onClick={onClick}
        >
            {MODAL_WIN_X_SVG}
        </button>
    );
}

/**
 * Canonical modal hero row (back, title, close) — React port of `modalHeroHtml`.
 */
export function ModalHero({
    ui,
    title,
    subtitle,
    leadingIcon,
    trailingHtml,
    tone,
    mobile: mobileProp,
    align = 'center',
    titleClass: titleClassProp,
    subtitleClass: subtitleClassProp,
    titleTruncate,
    titleId,
    tagClass = 'btn-close',
    backTagClass,
    closeTagClass,
    backClass,
    showBack,
    showClose,
    closeShowOnMobile,
    trailingSpacer,
    extraWrapClass = '',
    extraWrapClassMobile = '',
    extraWrapClassDesktop = '',
    wrapperId,
    onBack,
    onClose,
}) {
    const mobile = mobileProp == null ? shouldShowMobileUI() : !!mobileProp;
    const alignCls = align === 'start' ? 'items-start' : 'items-center';
    const danger = tone === 'danger';
    const resolvedTone = tone != null ? tone : mobile ? 'plain' : 'hub';
    const hub = !danger && resolvedTone === 'hub';

    const baseWrap = hub
        ? 'arborito-dock-hub-head arborito-dock-modal-hero shrink-0'
        : mobile
          ? 'arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0'
          : 'arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2';

    const toneWrap = danger ? 'bg-red-50 dark:bg-red-900/10' : '';
    const extraWrap = [
        toneWrap,
        extraWrapClass,
        mobile ? extraWrapClassMobile : extraWrapClassDesktop,
    ]
        .filter(Boolean)
        .join(' ');

    const wrapCls = [baseWrap, `flex ${alignCls} gap-2`, extraWrap].filter(Boolean).join(' ');

    const backTag = backTagClass || tagClass;
    const closeTag = closeTagClass || tagClass;
    const backAlignTweak = align === 'start' ? ' mt-0.5' : '';
    const backDangerExtra = danger
        ? ' w-10 h-10 flex items-center justify-center rounded-xl border border-red-200 dark:border-red-800/50 bg-white/80 dark:bg-slate-900/80 text-red-800 dark:text-red-200'
        : '';
    const backClasses = backClass || `arborito-mmenu-back shrink-0${backAlignTweak}${backDangerExtra}`;

    const titleClass =
        titleClassProp ||
        (danger
            ? 'font-black text-xl text-red-800 dark:text-red-300 m-0'
            : hub
              ? 'arborito-dock-hub-head__title'
              : 'arborito-mmenu-subtitle m-0');
    const titleTruncCls = titleTruncate ? ' truncate' : '';

    const closeHandler = onClose || onBack;
    const showCloseBtn = showClose !== false;
    const closeHtml =
        showCloseBtn && closeHandler ? (
            <ModalCloseButton
                ui={ui}
                className={`${closeTag} shrink-0`.trim()}
                showOnMobile={closeShowOnMobile}
                onClick={closeHandler}
            />
        ) : null;

    const viewportMobile = shouldShowMobileUI();
    const wantSpacer = trailingSpacer !== false;
    const spacer =
        wantSpacer && viewportMobile && !closeHtml ? (
            <span className="w-10 shrink-0" aria-hidden="true" />
        ) : null;

    let leading = leadingIcon || null;
    if (hub && leading && typeof leading === 'string') {
        leading = (
            <span className="arborito-dock-hub-head__icon" aria-hidden="true">
                {leading}
            </span>
        );
    } else if (hub && leading) {
        leading = <span className="arborito-dock-hub-head__icon">{leading}</span>;
    }

    let titleBlock;
    if (subtitle) {
        const subCls = subtitleClassProp || 'arborito-dock-hub-head__subtitle';
        titleBlock = (
            <div className={hub ? 'arborito-dock-hub-head__body' : 'min-w-0 flex-1'}>
                <h2 id={titleId || undefined} className={`${titleClass}${titleTruncCls}`}>
                    {title}
                </h2>
                <p className={subCls}>{subtitle}</p>
            </div>
        );
    } else if (hub) {
        titleBlock = (
            <div className="arborito-dock-hub-head__body">
                <h2 id={titleId || undefined} className={`${titleClass}${titleTruncCls}`}>
                    {title}
                </h2>
            </div>
        );
    } else {
        titleBlock = (
            <h2 id={titleId || undefined} className={`${titleClass} flex-1 min-w-0${titleTruncCls}`}>
                {title}
            </h2>
        );
    }

    return (
        <div id={wrapperId || undefined} className={wrapCls}>
            {showBack !== false && (onBack || onClose) ? (
                <ModalBackButton
                    ui={ui}
                    className={backClasses}
                    tagClass={backTag}
                    onClick={onBack || onClose}
                />
            ) : null}
            {leading}
            {titleBlock}
            {trailingHtml}
            {closeHtml}
            {spacer}
        </div>
    );
}

/** Universal green headbar for dock hub modals. */
export function ModalHubHero(props) {
    const mob = props.mobile == null ? shouldShowMobileUI() : !!props.mobile;
    const { closeShowOnMobile: _drop, tone: toneOpt, ...rest } = props;
    return (
        <ModalHero
            tone={toneOpt != null ? toneOpt : 'hub'}
            mobile={mob}
            trailingSpacer={mob}
            {...rest}
        />
    );
}
