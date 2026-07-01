import { useGardenProgress } from '../hooks/useGardenProgress.js';
import { useEffect, useMemo } from 'react';
import {
    buildGardenLayerParticles,
    getGardenBackgroundState,
    syncGardenBackground,
} from '../api/garden-background.js';

function GardenLayer({ item, layer }) {
    if (!item) return null;
    const particles = buildGardenLayerParticles(item, layer);
    return (
        <>
            {particles.map((p) => (
                <span
                    key={p.key}
                    className={`arborito-garden-bg__particle arborito-garden-bg__particle--${p.anim} arborito-garden-bg__particle--${p.itemId}`}
                    style={{ '--gx': p.x, '--gy': p.y, '--gd': p.delay }}
                    aria-hidden="true"
                >
                    {p.icon}
                </span>
            ))}
        </>
    );
}

/** Equipped garden decor behind graph nodes (sky + ground layers). */
export function GardenBackground() {
    const { store } = useGardenProgress();
    const gardenState = useMemo(() => getGardenBackgroundState(store), [
        store?.state?.data?.id,
        store?.state?.constructionMode,
        store?.userStore?.state?.gamification,
    ]);
    const { visible, skyItem, groundItem } = gardenState;

    useEffect(() => {
        syncGardenBackground(store);
    }, [store, visible]);

    useEffect(() => {
        let lastSig = '';
        const onChange = () => {
            const { visible: v } = getGardenBackgroundState(store);
            const sig = `${v ? 1 : 0}|${store.state.constructionMode ? 1 : 0}|${store.state.data?.id ?? ''}`;
            if (sig === lastSig) return;
            lastSig = sig;
            syncGardenBackground(store);
        };
        store.addEventListener('state-change', onChange);
        return () => store.removeEventListener('state-change', onChange);
    }, [store]);

    if (!visible) return null;

    return (
        <div id="arborito-garden-bg" className="arborito-garden-bg" aria-hidden="true">
            <div className="arborito-garden-bg__sky">
                <GardenLayer item={skyItem} layer="sky" />
            </div>
            <div className="arborito-garden-bg__ground">
                <GardenLayer item={groundItem} layer="ground" />
            </div>
        </div>
    );
}
