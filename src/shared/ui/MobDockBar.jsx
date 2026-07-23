/**
 * Bottom dock shell: wrap → inner → nav.arborito-mob-dock
 * Put MobDockTab buttons (or nav groups) inside.
 */
export function MobDockBar({ ariaLabel, floating = false, role = 'navigation', children }) {
    return (
        <div className="arborito-mob-dock-wrap" role="presentation">
            <div className="arborito-app-nav-inner">
                <nav
                    className={`arborito-mob-dock${floating ? ' arborito-mob-dock--floating' : ''}`}
                    role={role}
                    aria-label={ariaLabel}
                >
                    {children}
                </nav>
            </div>
        </div>
    );
}
