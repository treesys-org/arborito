import { ChromeEmoji } from './ChromeEmoji.jsx';

/**
 * React tab bar, port of `tabBarHtml`.
 * Optional `emoji` + `caption` keep dual-meaning labels readable on mobile
 * without stuffing parentheses into the primary label.
 * @param {{
 *   tabs: Array<{ id: string, label: string, caption?: string, emoji?: string, ariaControls?: string, tourTarget?: string }>,
 *   activeTab: string,
 *   onTabChange: (id: string) => void,
 *   className?: string,
 *   ariaLabel?: string
 * }} props
 */
export function TabBar({ tabs, activeTab, onTabChange, className = '', ariaLabel }) {
    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            className={`arborito-tab-bar ${className}`.trim()}
        >
            {tabs.map((tab) => {
                const isActive = tab.id === activeTab;
                const caption = String(tab.caption || '').trim();
                const emoji = String(tab.emoji || '').trim();
                const stacked = !!(caption || emoji);
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={tab.ariaControls}
                        data-tab={tab.id}
                        data-arbor-tour={tab.tourTarget}
                        className={`arborito-tab tab-btn${isActive ? ' arborito-tab--active' : ''}${stacked ? ' arborito-tab--stacked' : ''}`}
                        onClick={() => onTabChange(tab.id)}
                    >
                        <span className="arborito-tab__primary">
                            {emoji ? (
                                <ChromeEmoji emoji={emoji} size={14} className="arborito-tab__emoji" />
                            ) : null}
                            <span className="arborito-tab__label">{tab.label}</span>
                        </span>
                        {caption ? <span className="arborito-tab__caption">{caption}</span> : null}
                    </button>
                );
            })}
        </div>
    );
}
