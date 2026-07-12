import { useMemo } from 'react';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { useShellChrome } from '../../hooks/useShellChrome.js';

export function CreatorModerationBell({ className = '' }) {
    const { ui, creatorModerationUnreadCount, openCreatorModerationAlertsModal } = useShellChrome();
    const unread = Number(creatorModerationUnreadCount) || 0;
    const visible = unread > 0;
    const label = useMemo(() => {
        const tpl =
            ui.creatorModerationBellAria ||
            'Creator alerts ({n} unread), reports and legal notices on your published trees';
        return tpl.replace(/\{n\}/g, String(unread));
    }, [ui.creatorModerationBellAria, unread]);

    if (!visible) return null;

    return (
        <button
            type="button"
            className={`arborito-creator-moderation-bell arborito-chrome-tip ${className}`.trim()}
            data-arbor-tip={label}
            aria-label={label}
            onClick={(e) => {
                e.stopPropagation();
                openCreatorModerationAlertsModal?.();
            }}
        >
            <span className="arborito-creator-moderation-bell__ic" aria-hidden="true">
                <ChromeEmoji emoji="🔔" size={18} />
            </span>
            <span className="arborito-creator-moderation-bell__badge" aria-hidden="true">
                {unread > 9 ? '9+' : unread}
            </span>
        </button>
    );
}
