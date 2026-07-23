import { useSources, useSourcesStore } from '../../hooks/useSources.js';
import { formatNostrTreeUrl, parseNostrTreeUrl } from '../../../nostr/api/nostr-refs.js';
import { findCommunitySourceByUrl } from '../../api/modals/logic/sources-helpers.js';
import { pickTitleForLang } from '../../../../shared/lib/catalog-titles.js';
import { SourcesPill } from './SourcesPill.jsx';
import { LanguagePills } from './LanguagePills.jsx';
import { SourcesMoreButton } from './SourcesRowChrome.jsx';
import { SourcesShareCodeField } from './SourcesShareCodeField.jsx';
import { SwitchRow } from '../../../../shared/ui/SwitchRow.jsx';
import { isElectronDesktop } from '../../../learning/api/electron-bridge.js';
import { SourcesMenuPrefs } from './SourcesMenuPrefs.jsx';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { listingKind } from '../../api/sources-kind-ui.js';
import { resolveOnlineListingIcon } from '../../api/branch-catalog-icon.js';

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
    const { communitySources, userStore, lang } = useSources();
    const store = useSourcesStore();
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
        pickTitleForLang(source?.titles, lang, '') ||
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
        Array.isArray(source?.languages) && source.languages.length ? source.languages : [];
    const author = String(source?.listAuthorName || source?.authorName || '').trim();
    const desc =
        pickTitleForLang(source?.descriptions, lang, '') ||
        String(source?.listDescription || source?.description || '').trim();
    const shareCode = String(source?.shareCode || '').trim();
    const rowKind = listingKind(source?.contentKind, treeRef?.universeId);
    const borderCls =
        isActive && !pinned
            ? 'border-emerald-500/70 dark:border-sky-400/40 dark:ring-1 dark:ring-sky-400/15'
            : 'border-slate-200 dark:border-slate-800';
    const activeMatches =
        isActive ||
        (treeRef &&
            (() => {
                const activeRef = parseNostrTreeUrl(String(store.state?.activeSource?.url || ''));
                return (
                    !!activeRef &&
                    String(activeRef.pub) === String(treeRef.pub) &&
                    String(activeRef.universeId) === String(treeRef.universeId)
                );
            })());
    const rowEmoji = resolveOnlineListingIcon({
        icon: source?.icon,
        contentKind: source?.contentKind,
        universeId: treeRef?.universeId,
        treeJson: activeMatches ? store.state?.rawGraphData : null,
    });
    const showLoad = !(isActive || pinned);

    const communityEntry = (() => {
        if (!treeRef) return null;
        try {
            const url = formatNostrTreeUrl(treeRef.pub, treeRef.universeId);
            return findCommunitySourceByUrl(communitySources, url);
        } catch {
            return null;
        }
    })();
    const freezeId = communityEntry?.id || source?.id;
    const freezeBusyOn = !!(freezeBusy && freezeId && freezeBusy[freezeId]);
    const frozen = freezeId ? !!userStore?.isTreeFrozen?.(freezeId) : false;
    const showFreeze = isElectronDesktop() && !!freezeId;

    const shareOpts =
        treeRef && shareCode
            ? {
                  name: title,
                  url: formatNostrTreeUrl(treeRef.pub, treeRef.universeId),
                  shareCode,
                  ownerPub: treeRef.pub,
                  universeId: treeRef.universeId,
              }
            : shareCode
              ? { name: title, url: String(source?.url || ''), shareCode }
              : null;

    const freezeSwitch = showFreeze ? (
        <SwitchRow
            id={`saved-freeze-${freezeId}`}
            variant="freeze"
            label={
                freezeBusyOn
                    ? ui.freezeDownloading || ui.arcadeOfflineDownloading || '…'
                    : ui.freezeToggle || ui.arcadeOfflineToggle || 'Offline'
            }
            hint={
                freezeBusyOn
                    ? ui.freezeDownloadingHint ||
                      ui.arcadeOfflineDownloadingHint ||
                      'Saving offline copy…'
                    : frozen
                      ? ui.freezeOnHint ||
                        ui.arcadeOfflineOnHint ||
                        'Copy saved on device; no automatic updates'
                      : ui.freezeTapHint ||
                        ui.arcadeOfflineTapHint ||
                        'Save a copy for offline use on this device'
            }
            checked={frozen}
            disabled={freezeBusyOn}
            onChange={() => onToggleFreeze?.(freezeId)}
            onAria={
                ui.freezeTapHint || ui.arcadeOfflineTapHint || 'Save offline copy'
            }
            offAria={
                ui.freezeOnHint || ui.arcadeOfflineOnHint || 'Turn off offline copy'
            }
        />
    ) : null;

    return (
        <div
            className={`p-4 bg-white dark:bg-slate-900 border ${borderCls}${pinCls} rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors`}
        >
            <div className="arborito-sources-row-layout flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2 items-center">
                        <p className="arborito-sources-row-title leading-snug line-clamp-2 flex items-center gap-1.5 min-w-0">
                            <ChromeEmoji
                                emoji={rowEmoji}
                                size={18}
                                className="arborito-emoji-glyph shrink-0"
                            />
                            <span className="min-w-0">{title}</span>
                        </p>
                        {!pinned ? (
                            <SourcesPill className="arborito-pill--purple arborito-pill--bordered">
                                {ui.sourcesPillSaved || 'Guardado'}
                            </SourcesPill>
                        ) : null}
                        {rowKind === 'composed-tree' ? (
                            <SourcesPill className="arborito-pill--violet arborito-pill--bordered">
                                {ui.sourcesPillComposedTree || 'Tree'}
                            </SourcesPill>
                        ) : (
                            <SourcesPill className="arborito-pill--emerald arborito-pill--bordered">
                                {ui.sourcesPillBranch || 'Branch'}
                            </SourcesPill>
                        )}
                        {isActive && !pinned ? (
                            <SourcesPill className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700">
                                {ui.sourceActive || 'Active'}
                            </SourcesPill>
                        ) : null}
                        <LanguagePills langCodes={savedLangs} />
                    </div>
                    {shareOpts ? (
                        <SourcesShareCodeField
                            ui={ui}
                            shareCode={shareCode}
                            shareOpts={shareOpts}
                            published
                            tone={rowKind === 'composed-tree' ? 'violet' : 'emerald'}
                            onShare={(opts) =>
                                onAction?.('share-tree-row', {
                                    shareName: opts.name,
                                    shareUrl: opts.url,
                                    shareCode: opts.shareCode,
                                    ownerPub: opts.ownerPub,
                                    universeId: opts.universeId,
                                })
                            }
                        />
                    ) : null}
                    {author ? (
                        <p className="m-0 mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                            {ui.sourcesGlobalBy || 'by'} {author}
                        </p>
                    ) : null}
                    {desc ? (
                        <p className="m-0 mt-2 text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-3">
                            {desc}
                        </p>
                    ) : null}
                </div>
                <aside className="arborito-sources-row-aside">
                    <div className="arborito-sources-primary-stack arborito-sources-primary-stack--load">
                        <div className="arborito-sources-cta-row">
                            {showLoad ? (
                                <button
                                    type="button"
                                    className="arborito-sources-row-cta arborito-cta-emerald shadow-sm"
                                    onClick={() => onAction?.('load-source', { id: source?.id })}
                                >
                                    {ui.sourceLoad || 'Load'}
                                </button>
                            ) : isActive && !pinned ? (
                                <SourcesPill className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700">
                                    {ui.sourceActive || 'Active'}
                                </SourcesPill>
                            ) : null}
                        </div>
                    </div>
                    <div
                        className="arborito-sources-primary-stack arborito-sources-primary-stack--placeholder"
                        aria-hidden="true"
                    />
                    <div className="arborito-sources-toolbar arborito-sources-toolbar--social">
                        <SourcesMoreButton
                            ui={ui}
                            rowKey={key}
                            open={open}
                            onToggle={onToggleRowActions}
                        />
                    </div>
                </aside>
            </div>
            {open ? (
                <div className="mt-3 space-y-1">
                    {freezeSwitch ? (
                        <SourcesMenuPrefs
                            title={ui.sourcesTreePrefsHeading || 'This tree'}
                            tone="freeze"
                        >
                            {freezeSwitch}
                        </SourcesMenuPrefs>
                    ) : null}
                    <div className="pt-1 flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="arborito-sources-action-chip"
                            onClick={() =>
                                onAction?.('tree-info', {
                                    id: source?.id,
                                    name: title,
                                    kind: 'network',
                                })
                            }
                        >
                            {ui.sourcesBranchInfoButton || 'Branch information'}
                        </button>
                        <button
                            type="button"
                            className="arborito-sources-action-chip arborito-sources-action-chip--export"
                            onClick={() =>
                                onAction?.('export-branch', {
                                    id: source?.id,
                                    name: title,
                                    kind: 'network',
                                })
                            }
                        >
                            {ui.sourceExport || 'Export'}
                        </button>
                        <button
                            type="button"
                            className="arborito-sources-action-chip arborito-sources-action-chip--danger"
                            onClick={() => onAction?.('remove-source', { id: source?.id })}
                        >
                            {ui.sourcesGlobalRemove || ui.sourceRemove || 'Uninstall'}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
