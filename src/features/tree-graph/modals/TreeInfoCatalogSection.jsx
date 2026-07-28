import { useEffect, useState } from 'react';
import { useTreeGraph } from '../hooks/useTreeGraph.js';
import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { isPublishedResourceOwner } from '../../publishing/api/published-owner.js';
import {
    hydratePublishedShareCode,
    resolveActiveShareContext,
} from '../../sources/api/published-share-context.js';
import { shareTreeLink } from '../../sources/api/share-tree-link.js';
import { buildPublicShareAppUrl } from '../../../shared/lib/public-app-url.js';
import { SourcesShareCodeField } from '../../sources/modals/components/SourcesShareCodeField.jsx';
import { resolveBranchRefDisplayNames } from '../../forest/api/tree-branch-labels.js';
import { SwitchRow } from '../../../shared/ui/SwitchRow.jsx';
import { useSources } from '../../sources/hooks/useSources.js';
import {
    isPlaceholderCommunitySourceName,
    pickTitleForLang,
    titlesFromTreeLanguages,
} from '../../../shared/lib/catalog-titles.js';
import { useShellModalLang } from '../../../app/hooks/useHookShell.js';
import { armPostClosePointerGuard } from '../../../stores/shell-dialog-lifecycle.js';

function formatDate(ts) {
    if (!ts || !Number.isFinite(Number(ts))) return ': ';
    try {
        return new Date(Number(ts)).toLocaleDateString();
    } catch {
        return ': ';
    }
}

