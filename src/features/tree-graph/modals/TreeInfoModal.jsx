import { useTreeGraph } from '../hooks/useTreeGraph.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseContent } from '../../learning/api/parser.js';
import { ContentBlock } from '../../learning/components/ContentBlock.jsx';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import {
    getPendingExternalMediaDetails,
    isMediaSrcBlocked,
    persistMediaOriginsConsent,
} from '../../privacy-gdpr/api/third-party-media.js';
import { MediaConsentModal } from '../../privacy-gdpr/modals/MediaConsentModal.jsx';
import { hasAboutCourseCard } from '../../learning/api/course-intro-markdown.js';
import { TreeUtils } from '../api/tree-utils.js';
import { formatAttributionSummary, attributionFromPresentation } from '../../../shared/lib/arborito-attribution.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { DockHubPanelEmbed } from '../../../shared/ui/DockHubPanelEmbed.jsx';
import { useDockHubEmbedClose } from '../../../shared/ui/DockHubEmbedContext.jsx';
import { TreeInfoInactivityLifetime } from './TreeInfoInactivityLifetime.jsx';
import { TreeInfoCatalogSection } from './TreeInfoCatalogSection.jsx';

function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function isBranchSource(active) {
    return (
        active?.type === 'branch' ||
        (String(active?.url || '').startsWith('branch://') && active?.type !== 'composed-tree')
    );
}

function TreeInfoHealthSection({ raw, isBranch }) {
    const { ui } = useTreeGraph();
    const [sizeLabel, setSizeLabel] = useState(ui.treeHealthSizePending || '…');

    useEffect(() => {
        if (!raw) return undefined;
        const pending = ui.treeHealthSizePending || '…';
        const measureFootprint = () => {
            try {
                const n = TreeUtils.utf8JsonByteLength(raw);
                setSizeLabel(formatBytes(n));
            } catch {
                setSizeLabel(pending);
            }
        };
        const ric = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn) => setTimeout(fn, 0);
        const id = ric(measureFootprint, { timeout: 900 });
        return () => {
            if (typeof cancelIdleCallback === 'function' && typeof id === 'number') {
                cancelIdleCallback(id);
            }
        };
    }, [raw, ui.treeHealthSizePending]);

    if (!raw) return null;

    const nodes = TreeUtils.countNodesInRawGraph(raw);
    const title = ui.treeHealthHeading || 'Tree data footprint';
    const sizeL = ui.treeHealthSizeLabel || 'Estimated size in memory (JSON)';
    const nodesL = ui.treeHealthNodesLabel || 'Nodes (map + lessons)';
    const up =
        raw.universePresentation && typeof raw.universePresentation === 'object' ? raw.universePresentation : {};
    const attr = attributionFromPresentation(up, { contentKind: isBranch ? 'branch' : undefined });
    const attrText = formatAttributionSummary(ui, attr);
    const attrHeading = isBranch
        ? ui.sourcesBranchInfoTitle || ui.sourcesBranchInfoButton || 'About this branch'
        : ui.treePresentationTitle || 'Credits & license';

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-3 text-left">
            <p className="arborito-eyebrow m-0 mb-2">{title}</p>
            <ul className="list-disc pl-4 m-0 space-y-1 text-xs leading-snug text-slate-600 dark:text-slate-300">
                <li>
                    <span className="font-semibold">{sizeL}:</span> <span id="tree-info-size-bytes">{sizeLabel}</span>
                </li>
                <li>
                    <span className="font-semibold">{nodesL}:</span> {nodes}
                </li>
            </ul>
            {attrText ? (
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <p className="arborito-eyebrow m-0 mb-2">{attrHeading}</p>
                    <div className="text-xs leading-snug text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                        {attrText}
                    </div>
                </div>
            ) : null}
            <TreeInfoNetworkHealth />
            <TreeInfoInactivityLifetime />
        </div>
    );
}

