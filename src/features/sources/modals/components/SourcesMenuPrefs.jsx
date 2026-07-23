/** Grouped prefs (switches) inside a sources row `⋯` menu — not orphan toggles. */
export function SourcesMenuPrefs({ title, children, tone = 'default' }) {
    if (!children) return null;
    const toneCls = tone === 'freeze' ? ' arborito-sources-menu-prefs--freeze' : '';
    return (
        <div className={`arborito-sources-menu-prefs${toneCls}`}>
            {title ? <p className="arborito-sources-menu-prefs__title">{title}</p> : null}
            <div className="arborito-sources-menu-prefs__body">{children}</div>
        </div>
    );
}
