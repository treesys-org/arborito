import { useArcade } from '../hooks/useArcade.js';
import { LoadingBrand } from '../../../shared/ui/Loading.jsx';
import { ArcadeCard } from './ArcadeCard.jsx';
import { sortArcadeGamesForDiscovery } from '../api/arcade-game-discovery.js';
import { readArcadeGameLiked } from '../api/arcade-local-storage.js';

export function ArcadeGrid({
    ui,
    isLoading,
    discoveredGames,
    catalogError,
    onRetryCatalog,
    gameMetrics,
    wateringTargetId,
    offlineCacheReady,
    offlineDownloading,
    onCancelWatering,
    onPrepare,
    onToggleOffline,
    onRemoveGame,
    onAction,
}) {
    const { userStore, arcadeActions } = useArcade();
    const { findNode, getNetworkUserPair } = arcadeActions;

    if (isLoading) {
        return (
            <div
                className="arborito-loading-panel arborito-loading-panel--sky"
                role="status"
                aria-live="polite"
                aria-busy="true"
            >
                <LoadingBrand
                    label={ui.loading}
                    size="lg"
                    tone="sage"
                    extraClass="arborito-loading-brand--panel"
                />
            </div>
        );
    }

    const manualGames = (userStore.state.installedGames || []).map((g) => ({
        ...g,
        repoName: ui.arcadeManualInstall,
        isManual: true,
        path: g.url,
    }));
    const allGames = sortArcadeGamesForDiscovery([...discoveredGames, ...manualGames], gameMetrics);
    const wateringTarget = wateringTargetId ? findNode(wateringTargetId) : null;
    const targetName = wateringTarget ? wateringTarget.name : ui.arcadeUnknownLesson;

    return (
        <div className="relative flex flex-col flex-1 min-h-0">
            {wateringTargetId ? (
                <div className="arborito-cta-blue p-4 rounded-xl shadow-lg mb-4 flex items-center justify-center md:justify-between animate-in slide-in-from-top-2 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-xl">
                            💧
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold opacity-80">{ui.arcadeWateringMission}</p>
                            <p className="font-bold text-sm">
                                {ui.arcadeReviewTarget}{' '}
                                <span className="underline">{targetName}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="bg-white text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors"
                        onClick={onCancelWatering}
                    >
                        {ui.cancel}
                    </button>
                </div>
            ) : null}

            {allGames.length === 0 ? (
                <div className="arborito-empty p-8 flex flex-col items-center gap-3 text-center">
                    <p>{catalogError ? ui.arcadeCatalogLoadFailed || ui.noResults : ui.noResults}</p>
                    {catalogError && typeof onRetryCatalog === 'function' ? (
                        <button
                            type="button"
                            className="arborito-cta-emerald px-4 py-2 rounded-lg text-sm font-bold"
                            onClick={onRetryCatalog}
                        >
                            {ui.arcadeCatalogRetry || ui.retry || 'Retry'}
                        </button>
                    ) : null}
                </div>
            ) : (
                allGames.map((g, idx) => {
                    const gId = String(g.id != null ? g.id : '');
                    const metrics = gameMetrics[gId] || {};
                    return (
                        <ArcadeCard
                            key={gId || idx}
                            game={g}
                            index={idx}
                            ui={ui}
                            wateringTargetId={wateringTargetId}
                            offlineOn={userStore.isGameOffline(gId)}
                            cacheReady={!!offlineCacheReady[gId]}
                            downloading={!!offlineDownloading[gId]}
                            liked={readArcadeGameLiked(getNetworkUserPair, gId)}
                            votes={metrics.votes ?? 0}
                            onPrepare={onPrepare}
                            onToggleOffline={onToggleOffline}
                            onRemove={onRemoveGame}
                            onAction={onAction}
                        />
                    );
                })
            )}

            <div className="mt-6 pt-4 arborito-section-divider">
                <button
                    type="button"
                    className="arborito-btn-ghost w-full py-3 rounded-xl font-bold text-sm"
                    onClick={() => onAction('open-add-game-sheet')}
                >
                    + {ui.arcadeAdd}
                </button>
            </div>
        </div>
    );
}
