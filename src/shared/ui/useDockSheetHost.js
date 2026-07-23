import { useEffect, useState } from 'react';

/** Portal target for dock-tab sheets, same host family as MobMoreSheet. */
export function useDockSheetHost(active, constructionMode) {
    const [host, setHost] = useState(null);

    useEffect(() => {
        if (!active || typeof document === 'undefined') {
            setHost(null);
            return undefined;
        }
        setHost(
            constructionMode
                ? document.querySelector('[data-construction-dock]')
                : document.querySelector('[data-arborito-panel="sidebar"]')
        );
        return undefined;
    }, [active, constructionMode]);

    return host;
}
