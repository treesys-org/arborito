import { shouldShowMobileUI } from '../../shared/ui/breakpoints.js';
import {
    DOCK_SHEET_BODY_WRAP,
    DOCK_HUB_BODY_SCROLL,
} from '../../shared/ui/dock-sheet-chrome.js';
import { ModalHtml } from './ModalShell.jsx';

function renderHero(hero) {
    if (hero == null || hero === false) return null;
    if (typeof hero === 'string') {
        const html = hero.trim();
        return html ? <ModalHtml html={html} /> : null;
    }
    return hero;
}

/**
 * Shared inner shell for dock hub modals — React port of `dockHubShellHtml`.
 */
export function DockHubShell({ mobile: mobileProp, hero, toolbar, children, rootClass = '', skipBodyWrap }) {
    const mobile = mobileProp == null ? shouldShowMobileUI() : !!mobileProp;
    const extra = rootClass ? ` ${rootClass}` : '';
    const heroNode = renderHero(hero);

    if (mobile) {
        const bodyWrap = skipBodyWrap ? (
            children
        ) : (
            <div className={`${DOCK_SHEET_BODY_WRAP} overflow-y-auto custom-scrollbar`}>{children}</div>
        );
        return (
            <div className={`arborito-dock-hub-shell flex flex-col flex-1 min-h-0 h-full overflow-hidden${extra}`}>
                {heroNode}
                {toolbar}
                {bodyWrap}
            </div>
        );
    }

    const desktopBase =
        'arborito-dock-hub-body arborito-float-modal-card__inner flex flex-col min-h-0 flex-1 relative';
    const desktopRoot = rootClass ? `${desktopBase} ${rootClass}` : desktopBase;

    return (
        <div className={desktopRoot}>
            {heroNode}
            {toolbar}
            <div className={DOCK_HUB_BODY_SCROLL}>{children}</div>
        </div>
    );
}
