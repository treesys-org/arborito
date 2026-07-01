import { useSources } from '../../hooks/useSources.js';
import { formatNostrTreeUrl, parseNostrTreeUrl } from '../../../nostr/api/nostr-refs.js';
import { findCommunitySourceByUrl } from '../../api/modals/logic/sources-helpers.js';
import { SourcesPill } from './SourcesPill.jsx';
import { LanguagePills } from './LanguagePills.jsx';
import { SourcesFreezeToggle } from './SourcesFreezeToggle.jsx';
import { SourcesMoreButton } from './SourcesRowChrome.jsx';

export function SourcesSavedRow({
    source,
    ui,
    isActive,
    pinned = false,
    actionsOpen,
    freezeBusy,
    onAction,
    onToggleRowActions,
    onToggleFreeze,
}) {
    const { communitySources } = useSources();
    const pinCls = pinned ? ' arborito-sources-row--pinned-active' : '';
    const key = `saved:${String(source?.id || '')}`;
    const open = actionsOpen?.has(key);
    let treeRef = null;
    try {
        treeRef = parseNostrTreeUrl(String(source?.url || '').trim());
    } catch {
        treeRef = null;
    }
    const titleRaw = String(source?.name || '').trim();
    const title =
        titleRaw ||
        (source?.origin === 'nostr'
            ? ui.graphUntitledDefault || 'Untitled'
            : (() => {
                  try {
                      return new URL(String(source.url).trim(), window.location.href).hostname;
                  } catch {
                      return ui.graphUntitledDefault || 'Untitled';
                  }
              })());
    const savedLangs =
        Array.isArray(source?.languages) && source.languages.length
            ? source.languages
            : [];
    const borderCls =
        isActive && !pinned
            ? 'border-emerald-500/70 dark:border-sky-400/40 dark:ring-1 dark:ring-sky-400/15'
            : 'border-slate-200 dark:border-slate-800';
    const originIcon = source?.origin === 'nostr' ? '🕸️' : '🌐';

    if (!treeRef) {
        return (
            <div
                className={`p-4 bg-white dark:bg-slate-900 border ${borderCls}${pinCls} rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors`}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap gap-2 items-center">
                            <p className="arborito-sources-row-title leading-snug line-clamp-2">
                                {originIcon} {title}
                            </p>
                            {!pinned ? (
                                <SourcesPill className="arborito-pill--purple arborito-pill--bordered">
                                    {ui.sourcesPillSaved || 'Guardado'}
                                </SourcesPill>
                            ) : null}
                            {isActive && !pinned ? (
                                <SourcesPill className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700">
                                    {ui.sourceActive || 'Active'}
                                </SourcesPill>
                            ) : null}
                            <LanguagePills langCodes={savedLangs} />
                        </div>
                    </div>
                    <div className="flex gap-2 shrink-0 items-center">
                        <SourcesFreezeToggle
                            sourceId={source?.id}
                            busy={!!freezeBusy?.[source?.id]}
                            ui={ui}
                            onToggle={onToggleFreeze}
                        />
                        {isActive && !pinned ? (
                            <SourcesPill className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700">
                                {ui.sourceActive || 'Active'}
                            </SourcesPill>
                        ) : (
                            <button
                                type="button"
                                className="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-sm ring-1 ring-amber-600/40 dark:ring-amber-400/50"
                                onClick={() => onAction?.('load-source', { id: source?.id })}
                            >
                                {ui.sourceLoad}
                            </button>
                        )}
                        <SourcesMoreButton
                            ui={ui}
                            rowKey={key}
                            open={open}
                            onToggle={onToggleRowActions}
                        />
                    </div>
                </div>
                {open ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                            onClick={() => onAction?.('remove-source', { id: source?.id })}
                        >
                            {ui.sourcesGlobalRemove || ui.sourceRemove || 'Uninstall'}
                        </button>
                    </div>
                ) : null}
            </div>
        );
    }

    const communityEntry = (() => {
        try {
            const url = formatNostrTreeUrl(treeRef.pub, treeRef.universeId);
            return findCommunitySourceByUrl(communitySources, url);
        } catch {
            return null;
        }
    })();

    return (
        <div
            className={`p-4 bg-white dark:bg-slate-900 border ${borderCls}${pinCls} rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap gap-2 items-center">
                        <p className="arborito-sources-row-title leading-snug line-clamp-2">
                            {originIcon} {title}
                        </p>
                        <SourcesPill className="arborito-pill--purple arborito-pill--bordered">
                            {ui.sourcesPillSaved || 'Guardado'}
                        </SourcesPill>
                        {isActive && !pinned ? (
                            <SourcesPill className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700">
                                {ui.sourceActive || 'Active'}
                            </SourcesPill>
                        ) : null}
                        <LanguagePills langCodes={savedLangs} />
                    </div>
                </div>
                <div className="flex gap-2 shrink-0 items-center">
                    <SourcesFreezeToggle
                        sourceId={communityEntry?.id || source?.id}
                        busy={!!freezeBusy?.[communityEntry?.id || source?.id]}
                        ui={ui}
                        onToggle={onToggleFreeze}
                    />
                    {isActive && !pinned ? null : (
                        <button
                            type="button"
                            className="min-h-10 px-3 py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-sm"
                            onClick={() =>
                                onAction?.('load-source', { id: source?.id })
                            }
                        >
                            {ui.sourceLoad}
                        </button>
                    )}
                    <SourcesMoreButton ui={ui} rowKey={key} open={open} onToggle={onToggleRowActions} />
                </div>
            </div>
            {open ? (
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                        onClick={() => onAction?.('remove-source', { id: source?.id })}
                    >
                        {ui.sourcesGlobalRemove || ui.sourceRemove || 'Uninstall'}
                    </button>
                </div>
            ) : null}
        </div>
    );
}
