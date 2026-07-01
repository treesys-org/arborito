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

const RELAY_PING_TTL_MS = 60_000;
let _cachedRelayPings = null;

function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function pingRelay(url, timeoutMs = 2500) {
    const started = performance.now();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: ctrl.signal, mode: 'cors' });
        const ms = Math.round(performance.now() - started);
        return { ok: !!res, ms, status: res.status };
    } catch {
        const ms = Math.round(performance.now() - started);
        return { ok: false, ms, status: 0 };
    } finally {
        clearTimeout(t);
    }
}

function parsePeersTextarea(s) {
    return String(s || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
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
        </div>
    );
}

function TreeInfoNetworkHealth() {
    const {
        ui,
        getActivePublicTreeRef,
        setNostrRelayUrls,
        stopWebTorrentSeeder,
        startWebTorrentSeeder,
        nostr,
        webtorrent,
        rawGraphData,
        nostrLiveSeeds,
        webtorrentSeeder,
    } = useTreeGraph();
    const treeRef = getActivePublicTreeRef?.();
    const seeds = nostrLiveSeeds;
    const peers = Array.isArray(nostr?.peers) ? nostr.peers : [];
    const [relayChecks, setRelayChecks] = useState(null);
    const [relayInput, setRelayInput] = useState(() => peers.join('\n'));
    const [torrentPeers, setTorrentPeers] = useState(0);
    const [seeder, setSeeder] = useState(
        () => webtorrentSeeder || { running: false, total: 0, done: 0, peers: 0 }
    );
    const peersKey = peers.join('|');

    useEffect(() => {
        setRelayInput(peers.join('\n'));
    }, [peersKey, peers]);

    const loadRelayStatus = useCallback(async () => {
        if (!treeRef || !peers.length) {
            setRelayChecks([]);
            return;
        }
        const cacheKey = peers.join('|');
        const now = Date.now();
        const fresh =
            _cachedRelayPings &&
            _cachedRelayPings.key === cacheKey &&
            now - _cachedRelayPings.ts < RELAY_PING_TTL_MS;
        if (fresh) {
            setRelayChecks(_cachedRelayPings.checks);
            return;
        }
        setRelayChecks(null);
        const checks = await Promise.all(peers.map((p) => pingRelay(p)));
        _cachedRelayPings = { key: cacheKey, ts: now, checks };
        setRelayChecks(checks);
    }, [treeRef, peersKey, peers]);

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
        void loadRelayStatus();
        void loadTorrentStats();
    }, [loadRelayStatus, loadTorrentStats]);

    if (!treeRef) return null;

    const heading = ui.treeNetworkHealthHeading || 'Online health';
    const seedsL = ui.treeNetworkHealthSeedsLabel || 'Active peers (approx.)';
    const relaysL = ui.treeNetworkHealthRelaysLabel || 'Relays';
    const saveL = ui.dialogSaveButton || 'Save';
    const hint =
        ui.treeNetworkHealthHint ||
        'If relays are down or slow, add community relays here. Share codes can include recommended relays so others connect automatically.';

    const raw = rawGraphData;
    const wt = raw?.meta?.webtorrent;
    const showTorrent = wt && typeof wt === 'object' && wt.mode === 'buckets-v1';
    const torrentHeading = ui.treeTorrentHealthHeading || 'Course content (WebTorrent)';
    const torrentHint =
        ui.treeTorrentHealthHint ||
        'These are the "bytes" of the course (folders + lessons). If there are no peers, downloads may be slow until someone runs a seeder.';
    const torrentWarn =
        ui.treeTorrentSeederWarn ||
        'Seeder mode downloads and shares the whole course. It can slow down this device and use bandwidth.';
    const seederLine = seeder.running
        ? `${seeder.done || 0}/${seeder.total || 0} · peers≈${seeder.peers || torrentPeers}`
        : `peers≈${torrentPeers}`;
    const btnText = seeder.running ? ui.treeTorrentStopSeeder || 'Stop seeder' : ui.treeTorrentStartSeeder || 'Start seeder';

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

    const saveRelays = () => {
        const next = parsePeersTextarea(relayInput);
        setNostrRelayUrls(next);
        _cachedRelayPings = null;
        void loadRelayStatus();
    };

    const toggleSeeder = async () => {
        const cur = webtorrentSeeder;
        if (cur?.running) stopWebTorrentSeeder();
        else await startWebTorrentSeeder();
        void loadTorrentStats();
        void loadRelayStatus();
    };

    return (
        <div id="tree-info-network-health" className="mt-4">
            <p className="arborito-eyebrow m-0 mb-2">{heading}</p>
            <ul className="list-disc pl-4 m-0 space-y-1 text-xs leading-snug text-slate-600 dark:text-slate-300">
                <li>
                    <span className="font-semibold">{seedsL}:</span> {seeds == null ? '—' : String(seeds)}
                </li>
            </ul>
            <p className="mt-2 mb-2 text-xs leading-snug text-slate-500 dark:text-slate-400">{hint}</p>
            <p className="arborito-eyebrow m-0 mb-2">{relaysL}</p>
            <div id="tree-info-relay-status" className="text-xs text-slate-600 dark:text-slate-300 space-y-1 mb-3">
                {relayChecks === null ? (
                    <span>{ui.treeNetworkHealthChecking || 'Checking relays…'}</span>
                ) : (
                    peers.map((p, i) => {
                        const c = relayChecks[i];
                        const ok = c?.ok;
                        const ms = c?.ms ?? 0;
                        const badgeCls = ok
                            ? ms < 3500
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-amber-700 dark:text-amber-300'
                            : 'text-rose-700 dark:text-rose-300';
                        const badge = ok ? `${ms}ms` : ui.treeNetworkHealthDown || 'down';
                        return (
                            <div key={p} className="flex items-center justify-between gap-2">
                                <span className="font-mono break-all">{p}</span>
                                <span className={`${badgeCls} font-bold`}>{badge}</span>
                            </div>
                        );
                    })
                )}
            </div>
            <textarea
                id="tree-info-relays-input"
                className="w-full h-28 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 outline-none"
                spellCheck={false}
                value={relayInput}
                onChange={(e) => setRelayInput(e.target.value)}
            />
            <div className="mt-2 flex items-center justify-end gap-2">
                <button
                    id="btn-tree-info-relays-save"
                    type="button"
                    className="arborito-cta-emerald px-3 py-2 rounded-xl text-xs font-bold"
                    onClick={saveRelays}
                >
                    {saveL}
                </button>
            </div>
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
                    <div className="flex items-center justify-end">
                        <button
                            id="btn-tree-info-torrent-seeder"
                            type="button"
                            className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold"
                            onClick={() => void toggleSeeder()}
                        >
                            {btnText}
                        </button>
                    </div>
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
        <div id="tree-info-intro-wrap" className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <p className="arborito-eyebrow mb-2">{introHeading}</p>
            <div
                id="tree-info-md"
                key={consentKey}
                className="readme-markdown prose prose-slate dark:prose-invert mx-auto w-full max-w-3xl text-left select-text text-sm"
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

export function ModalTreeInfo({ embed }) {
    const tree = useTreeGraph();
    const { ui, dismissModal, activeSource, modal, rawGraphData } = tree;

    const mobile = shouldShowMobileUI();
    const isBranch = isBranchSource(activeSource);
    const fromConstructionMore = modal && typeof modal === 'object' && !!modal.fromConstructionMore;
    const instantOpen = fromConstructionMore && mobile;

    const title = isBranch
        ? ui.sourcesBranchInfoTitle || ui.sourcesBranchInfoButton || 'About this branch'
        : ui.treeInfoModalTitle || ui.treePresentationTitle || 'About this tree';

    const close = () => dismissModal();
    const raw = rawGraphData;

    return (
        <div data-arborito-panel="modal-tree-info" data-embed={embed ? '1' : undefined}>
            <DockModalShell
                mobile={mobile}
                sizeTier="HUB"
                shellOpts={{ z: 140, instantOpen }}
                onBackdropClick={close}
                hero={
                    <ModalHubHero
                        ui={ui}
                        mobile
                        title={title}
                        titleTruncate
                        tagClass="btn-close"
                        onClose={close}
                    />
                }
            >
                <div id="tree-info-scroll" className="px-3 py-3 sm:px-4 sm:py-4">
                    <TreeInfoHealthSection raw={raw} isBranch={isBranch} />
                    <TreeInfoMarkdownSection />
                </div>
            </DockModalShell>
        </div>
    );
}
