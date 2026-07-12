import { useArcade } from '../hooks/useArcade.js';

export function ArcadeStorage({ ui, onDeleteSave, onDeleteAllSaves }) {
    const { storage } = useArcade();

    const stats = storage?.getStats?.() ?? { arcade: { percent: 0 } };
    const usagePercent = stats.arcade.percent;
    const maxFmt = `${(stats.arcade.maxBytes / 1024).toFixed(1)} KB`;

    return (
        <>
            <div className="arborito-surface-card p-4 mb-6 rounded-xl">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold arborito-text-strong uppercase">
                        {ui.arcadeStorageTotal}
                    </span>
                    <span className="text-xs font-mono arborito-text-muted">
                        {stats.arcade.usedFmt} / {maxFmt}
                    </span>
                </div>
                <div className="arborito-meter mb-1">
                    <div
                        className={`arborito-meter__fill ${
                            usagePercent > 90
                                ? 'arborito-meter__fill--red'
                                : usagePercent > 70
                                  ? 'arborito-meter__fill--orange'
                                  : 'arborito-meter__fill--purple'
                        }`}
                        style={{ width: `${usagePercent}%` }}
                    />
                </div>
                {usagePercent > 90 ? (
                    <p className="text-[10px] text-red-500 font-bold mt-1 text-center">
                        ⚠️ {ui.arcadeStorageFull}
                    </p>
                ) : null}
            </div>

            <div className="flex justify-between items-center mb-3">
                <h3 className="arborito-eyebrow arborito-eyebrow--md">{ui.arcadeSavedGames}</h3>
                {stats.arcade.games.length > 0 ? (
                    <button
                        type="button"
                        className="arborito-btn-ghost text-[10px] text-red-500 hover:text-red-700 font-bold px-2 py-1 rounded border border-red-200"
                        onClick={onDeleteAllSaves}
                    >
                        {ui.arcadeDeleteAll}
                    </button>
                ) : null}
            </div>

            <div className="space-y-2">
                {stats.arcade.games.length === 0 ? (
                    <div className="arborito-empty p-8">{ui.arcadeNoSavedGameData}</div>
                ) : (
                    stats.arcade.games.map((g) => (
                        <div
                            key={g.id}
                            className="arborito-surface-card flex items-center justify-between p-3 rounded-xl group transition-colors"
                        >
                            <div className="min-w-0 pr-4">
                                <h4 className="font-bold text-sm arborito-text-strong truncate">{g.id}</h4>
                                <p className="text-[10px] arborito-text-muted font-mono">
                                    {g.sizeFmt} • {ui.arcadeGameDataUpdated}{' '}
                                    {new Date(g.updated).toLocaleDateString()}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="arborito-btn-ghost px-3 py-1.5 text-xs font-bold rounded-lg"
                                onClick={() => onDeleteSave(String(g.id))}
                            >
                                {ui.graphDelete}
                            </button>
                        </div>
                    ))
                )}
            </div>
        </>
    );
}
