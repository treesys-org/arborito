import { useArcade } from '../hooks/useArcade.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

export function ArcadeStorage({ ui, onDeleteSave, onDeleteAllSaves }) {
    const { storage } = useArcade();

    const arcade = storage?.getStats?.()?.arcade ?? {};
    const usagePercent = Number(arcade.percent) || 0;
    const maxBytes = Number(arcade.maxBytes) || 0;
    const usedFmt = arcade.usedFmt || '0.0 KB';
    const maxFmt = `${(maxBytes / 1024).toFixed(1)} KB`;
    const games = Array.isArray(arcade.games) ? arcade.games : [];

    return (
        <div className="arborito-arcade-storage flex flex-col gap-4">
            <div className="arborito-surface-card p-4 rounded-xl">
                <div className="flex justify-between items-center gap-3 mb-2">
                    <span className="text-xs font-bold arborito-text-strong uppercase">
                        {ui.arcadeStorageTotal}
                    </span>
                    <span className="text-xs font-mono arborito-text-muted shrink-0">
                        {usedFmt} / {maxFmt}
                    </span>
                </div>
                <div className="arborito-meter" role="progressbar" aria-valuenow={usagePercent} aria-valuemin={0} aria-valuemax={100}>
                    <div
                        className={`arborito-meter__fill ${
                            usagePercent > 90
                                ? 'arborito-meter__fill--red'
                                : usagePercent > 70
                                  ? 'arborito-meter__fill--orange'
                                  : 'arborito-meter__fill--purple'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, usagePercent))}%` }}
                    />
                </div>
                {usagePercent > 90 ? (
                    <p className="text-[10px] text-red-500 font-bold mt-2 text-center flex items-center justify-center gap-1">
                        <ChromeEmoji emoji="⚠️" size={12} />
                        <span>{ui.arcadeStorageFull}</span>
                    </p>
                ) : null}
            </div>

            <div className="flex justify-between items-center gap-2">
                <h3 className="arborito-eyebrow arborito-eyebrow--md m-0">{ui.arcadeSavedGames}</h3>
                {games.length > 0 ? (
                    <button
                        type="button"
                        className="arborito-btn-ghost text-[10px] text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-bold px-2 py-1 rounded border border-red-200 dark:border-red-800/70"
                        onClick={onDeleteAllSaves}
                    >
                        {ui.arcadeDeleteAll}
                    </button>
                ) : null}
            </div>

            <div className="space-y-2">
                {games.length === 0 ? (
                    <div className="arborito-empty p-8">{ui.arcadeNoSavedGameData}</div>
                ) : (
                    games.map((g) => (
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
                                className="arborito-btn-ghost px-3 py-1.5 text-xs font-bold rounded-lg shrink-0"
                                onClick={() => onDeleteSave(String(g.id))}
                            >
                                {ui.graphDelete}
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
