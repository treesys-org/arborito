import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { isElectronDesktop } from '../../learning/api/electron-bridge.js';
import { SourcesVoteGroup } from '../../sources/modals/components/SourcesRowChrome.jsx';
import { localizedArcadeGameName, localizedArcadeGameDescription } from '../api/arcade-game-display.js';

function EmojiGlyph({ emoji, size = 28, className = 'arborito-emoji-glyph' }) {
    return <ChromeEmoji emoji={emoji || '🕹️'} size={size} className={className} />;
}

export function ArcadeCard({
    game,
    index,
    ui,
    wateringTargetId,
    offlineOn,
    cacheReady,
    downloading,
    onPrepare,
    onToggleOffline,
    onRemove,
    liked,
    votes,
    onAction,
}) {
    const gId = String(game.id != null ? game.id : '');
    const offlineTitle = downloading
        ? ui.arcadeOfflineDownloadingHint || 'Saving offline copy…'
        : offlineOn
          ? ui.arcadeOfflineOnHint || 'Offline: saved copy, no updates'
          : cacheReady
            ? ui.arcadeOfflineOffHint || 'Live: downloads latest when you play'
            : ui.arcadeOfflineTapHint || 'Save a copy for offline play';
    const offlineSwitchLabel = downloading
        ? ui.arcadeOfflineDownloading || '…'
        : ui.arcadeOfflineToggle || 'Offline';
    const displayName = localizedArcadeGameName(ui, game);
    const displayDescription = localizedArcadeGameDescription(ui, game);

    return (
        <div
            className={`arborito-surface-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-2xl transition-shadow group mb-3${wateringTargetId ? ' arborito-surface-card--emphasis' : ''}`}
        >
            <div className="flex items-start gap-4 min-w-0">
                <div className="arborito-icon-tile w-12 h-12 text-2xl">
                    <EmojiGlyph emoji={game.icon || '🕹️'} />
                </div>
                <div className="min-w-0 flex-1">
                    <h4 className="font-bold arborito-text-strong flex flex-wrap items-center gap-2 leading-tight">
                        <span className="break-words">{displayName}</span>
                        {game.isOfficial ? (
                            <span className="arborito-pill arborito-pill--xs arborito-pill--blue shrink-0">
                                {ui.arcadeOfficialBadge}
                            </span>
                        ) : null}
                    </h4>
                    <p className="text-xs arborito-text-muted mt-0.5 break-words">
                        {displayDescription}
                    </p>
                    <p className="arborito-eyebrow arborito-eyebrow--sm mt-0.5">{game.repoName || ''}</p>
                </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                <SourcesVoteGroup
                    ui={ui}
                    liked={liked}
                    votes={votes}
                    ownerPub={gId}
                    universeId="game"
                    onVote={() => onAction?.('game-vote', { gameId: gId, vote: 'up' })}
                />
                {isElectronDesktop() ? (
                    <label className="flex flex-col items-center gap-1 shrink-0 cursor-pointer">
                        <span
                            className={`text-[9px] font-bold text-sky-500 uppercase tracking-wide leading-none${downloading ? ' animate-pulse' : ''}`}
                        >
                            {offlineSwitchLabel}
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={offlineOn ? 'true' : 'false'}
                            aria-label={offlineTitle}
                            title={offlineTitle}
                            disabled={downloading}
                            aria-busy={downloading || undefined}
                            className={`arborito-switch arborito-switch--freeze${downloading ? ' opacity-50 pointer-events-none' : ''}`}
                            onClick={() => onToggleOffline(gId)}
                        />
                    </label>
                ) : null}
                <button
                    type="button"
                    className={`px-4 py-2 ${wateringTargetId ? 'arborito-cta-blue' : 'arborito-cta-emerald hover:scale-105'} text-xs font-bold rounded-xl shadow-lg transition-all active:scale-95`}
                    onClick={() => onPrepare(game, index, !!game.isManual)}
                >
                    {wateringTargetId ? ui.arcadeWaterHere : ui.arcadePlay}
                </button>
                {game.isManual ? (
                    <button
                        type="button"
                        className="px-2 py-2 arborito-text-muted hover:text-red-500 transition-colors text-base"
                        aria-label={ui.arcadeRemoveGameAria || ''}
                        onClick={() => onRemove(gId)}
                    >
                        🗑️
                    </button>
                ) : null}
            </div>
        </div>
    );
}