/** Summary block: status, code, languages, forum, branches, above health metrics. */
export function TreeInfoCatalogSection({ isBranch, isComposedTree }) {
    const {
        ui,
        activeSource,
        rawGraphData,
        userStore,
        getNostrPublisherPair,
        communitySources,
        notify,
    } = useTreeGraph();
    const { lang: uiLang } = useShellModalLang();
    const { addCommunitySource, removeCommunitySource } = useSources();
    const ctx = resolveActiveShareContext(activeSource, userStore, rawGraphData);
    const { shareOpts, localEntry, publishedNetworkUrl } = ctx;
    const [shareCode, setShareCode] = useState(() => String(ctx.shareCode || '').trim());
    const [shareLoading, setShareLoading] = useState(false);

    const activeUrl = String(activeSource?.url || '').trim();
    const isNetworkOpen = !!(
        parseNostrTreeUrl(activeUrl) ||
        activeSource?.type === 'shared' ||
        activeSource?.type === 'community' ||
        activeSource?._fromShareParam
    );
    const networkUrl = String(
        (parseNostrTreeUrl(activeUrl) ? activeUrl : '') || publishedNetworkUrl || ''
    ).trim();
    const installed =
        isNetworkOpen &&
        !!networkUrl &&
        Array.isArray(communitySources) &&
        communitySources.some((s) => String(s?.url || '').trim() === networkUrl);

    const toggleInstall = (next) => {
        /* Avoid UI flicker / accidental backdrop dismissal from a synthetic click
         * after the touch that toggled installed state. */
        armPostClosePointerGuard(550);
        if (!networkUrl) return;
        if (next) {
            const titleRaw =
                pickTitleForLang(
                    rawGraphData?.meta?.titles || titlesFromTreeLanguages(rawGraphData),
                    uiLang,
                    ''
                ) ||
                String(rawGraphData?.meta?.title || rawGraphData?.universeName || '').trim();
            const title =
                titleRaw && !isPlaceholderCommunitySourceName(titleRaw) ? titleRaw : '';
            const titles =
                (rawGraphData?.meta?.titles && typeof rawGraphData.meta.titles === 'object'
                    ? rawGraphData.meta.titles
                    : null) || titlesFromTreeLanguages(rawGraphData);
            const added = addCommunitySource(null, {
                resolvedNostrTreeUrl: networkUrl,
                codeLabel: shareCode && shareCode !== ': ' ? shareCode : null,
                ...(title
                    ? {
                          listMeta: {
                              title,
                              ...(titles && Object.keys(titles).length ? { titles } : {}),
                          },
                      }
                    : {}),
            });
            if (added?.ok || added?.reason === 'duplicate') {
                notify?.(ui.sourcesAddedToast || 'Added.', false);
            }
            return;
        }
        const row = (communitySources || []).find(
            (s) =>
                String(s?.url || '').trim() === networkUrl ||
                String(s?.url || '').trim() === String(activeSource?.url || '').trim()
        );
        if (row?.id) {
            removeCommunitySource(row.id);
            notify?.(ui.sourcesRemovedToast || 'Removed.', false);
        }
    };

    useEffect(() => {
        const next = String(resolveActiveShareContext(activeSource, userStore, rawGraphData).shareCode || '').trim();
        setShareCode(next);
        if (next || !localEntry?.publishedNetworkUrl) {
            setShareLoading(false);
            return undefined;
        }
        let cancelled = false;
        setShareLoading(true);
        void hydratePublishedShareCode(localEntry, {
            kind: isComposedTree ? 'composed-tree' : 'branch',
        }).then((code) => {
            if (cancelled) return;
            setShareLoading(false);
            setShareCode(code ? String(code).trim() : ': ');
        });
        return () => {
            cancelled = true;
        };
    }, [
        activeSource?.id,
        activeSource?.url,
        localEntry?.id,
        localEntry?.publishedNetworkUrl,
        localEntry?.publishedShareCode,
        isComposedTree,
        rawGraphData?.meta?.shareCode,
        userStore,
    ]);

    const isPublished = !!String(publishedNetworkUrl || parseNostrTreeUrl(activeSource?.url || '')?.pub || '').trim();
    const isOwner =
        isPublished &&
        isPublishedResourceOwner(
            localEntry || { publishedNetworkUrl: publishedNetworkUrl || activeSource?.url },
            getNostrPublisherPair
        );

    const langs =
        rawGraphData?.languages && typeof rawGraphData.languages === 'object'
            ? Object.keys(rawGraphData.languages)
            : [];
    const forumOn = rawGraphData?.meta?.forumEnabled !== false && isPublished;
    const shortLink =
        isPublished && shareCode ? buildPublicShareAppUrl(`?code=${encodeURIComponent(shareCode)}`) : '';

    let branchNames = [];
    if (isComposedTree && localEntry?.branchRefs) {
        branchNames = resolveBranchRefDisplayNames(localEntry.branchRefs);
    }

    const updatedTs = localEntry?.updated || localEntry?.publishedAt || null;
    const kindLabel = isComposedTree
        ? ui.sourcesPillComposedTree || 'Tree'
        : ui.sourcesPillBranch || 'Branch';

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 px-3 py-3 text-left mb-4">
            <p className="arborito-eyebrow m-0 mb-2">{ui.treeInfoCatalogHeading || 'Summary'}</p>
            {isNetworkOpen ? (
                <div className="mb-3">
                    <SwitchRow
                        id="tree-info-install-switch"
                        label={
                            installed
                                ? ui.treeInfoRemoveLabel || ui.sourcesGlobalRemove || 'Remove'
                                : ui.treeInfoAddLabel || ui.sourcesGlobalInstall || 'Add'
                        }
                        hint={
                            ui.treeInfoCatalogHint ||
                            'Keeps this course in your catalog when you open another one. On by default for shared links.'
                        }
                        checked={!!installed}
                        onChange={toggleInstall}
                        /* SwitchRow announces the action of the next tap (on→offAria, off→onAria). */
                        onAria={ui.treeInfoAddLabel || ui.sourcesGlobalInstall || 'Add'}
                        offAria={ui.treeInfoRemoveLabel || ui.sourcesGlobalRemove || 'Remove'}
                        className="py-0"
                    />
                </div>
            ) : null}
            <dl className="m-0 grid gap-1.5 text-xs leading-snug text-slate-600 dark:text-slate-300">
                <div className="flex flex-wrap gap-x-2">
                    <dt className="font-semibold shrink-0">{ui.treeInfoKindLabel || 'Type'}:</dt>
                    <dd className="m-0">{kindLabel}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                    <dt className="font-semibold shrink-0">{ui.treeInfoStatusLabel || 'Status'}:</dt>
                    <dd className="m-0">
                        {isPublished ? ui.sourcesPillPublished || 'Published' : ui.sourcesPillLocal || 'On device'}
                        {isOwner ? ` · ${ui.sourcesPillOwner || 'Owner'}` : ''}
                    </dd>
                </div>
            </dl>
            {isPublished ? (
                <SourcesShareCodeField
                    ui={ui}
                    shareCode={shareCode && shareCode !== ': ' ? shareCode : ''}
                    shareOpts={shareOpts}
                    loading={shareLoading}
                    published
                    tone={isComposedTree ? 'violet' : 'emerald'}
                    className="mb-2"
                    onShare={(opts) => void shareTreeLink(opts)}
                />
            ) : null}
            <dl className="m-0 grid gap-1.5 text-xs leading-snug text-slate-600 dark:text-slate-300">
                {shortLink ? (
                    <div className="flex flex-col gap-0.5">
                        <dt className="font-semibold">{ui.treeInfoShareLinkLabel || 'Share link'}:</dt>
                        <dd className="m-0 font-mono text-[10px] break-all text-slate-500 dark:text-slate-400">{shortLink}</dd>
                    </div>
                ) : null}
                {langs.length ? (
                    <div className="flex flex-wrap gap-x-2">
                        <dt className="font-semibold shrink-0">{ui.treeInfoLanguagesLabel || 'Languages'}:</dt>
                        <dd className="m-0">{langs.join(', ')}</dd>
                    </div>
                ) : null}
                {isPublished ? (
                    <div className="flex flex-wrap gap-x-2">
                        <dt className="font-semibold shrink-0">{ui.treeInfoForumLabel || 'Forum'}:</dt>
                        <dd className="m-0">
                            {forumOn ? ui.treeInfoForumOn || 'On' : ui.treeInfoForumOff || 'Off'}
                        </dd>
                    </div>
                ) : null}
                {updatedTs ? (
                    <div className="flex flex-wrap gap-x-2">
                        <dt className="font-semibold shrink-0">{ui.sourcesUpdated || 'Updated'}:</dt>
                        <dd className="m-0">{formatDate(updatedTs)}</dd>
                    </div>
                ) : null}
                {isComposedTree && branchNames.length ? (
                    <div className="flex flex-col gap-0.5">
                        <dt className="font-semibold">
                            {String(ui.importPreviewTreeBranchCount || 'Branches: {n}').replace(
                                /\{n\}/g,
                                String(branchNames.length)
                            )}
                        </dt>
                        <dd className="m-0 pl-0">
                            <ul className="list-none m-0 p-0 space-y-0.5">
                                {branchNames.slice(0, 8).map((n) => (
                                    <li key={n}>🌿 {n}</li>
                                ))}
                                {branchNames.length > 8 ? (
                                    <li className="text-slate-400">
                                        {String(ui.importPreviewBranchesMore || '…and {n} more').replace(
                                            /\{n\}/g,
                                            String(branchNames.length - 8)
                                        )}
                                    </li>
                                ) : null}
                            </ul>
                        </dd>
                    </div>
                ) : null}
            </dl>
        </div>
    );
}
