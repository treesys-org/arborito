import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { CommunityMenuList } from './CommunityMenuList.jsx';

function wireDesktopCommunityPopover(wrap) {
    if (!wrap || wrap.dataset.communityPopoverBound === '1') return;
    wrap.dataset.communityPopoverBound = '1';
    const root = document.documentElement;
    const open = () => root.classList.add('arborito-desktop-community-menu-open');
    const close = () => root.classList.remove('arborito-desktop-community-menu-open');
    wrap.addEventListener('mouseenter', open);
    wrap.addEventListener('mouseleave', (e) => {
        if (e.relatedTarget instanceof Node && wrap.contains(e.relatedTarget)) return;
        close();
    });
    wrap.addEventListener('focusin', open);
    wrap.addEventListener('focusout', (e) => {
        if (e.relatedTarget instanceof Node && wrap.contains(e.relatedTarget)) return;
        close();
    });
}

/** Desktop header, hover/click popover, left of theme toggle. */
export function CommunityChromeButton({ ui, className = '' }) {
    const label = ui.navCommunity || ui.aboutCommunityHeading || 'Community';

    return (
        <div
            className={`arborito-desktop-community-wrap arborito-desktop-hit ${className}`.trim()}
            aria-haspopup="menu"
            ref={(el) => {
                if (el) wireDesktopCommunityPopover(el);
            }}
        >
            <button
                type="button"
                className="arborito-desktop-action js-btn-community arborito-chrome-tip"
                data-arbor-tour="community"
                data-arbor-tip={label}
                aria-label={label}
            >
                <span className="arborito-desktop-menu-item__ic" aria-hidden="true">
                    <ChromeEmoji emoji="🤝" size={18} />
                </span>
            </button>
            <div
                className="arborito-desktop-profile-popover arborito-community-desktop-popover"
                role="menu"
                aria-label={label}
            >
                <CommunityMenuList ui={ui} />
            </div>
        </div>
    );
}
