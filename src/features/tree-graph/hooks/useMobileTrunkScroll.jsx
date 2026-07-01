import { useLayoutEffect, useRef } from 'react';
import { useTreeGraphStore } from './useTreeGraph.js';
import {
    syncMobilePathScroll,
    resolveScrollHosts,
    clampMobileTrunkScrollForVisibleRoot,
} from '../api/logic/path-scroll.js';

/**
 * Apply trunk scroll policy after React commits tree layout.
 */
export function useMobileTrunkScroll({ model, scroll, hostRefs }) {
    const store = useTreeGraphStore();
    const scrollLockRef = useRef(false);

    useLayoutEffect(() => {
        if (!model?.pathNodes?.length || !scroll) return undefined;

        const hosts = resolveScrollHosts(hostRefs);
        const trunkContainer = hosts.trunkContainer;
        if (trunkContainer && scroll.preserveTrunkScroll != null && Number.isFinite(scroll.preserveTrunkScroll)) {
            trunkContainer.scrollTop = scroll.preserveTrunkScroll;
        }

        let raf1 = 0;
        let raf2 = 0;
        raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => {
                if (scroll.syncScroll) {
                    syncMobilePathScroll(hosts, scroll.pathNodes, scrollLockRef);
                } else {
                    clampMobileTrunkScrollForVisibleRoot(hosts, scrollLockRef);
                }
                if (store.value.constructionMode && typeof window !== 'undefined') {
                    window.dispatchEvent(
                        new CustomEvent('arborito-construction-map-changed', {
                            detail: {
                                path: [...(store.state.graphUi?.mobilePath || [])],
                            },
                        })
                    );
                }
            });
        });

        return () => {
            if (raf1) cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
        };
    }, [model, scroll, hostRefs]);
}
