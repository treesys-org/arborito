/**
 * React tab bar, port of `tabBarHtml`.
 * @param {{ tabs: Array<{ id: string, label: string, ariaControls?: string, tourTarget?: string }>, activeTab: string, onTabChange: (id: string) => void, className?: string, ariaLabel?: string }} props
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
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={tab.ariaControls}
                        data-tab={tab.id}
                        data-arbor-tour={tab.tourTarget}
                        className={`arborito-tab tab-btn${isActive ? ' arborito-tab--active' : ''}`}
                        onClick={() => onTabChange(tab.id)}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}
