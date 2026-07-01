import { useArcade } from '../hooks/useArcade.js';
import { useEffect, useState } from 'react';
import { Callout } from '../../../shared/ui/Callout.jsx';
import {
    GardenVitalityBanner,
    GardenPlot,
    GardenShop,
    GardenRankingSection,
} from '../../garden-progress/components/GardenWidgets.jsx';

export function ArcadeGarden({ ui }) {
    const { userStore, arcadeActions, hasNetworkSocialConsent } = useArcade();
    const { getActivePublicTreeRef, loadTreeRanking, findNode } = arcadeActions;

    const [rankingData, setRankingData] = useState(null);
    const [rankingError, setRankingError] = useState(null);
    const [rankingLoading, setRankingLoading] = useState(false);

    const memoryData = userStore?.state?.memory || {};
    const now = Date.now();
    const dueIds = [];
    const healthyIds = [];

    for (const [id, item] of Object.entries(memoryData)) {
        if (now >= item.dueDate) dueIds.push(id);
        else healthyIds.push({ id, ...item });
    }
    healthyIds.sort((a, b) => a.dueDate - b.dueDate);

    const publicTree = !!getActivePublicTreeRef?.();
    const g = userStore?.state?.gamification ?? {};
    const consentOk = hasNetworkSocialConsent();
    const rankingOn = consentOk && !!g.rankingOptIn;

    useEffect(() => {
        if (!publicTree) return;
        let cancelled = false;
        setRankingLoading(true);
        setRankingError(null);
        void (async () => {
            try {
                const data = await loadTreeRanking();
                if (cancelled) return;
                if (!data) {
                    setRankingData(null);
                    setRankingError(ui.gardenRankingNeedTree || '');
                } else {
                    setRankingData(data);
                    setRankingError(null);
                }
            } catch {
                if (!cancelled) {
                    setRankingData(null);
                    setRankingError(ui.gardenRankingError || '');
                }
            } finally {
                if (!cancelled) setRankingLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [publicTree, ui]);

    return (
        <>
            <GardenVitalityBanner ui={ui} compact={false} g={g} />

            <section className="garden-care-panel mb-5" aria-labelledby="garden-care-heading">
                <div className="garden-care-panel__head">
                    <h4 id="garden-care-heading" className="garden-care-panel__title">
                        {ui.arcadeTabCare || 'Cuidados'}
                    </h4>
                    {dueIds.length > 0 ? (
                        <span className="garden-care-panel__badge">{dueIds.length}</span>
                    ) : null}
                </div>

                {dueIds.length === 0 && healthyIds.length === 0 ? (
                    <div className="arborito-empty arborito-empty--card mx-auto max-w-md p-10 mb-4">
                        <div className="arborito-empty__icon">🪴</div>
                        <p className="arborito-empty__title text-lg">
                            {ui.arcadeGardenEmptyTitle || 'Jardín vacío'}
                        </p>
                        <p className="arborito-empty__body max-w-xs">{ui.arcadeGardenEmptyDesc || ''}</p>
                    </div>
                ) : null}

                {dueIds.length > 0 ? (
                    <>
                        <Callout
                            tone="red"
                            icon="🍂"
                            extraClass="mb-3"
                            body={ui.arcadeWitheredMsg || ''}
                        />
                        <div className="space-y-2 mb-4">
                            {dueIds.map((id) => {
                                const node = findNode(id);
                                const mem = memoryData[id];
                                const daysOverdue = Math.ceil((now - mem.dueDate) / (1000 * 60 * 60 * 24));
                                const nameRaw = node
                                    ? node.name
                                    : (ui.arcadeMemoryUnknownModule || 'Lección {shortId}').replace(
                                          '{shortId}',
                                          `${id.substring(0, 8)}…`
                                      );
                                const icon = node ? node.icon || '📄' : '📄';
                                const daysText = (ui.arcadeWitheredDays || '{days} días').replace(
                                    '{days}',
                                    String(daysOverdue)
                                );

                                return (
                                    <div
                                        key={id}
                                        className="arborito-surface-card flex items-center justify-between gap-2 p-3 rounded-xl hover:border-red-400 transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="arborito-icon-tile w-10 h-10 text-xl">{icon}</div>
                                            <div className="min-w-0">
                                                <h4 className="font-bold text-sm arborito-text-strong truncate m-0">
                                                    {nameRaw}
                                                </h4>
                                                <p className="text-[10px] text-red-500 font-bold m-0 mt-0.5">
                                                    {daysText}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            data-action="water-node"
                                            data-id={id}
                                            className="arborito-cta-blue px-3 py-2 text-xs font-bold rounded-lg shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 shrink-0 js-arcade-water-node"
                                        >
                                            <span aria-hidden="true">💧</span> {ui.arcadeWaterBtn || 'Regar'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : healthyIds.length > 0 ? (
                    <Callout
                        tone="green"
                        icon="🌻"
                        layout="stack"
                        extraClass="mb-4"
                        title={ui.arcadeHealthyTitle || ''}
                        body={ui.arcadeHealthyMsg || ''}
                    />
                ) : null}

                {healthyIds.length > 0 ? (
                    <>
                        <h5 className="arborito-eyebrow arborito-eyebrow--sm mb-2">
                            {ui.arcadeThrivingTitle || ''} ({healthyIds.length})
                        </h5>
                        <div className="space-y-2">
                            {healthyIds.map((item) => {
                                const node = findNode(item.id);
                                const daysLeft = Math.ceil(
                                    (item.dueDate - now) / (1000 * 60 * 60 * 24)
                                );
                                const nameRaw = node
                                    ? node.name
                                    : (ui.arcadeMemoryUnknownModule || 'Lección {shortId}').replace(
                                          '{shortId}',
                                          `${item.id.substring(0, 8)}…`
                                      );
                                const icon = node ? node.icon || '📄' : '📄';
                                const rainText = (ui.arcadeNextRain || '{days} días').replace(
                                    '{days}',
                                    String(daysLeft)
                                );
                                let strength = ui.arcadeStageSprout || '';
                                if (item.interval > 30) strength = ui.arcadeStageTree || strength;
                                else if (item.interval > 14) strength = ui.arcadeStageBush || strength;
                                else if (item.interval > 7) strength = ui.arcadeStagePlant || strength;

                                return (
                                    <div
                                        key={item.id}
                                        className="arborito-surface-card flex items-center justify-between gap-2 p-3 rounded-xl"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-8 h-8 rounded-lg arborito-garden-thumb-icon flex items-center justify-center text-lg shrink-0">
                                                {icon}
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="font-bold text-sm arborito-text-strong truncate m-0">
                                                    {nameRaw}
                                                </h4>
                                                <p className="text-[10px] arborito-text-muted m-0 mt-0.5">
                                                    {rainText}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="arborito-pill arborito-pill--xs arborito-pill--slate shrink-0">
                                            {strength}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : null}
            </section>

            <details className="garden-howto mb-4">
                <summary className="garden-howto__head">
                    {ui.gardenHowtoTitle || '¿Cómo funciona el jardín?'}
                </summary>
                <ul className="garden-howto__list">
                    <li>{ui.gardenHowtoXp || 'Cada lección o repaso suma lúmenes (☀️).'}</li>
                    <li>
                        {ui.gardenHowtoSeeds ||
                            'Cada módulo que tocas se planta como una semilla en tu parcela.'}
                    </li>
                    <li>
                        {ui.gardenHowtoCare ||
                            'Si no repasas, la semilla se marchita 🍂. Repasar la sana de nuevo.'}
                    </li>
                    <li>
                        {ui.gardenHowtoShop ||
                            'Con lúmenes compras decoraciones (mariposas, setas, faroles) que aparecen detrás del árbol.'}
                    </li>
                </ul>
            </details>

            <div className="mb-4">
                <h4 className="arborito-eyebrow arborito-eyebrow--md mb-2">
                    {ui.gardenPlotTitle || ui.gardenTitle || 'Mi parcela'}
                </h4>
                <GardenPlot ui={ui} />
            </div>

            {publicTree ? (
                <GardenRankingSection
                    ui={ui}
                    consentOk={consentOk}
                    rankingOn={rankingOn}
                    loading={rankingLoading}
                    rows={rankingData?.rows}
                    weekKey={rankingData?.weekKey}
                    emptyMessage={rankingError}
                />
            ) : null}

            <GardenShop ui={ui} g={g} />
        </>
    );
}
