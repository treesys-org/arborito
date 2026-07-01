import { useArcade } from '../hooks/useArcade.js';
import { useState } from 'react';
import { LoadingBrand } from '../../../shared/ui/Loading.jsx';
import { ArcadeCard } from './ArcadeCard.jsx';

export function ArcadeGrid({
    ui,
    isLoading,
    discoveredGames,
    wateringTargetId,
    offlineCacheReady,
    offlineDownloading,
    onCancelWatering,
    onPrepare,
    onToggleOffline,
    onRemoveGame,
    onAddCustom,
}) {
    const { userStore, arcadeActions } = useArcade();
    const { findNode } = arcadeActions;

    const [customUrl, setCustomUrl] = useState('');

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
    const allGames = [...discoveredGames, ...manualGames];
    const wateringTarget = wateringTargetId ? findNode(wateringTargetId) : null;
    const targetName = wateringTarget ? wateringTarget.name : ui.arcadeUnknownLesson;

    const handleAddCustom = () => {
        const url = customUrl.trim();
        if (!url) return;
        onAddCustom(url);
        setCustomUrl('');
    };

    return (
        <>
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
                        className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                        onClick={onCancelWatering}
                    >
                        {ui.cancel}
                    </button>
                </div>
            ) : null}

            {allGames.length === 0 ? (
                <div className="arborito-empty p-8">{ui.noResults}</div>
            ) : (
                allGames.map((g, idx) => {
                    const gId = String(g.id != null ? g.id : '');
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
                            onPrepare={onPrepare}
                            onToggleOffline={onToggleOffline}
                            onRemove={onRemoveGame}
                        />
                    );
                })
            )}

            <div className="mt-6 pt-4 arborito-section-divider">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">
                    {ui.arcadeAdd}
                </label>
                <div className="flex gap-2">
                    <input
                        id="inp-custom-game"
                        type="text"
                        placeholder={ui.arcadePlaceholder || ''}
                        className="arborito-input flex-1"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddCustom();
                        }}
                    />
                    <button
                        type="button"
                        className="arborito-btn-ghost px-4 py-2 rounded-xl font-bold text-sm"
                        onClick={handleAddCustom}
                    >
                        +
                    </button>
                </div>
            </div>
        </>
    );
}