function TreeInfoNetworkHealth() {
    const {
        ui,
        getActivePublicTreeRef,
        stopWebTorrentSeeder,
        webtorrent,
        rawGraphData,
        nostrLiveSeeds,
        webtorrentSeeder,
    } = useTreeGraph();
    const treeRef = getActivePublicTreeRef?.();
    const seeds = nostrLiveSeeds;
    const [torrentPeers, setTorrentPeers] = useState(0);
    const [seeder, setSeeder] = useState(
        () => webtorrentSeeder || { running: false, total: 0, done: 0, peers: 0 }
    );

    const loadTorrentStats = useCallback(async () => {
        const raw = rawGraphData;
        const wt = raw?.meta?.webtorrent;
        if (!wt || typeof wt !== 'object' || wt.mode !== 'buckets-v1') {
            setTorrentPeers(0);
            return;
        }
        const nodes = wt.nodesBuckets && typeof wt.nodesBuckets === 'object' ? wt.nodesBuckets : {};
        const content = wt.contentBuckets && typeof wt.contentBuckets === 'object' ? wt.contentBuckets : {};
        const magnets = [
            ...Object.values(nodes).map((s) => String(s || '').trim()).filter(Boolean),
            ...Object.values(content).map((s) => String(s || '').trim()).filter(Boolean),
        ];
        const uniq = [...new Set(magnets)];
        const sample = uniq.slice(0, 6);
        let peersTotal = 0;
        try {
            if (webtorrent?.available?.()) {
                const stats = await Promise.all(sample.map((m) => webtorrent.getStats({ magnet: m })));
                for (const st of stats) peersTotal += st?.numPeers || 0;
            }
        } catch {
            peersTotal = 0;
        }
        setTorrentPeers(peersTotal);
        setSeeder(webtorrentSeeder || { running: false, total: 0, done: 0, peers: 0 });
    }, [rawGraphData, webtorrent, webtorrentSeeder]);

    useEffect(() => {
        void loadTorrentStats();
    }, [loadTorrentStats]);

    if (!treeRef) return null;

    const heading = ui.treeNetworkHealthHeading || 'Online health';
    const seedsL = ui.treeNetworkHealthSeedsLabel || 'Active peers (approx.)';

    const raw = rawGraphData;
    const wt = raw?.meta?.webtorrent;
    const showTorrent = wt && typeof wt === 'object' && wt.mode === 'buckets-v1';
    const torrentHeading = ui.treeTorrentHealthHeading || 'Branch content (WebTorrent)';
    const torrentHint =
        ui.treeTorrentHealthHint ||
        'Branch bytes (folders + lessons). Arborito seeds automatically while this app is open so others can download faster.';
    const torrentWarn =
        ui.treeTorrentSeederWarn ||
        'Seeding uses upload bandwidth and can slow this device. Stop below if you are on mobile data.';
    const seederLine = seeder.running
        ? `${ui.treeTorrentSeederAuto || 'Seeding'} · ${seeder.done || 0}/${seeder.total || 0} · peers≈${seeder.peers || torrentPeers}`
        : `peers≈${torrentPeers}`;
    const btnText = seeder.running ? ui.treeTorrentStopSeeder || 'Stop seeder' : null;

    let bucketCount = 0;
    if (showTorrent) {
        const nodes = wt.nodesBuckets && typeof wt.nodesBuckets === 'object' ? wt.nodesBuckets : {};
        const content = wt.contentBuckets && typeof wt.contentBuckets === 'object' ? wt.contentBuckets : {};
        const magnets = [
            ...Object.values(nodes).map((s) => String(s || '').trim()).filter(Boolean),
            ...Object.values(content).map((s) => String(s || '').trim()).filter(Boolean),
        ];
        bucketCount = [...new Set(magnets)].length;
    }

    const toggleSeeder = () => {
        if (webtorrentSeeder?.running) stopWebTorrentSeeder();
        void loadTorrentStats();
    };

    return (
        <div id="tree-info-network-health" className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <p className="arborito-eyebrow m-0 mb-2">{heading}</p>
            <ul className="list-disc pl-4 m-0 space-y-1 text-xs leading-snug text-slate-600 dark:text-slate-300">
                <li>
                    <span className="font-semibold">{seedsL}:</span> {seeds == null ? ': ' : String(seeds)}
                </li>
            </ul>
            {showTorrent ? (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <p className="arborito-eyebrow m-0 mb-2">{torrentHeading}</p>
                    <p className="mt-0 mb-2 text-xs leading-snug text-slate-500 dark:text-slate-400">{torrentHint}</p>
                    <ul className="list-disc pl-4 m-0 space-y-1 text-xs leading-snug text-slate-600 dark:text-slate-300">
                        <li>
                            <span className="font-semibold">Buckets:</span> {bucketCount}
                        </li>
                        <li>
                            <span className="font-semibold">Status:</span> {seederLine}
                        </li>
                    </ul>
                    <p className="mt-2 mb-2 text-[11px] leading-snug text-amber-700 dark:text-amber-300">{torrentWarn}</p>
                    {seeder.running && btnText ? (
                        <div className="flex items-center justify-end">
                            <button
                                id="btn-tree-info-torrent-seeder"
                                type="button"
                                className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold"
                                onClick={() => toggleSeeder()}
                            >
                                {btnText}
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function TreeInfoMarkdownSection() {
    const { ui, data, rawGraphData } = useTreeGraph();
    const [mediaDeclined, setMediaDeclined] = useState(false);
    const [consentKey, setConsentKey] = useState(0);

    const md = useMemo(() => {
        const rootNode = data;
        const rawData = rawGraphData;
        if (!rootNode || !rawData) return '';
        if (hasAboutCourseCard(rawData)) return '';
        return (rootNode.description || ui.readmeFallbackWelcome || '').trim();
    }, [data, rawGraphData, ui.readmeFallbackWelcome]);

    if (!md) return null;

    const blocks = parseContent(md);
    const pendingMediaDetails = getPendingExternalMediaDetails(blocks);
    const showMediaConsentModal = pendingMediaDetails.length > 0 && !mediaDeclined;

    const introHeading = ui.treeInfoIntroHeading || ui.introLabel || 'Introduction';

    const handleAcceptMedia = () => {
        persistMediaOriginsConsent(
            pendingMediaDetails.map((p) => p.origin),
            true
        );
        setConsentKey((k) => k + 1);
    };

    return (
        <div id="tree-info-intro-wrap" className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-left">
            <p className="arborito-eyebrow m-0 mb-2">{introHeading}</p>
            <div
                id="tree-info-md"
                key={consentKey}
                className="readme-markdown w-full max-w-none text-left select-text"
                onClick={(e) => {
                    const t = e.target;
                    if (!(t instanceof Element)) return;
                    if (t.closest('.arborito-media-consent-retry')) {
                        setMediaDeclined(false);
                        setConsentKey((k) => k + 1);
                    }
                }}
            >
                {blocks.map((block, i) => (
                    <ContentBlock
                        key={block.id || `${block.type}-${i}`}
                        block={block}
                        isMediaSrcBlocked={isMediaSrcBlocked}
                        compact
                    />
                ))}
            </div>
            {showMediaConsentModal ? (
                <MediaConsentModal
                    pending={pendingMediaDetails}
                    onAccept={handleAcceptMedia}
                    onDecline={() => {
                        setMediaDeclined(true);
                        setConsentKey((k) => k + 1);
                    }}
                />
            ) : null}
        </div>
    );
}

export function ModalTreeInfo({ embed, dockEmbed = false, dockEmbedActive = false }) {
    const tree = useTreeGraph();
    const { ui, dismissModal, activeSource, modal, rawGraphData } = tree;

    const mobile = shouldShowMobileUI();
    const isBranch = isBranchSource(activeSource);
    const fromConstructionMore = modal && typeof modal === 'object' && !!modal.fromConstructionMore;
    const instantOpen = fromConstructionMore && mobile;

    const isComposedTree = activeSource?.type === 'composed-tree';
    const title = isBranch
        ? ui.sourcesBranchInfoTitle || ui.sourcesBranchInfoButton || 'About this branch'
        : isComposedTree
          ? ui.sourcesComposedTreeInfoTitle || ui.sourcesComposedTreeInfoButton || 'About this tree'
          : ui.treeInfoModalTitle || ui.treePresentationTitle || 'About this tree';

    const close = () => dismissModal();
    useDockHubEmbedClose(close, dockEmbedActive);
    const raw = rawGraphData;

    const body = (
        <div id="tree-info-scroll" className="px-3 py-3 sm:px-4 sm:py-4">
            <TreeInfoCatalogSection isBranch={isBranch} isComposedTree={isComposedTree} />
            <TreeInfoHealthSection raw={raw} isBranch={isBranch} />
            <TreeInfoMarkdownSection />
        </div>
    );

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile
            title={title}
            titleTruncate
            leadingIcon="ℹ️"
            tagClass="btn-close"
            onClose={close}
        />
    );

    if (dockEmbed) {
        return (
            <DockHubPanelEmbed panelId="modal-tree-info" hero={hero}>
                {body}
            </DockHubPanelEmbed>
        );
    }

    return (
        <div data-arborito-panel="modal-tree-info" data-embed={embed ? '1' : undefined}>
            <DockModalShell
                mobile={mobile}
                sizeTier="HUB"
                shellOpts={{ z: 140, instantOpen }}
                onBackdropClick={close}
                hero={hero}
            >
                {body}
            </DockModalShell>
        </div>
    );
}
