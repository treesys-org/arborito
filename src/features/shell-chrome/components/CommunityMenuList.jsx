import { getPanelRef } from '../../../app/panel-refs.js';
import { openExternalUrl } from '../../../shared/lib/open-external-url.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { COMMUNITY_EXTERNAL_LINKS, HAS_ARBORITO_SUPPORT } from '../../../shared/lib/community-links.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { CommunityBrandIcon } from '../../../shared/ui/CommunityBrandIcon.jsx';
import { useShellChrome } from '../hooks/useShellChrome.js';

function CommunityMenuItem({ brand, icon, label, hint, href, disabled, external, onActivate }) {
    const className = `arborito-community-menu-item${disabled ? ' arborito-community-menu-item--disabled' : ''}`;

    const iconNode = (
        <span className="arborito-community-menu-item__ic" aria-hidden="true">
            {brand ? (
                <CommunityBrandIcon brand={brand} size={18} />
            ) : (
                <ChromeEmoji emoji={icon} size={18} />
            )}
        </span>
    );

    if (disabled || !href) {
        const activateDisabled = (e) => {
            e.preventDefault();
            e.stopPropagation();
            onActivate?.();
        };

        if (!disabled && onActivate) {
            return (
                <button type="button" className={className} role="menuitem" onClick={activateDisabled}>
                    {iconNode}
                    <span className="arborito-community-menu-item__body">
                        <span className="arborito-community-menu-item__label">{label}</span>
                        {hint ? <span className="arborito-community-menu-item__hint">{hint}</span> : null}
                    </span>
                </button>
            );
        }

        return (
            <div className={className} role="menuitem" aria-disabled="true">
                {iconNode}
                <span className="arborito-community-menu-item__body">
                    <span className="arborito-community-menu-item__label">{label}</span>
                    {hint ? <span className="arborito-community-menu-item__hint">{hint}</span> : null}
                </span>
            </div>
        );
    }

    const activate = (e) => {
        e.preventDefault();
        e.stopPropagation();
        void openExternalUrl(href).finally(() => onActivate?.());
    };

    return (
        <button
            type="button"
            className={className}
            role="menuitem"
            data-brand={brand || undefined}
            onPointerDown={(e) => {
                if (e.button === 0) activate(e);
            }}
        >
            {iconNode}
            <span className="arborito-community-menu-item__body">
                <span className="arborito-community-menu-item__label">{label}</span>
                {hint ? <span className="arborito-community-menu-item__hint">{hint}</span> : null}
            </span>
            {external ? (
                <span className="arborito-community-menu-item__ext" aria-hidden="true">
                    ↗
                </span>
            ) : null}
        </button>
    );
}

/**
 * @param {{ ui: Record<string, string>, onItemActivate?: () => void, className?: string }} props
 */
export function CommunityMenuList({ ui, onItemActivate, className = '' }) {
    const { setModal, modal } = useShellChrome();

    const openSupport = () => {
        const sb = getPanelRef('sidebar');
        if (shouldShowMobileUI() && sb?.isMobileMenuOpen && typeof sb.pushMmenuPane === 'function') {
            sb.pushMmenuPane('arborito-support');
            return;
        }
        const fromAbout = modal?.type === 'about';
        setModal({
            type: 'arborito-support',
            ...(fromAbout ? { fromAbout: true } : {}),
        });
    };

    return (
        <div className={`arborito-community-menu-list${className ? ` ${className}` : ''}`} role="presentation">
            {COMMUNITY_EXTERNAL_LINKS.map((item) => (
                <CommunityMenuItem
                    key={item.id}
                    brand={item.brand}
                    icon={item.icon}
                    label={ui[item.labelKey] || item.labelKey}
                    href={item.url}
                    external
                    onActivate={onItemActivate}
                />
            ))}
            {HAS_ARBORITO_SUPPORT ? (
                <CommunityMenuItem
                    icon="💝"
                    label={ui.arboritoSupportCta || 'Support Arborito'}
                    hint={ui.arboritoSupportHint || ''}
                    onActivate={openSupport}
                />
            ) : null}
        </div>
    );
}
