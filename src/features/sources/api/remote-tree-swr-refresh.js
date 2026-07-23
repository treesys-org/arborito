/**
 * Stale-while-revalidate for remote (Nostr) tree bundles: paint IndexedDB
 * cache immediately, then quietly replace when the network returns newer JSON.
 */

import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { ensureConnectedNostr } from '../../../shared/lib/connected-services/index.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { parseArboritoTreeBundle } from '../../forest/api/arborito-tree-bundle.js';
import { importComposedTreeFromBundle } from '../../forest/api/import-composed-tree-bundle.js';
import { DataProcessor } from '../../tree-graph/api/data-processor.js';
import { normalizeLoadedTreeJson } from '../../tree-graph/api/tree-load-pipeline.js';
import { sanitizeImportedTreeJson } from '../../tree-graph/api/tree-import-sanitize.js';
import { putTreeBundleCache } from './tree-bundle-cache.js';
import { scheduleAutoWebTorrentSeeder } from '../../p2p-webtorrent/api/auto-webtorrent-seeder.js';

/** Rough stamp so identical network payloads skip a full graph remount. */
export function treeBundleRoughStamp(json) {
    if (!json || typeof json !== 'object') return '';
    const m = json.meta && typeof json.meta === 'object' ? json.meta : {};
    const nodes = Array.isArray(json.nodes) ? json.nodes.length : 0;
    const branches = Array.isArray(json.branches) ? json.branches.length : 0;
    return [
        String(m.updatedAt || ''),
        String(m.publishedAt || ''),
        String(m.shareCode || ''),
        String(m.nostrBundleFormat || ''),
        String(json.format || ''),
        String(nodes),
        String(branches),
    ].join('|');
}

/**
 * @param {import('../../../core/store.js').Store} store
 * @param {object} source
 * @param {{ epoch: number, connectPromise?: Promise<unknown>|null }} opts
 */
export async function refreshRemoteTreeBundleInBackground(store, source, opts) {
    const epoch = Number(opts?.epoch) || 0;
    const sourceId = String(source?.id || '');
    if (!sourceId || !store) return;

    try {
        if (opts?.connectPromise) {
            await opts.connectPromise;
        } else {
            await ensureConnectedNostr(store, {
                timeoutMs: shouldShowMobileUI() ? 20000 : 12000,
            });
        }
        if (epoch !== store._curriculumMountEpoch) return;
        if (String(store.state.activeSource?.id || '') !== sourceId) return;

        const out = await store.sourceManager.loadData(
            source,
            store.state.lang,
            true,
            null
        );
        if (epoch !== store._curriculumMountEpoch) return;
        if (String(store.state.activeSource?.id || '') !== sourceId) return;
        if (!out?.json) return;

        if (
            (out.finalSource?.origin === 'nostr') &&
            parseNostrTreeUrl(String(out.finalSource?.url || source.url || ''))
        ) {
            store._treeForumHydratedForSourceId = null;
        }

        if (parseArboritoTreeBundle(out.json)) {
            const treeRef = parseNostrTreeUrl(
                String((out.finalSource && out.finalSource.url) || source.url || '')
            );
            const entry = await importComposedTreeFromBundle(store, out.json, {
                treeRef: treeRef || undefined,
                shareCode: (out.finalSource && out.finalSource.shareCode) || undefined,
            });
            if (epoch !== store._curriculumMountEpoch) return;
            if (String(store.state.activeSource?.id || '') !== sourceId) return;
            await store.loadComposedTree(entry.id);
            return;
        }

        let graphJson = normalizeLoadedTreeJson(out.json, store, out.finalSource);
        if (!graphJson) return;
        const { tree: sanitized } = sanitizeImportedTreeJson(graphJson);
        graphJson = sanitized;
        if (!graphJson) return;

        const prevStamp = treeBundleRoughStamp(store.state.rawGraphData);
        const nextStamp = treeBundleRoughStamp(graphJson);
        if (prevStamp && nextStamp && prevStamp === nextStamp) {
            if (out.finalSource?.id) {
                void putTreeBundleCache(String(out.finalSource.id), {
                    treeJson: graphJson,
                    url: out.finalSource.url,
                    origin: out.finalSource.origin,
                });
            }
            return;
        }

        if (typeof store.refreshTreeNetworkGovernance === 'function') {
            await store.refreshTreeNetworkGovernance(out.finalSource);
        }
        if (epoch !== store._curriculumMountEpoch) return;
        if (String(store.state.activeSource?.id || '') !== sourceId) return;

        DataProcessor.process(store, graphJson, out.finalSource, {
            suppressReadmeAutoOpen: true,
            carryOverSelection: true,
        });
        if (out.finalSource?.id && store.state.rawGraphData) {
            void putTreeBundleCache(String(out.finalSource.id), {
                treeJson: store.state.rawGraphData,
                url: out.finalSource.url,
                origin: out.finalSource.origin,
            });
        }
        try {
            if (typeof store.syncNostrPresenceFromActiveSource === 'function') {
                store.syncNostrPresenceFromActiveSource(out.finalSource);
            }
        } catch {
            /* ignore */
        }
        scheduleAutoWebTorrentSeeder(store);
        queueMicrotask(() => {
            try {
                store.dispatchEvent(new CustomEvent('graph-update'));
            } catch {
                /* ignore */
            }
        });
    } catch (e) {
        if (epoch !== store._curriculumMountEpoch) return;
        if (String(store.state.activeSource?.id || '') !== sourceId) return;
        const ui = store.ui || {};
        queueMicrotask(() =>
            store.notify(
                ui.treeLoadedFromCacheOffline ||
                    'Showing cached copy, network refresh failed.',
                false
            )
        );
        console.warn('[Arborito] remote tree SWR refresh', e);
    }
}
