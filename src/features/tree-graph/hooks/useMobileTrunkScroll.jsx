import { useLayoutEffect, useRef } from 'react';
import { useTreeGraphStore } from './useTreeGraph.js';
import {
    syncMobilePathScroll,
    resolveScrollHosts,
    clampMobileTrunkScrollForVisibleRoot,
} from '../api/logic/path-scroll.js';
import { isTrunkUserGesturing, beginProgrammaticTrunkScroll, endProgrammaticTrunkScroll } from '../api/logic/trunk-scroll-gesture.js';

/**
 * True when the path content is taller than the trunk viewport (scroll should work).
 * Early paints can report equal heights before knots/children finish layout.
 */
function trunkHasScrollRoom(hosts) {
    const c = hosts?.trunkContainer;
    const sc = hosts?.scrollContent;
    if (!c || !sc) return false;
    return sc.scrollHeight > c.clientHeight + 1 || c.scrollHeight > c.clientHeight + 1;
}

/**
 * Apply trunk scroll policy after React commits tree layout.
 */
export function useMobileTrunkScroll({ model, scroll, hostRefs }) {
    const store = useTreeGraphStore();
    const scrollLockRef = useRef(false);

    useLayoutEffect(() => {
        if (!model?.pathNodes?.length || !scroll) return undefined;
        /* Never rewrite scrollTop under an active finger — feels like pan "doesn't work". */
        if (isTrunkUserGesturing()) return undefined;
        const lessonOpen =
            typeof document !== 'undefined' &&
            document.documentElement.classList.contains('arborito-lesson-open');
        /* Under the lesson overlay, skip layout clamps (they look like jumps on close).
         * Still allow syncScroll when the path actually changed while opening a lesson. */
        if (lessonOpen && !scroll.syncScroll) return undefined;

        let hosts = resolveScrollHosts(hostRefs);
        const trunkContainer = hosts.trunkContainer;
        if (
            trunkContainer &&
            scroll.preserveTrunkScroll != null &&
            Number.isFinite(scroll.preserveTrunkScroll) &&
            !isTrunkUserGesturing()
        ) {
            beginProgrammaticTrunkScroll();
            try {
                trunkContainer.scrollTop = scroll.preserveTrunkScroll;
            } finally {
                endProgrammaticTrunkScroll();
            }
        }

        let raf1 = 0;
        let raf2 = 0;
        let retryTimer = 0;
        let cancelled = false;

        const applyPolicy = () => {
            if (cancelled || isTrunkUserGesturing()) return;
            hosts = resolveScrollHosts(hostRefs);
            const stillLesson =
                typeof document !== 'undefined' &&
                document.documentElement.classList.contains('arborito-lesson-open');
            if (stillLesson && !scroll.syncScroll) return;
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
        };

        raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => {
                applyPolicy();
                /* Deep path / branch restore: first paint may still have equal heights.
                 * Re-sync once layout catches up so clamp/wake use real geometry. */
                if (scroll.syncScroll && !trunkHasScrollRoom(hosts) && !cancelled) {
                    retryTimer = setTimeout(() => {
                        if (cancelled || isTrunkUserGesturing()) return;
                        applyPolicy();
                    }, 120);
                }
            });
        });

        return () => {
            cancelled = true;
            if (raf1) cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, [model, scroll, hostRefs]);
}
