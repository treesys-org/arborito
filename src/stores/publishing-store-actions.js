/** Bumps when author-facing legal text changes; users must accept again. */
const AUTHOR_LICENSE_VERSION = 'cc-by-sa-4.0-arborito-v1';
const AUTHOR_LICENSE_STORAGE_KEY = 'arborito-author-license-accepted';

import { getArboritoStore } from '../core/store-singleton.js';
import { dismissModalAction, notifyAction } from './shell-ui-store-actions.js';
import { parseNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';
import { computeReportSignalsFromRows } from '../features/sources/api/modals/logic/sources-directory-fetch.js';
import { computeReportHideThreshold } from '../features/sources/api/modals/logic/sources-directory-row-state.js';
import { DataProcessor } from '../features/tree-graph/api/data-processor.js';
import { flattenTreeSearchEntriesWithLessonBody } from '../features/search/api/search-index-core.js';
import { publishRevokeMethods } from './publishing-publish-revoke-store-actions.js';
import { notifyPublishingChanged } from './store-notify.js';
import { saveExportFile, EXPORT_FILTERS, sanitizeExportFileName } from '../features/backup-export/api/export/save-export-file.js';
import { notifyExportSaved } from '../features/backup-export/api/export/export-result-ui.js';

/**
 * Patches that affect shell UI during publishing (`publishingTree`, overlays).
 * @param {Record<string, unknown>} partial
 */
export function commitPublishingState(partial) {
    const store = getArboritoStore();
    if (!store || !partial) return;
    store.update(partial);
}

function shell() {
    return getArboritoStore();
}

function publishCall(method) {
    return function (...args) {
        const store = shell();
        if (!store) return undefined;
        const fn = publishRevokeMethods[method];
        return typeof fn === 'function' ? fn(...args) : undefined;
    };
}

export async function downloadProgressFileAction() {
    const store = shell();
    if (!store) return;
    const data = store.getExportJson?.();
    if (!data) return;
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const result = await saveExportFile({
        data,
        filename: sanitizeExportFileName(`arborito-progress-${timestamp}.json`, 'arborito-progress.json'),
        mimeType: 'application/json;charset=utf-8',
        filters: EXPORT_FILTERS.json,
    });
    if (result?.ok) notifyExportSaved(result, store.ui);
}

export function importProgressAction(input) {
    const store = shell();
    if (!store) return false;
    try {
        let data;
        const cleaned = String(input || '').trim();
        if (cleaned.startsWith('{')) data = JSON.parse(cleaned);
        else data = JSON.parse(decodeURIComponent(escape(atob(cleaned))));

        let newProgress = [];
        if (Array.isArray(data.progress)) newProgress = data.progress;

        if (data.gamification) {
            store.userStore.state.gamification = {
                ...store.userStore.state.gamification,
                ...data.gamification,
            };
        }

        if (data.bookmarks) {
            store.userStore.state.bookmarks = { ...store.userStore.state.bookmarks, ...data.bookmarks };
            localStorage.setItem('arborito-bookmarks', JSON.stringify(store.state.bookmarks));
        }

        if (data.gameData) {
            store.userStore.state.gameData = { ...store.userStore.state.gameData, ...data.gameData };
        }

        const importedPair = data.nostrPair && typeof data.nostrPair === 'object' ? data.nostrPair : null;
        if (importedPair?.pub && importedPair?.priv) {
            localStorage.setItem('arborito-nostr-user-pair', JSON.stringify(importedPair));
        }

        if (!Array.isArray(newProgress)) throw new Error('Invalid Format');

        const merged = new Set([...store.userStore.state.completedNodes, ...newProgress]);
        store.userStore.state.completedNodes = merged;
        store.userStore.persist();

        if (store.state.data) DataProcessor.hydrateCompletionState(store, store.state.data);

        notifyPublishingChanged(store);
        try {
            store.maybeSyncNetworkProgress?.(store.userStore.getPersistenceData());
        } catch {
            /* ignore */
        }
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

/** Store.prototype, progress import/export. */
export const storeImportExportMethods = {
    downloadProgressFile: downloadProgressFileAction,
    importProgress: importProgressAction,
};

/** CC legal text shown on top of the current modal (Trees, welcome, …). */
export function openAuthorLicenseOverlayAction(extra = {}) {
    commitPublishingState({ modalOverlay: { type: 'author-license', ...extra } });
}

export function closeAuthorLicenseOverlayAction() {
    commitPublishingState({ modalOverlay: null });
}

export function hasAcceptedAuthorLicenseAction() {
    try {
        return localStorage.getItem(AUTHOR_LICENSE_STORAGE_KEY) === AUTHOR_LICENSE_VERSION;
    } catch {
        return false;
    }
}

export function acceptAuthorLicenseAction() {
    try {
        localStorage.setItem(AUTHOR_LICENSE_STORAGE_KEY, AUTHOR_LICENSE_VERSION);
    } catch {
        /* ignore */
    }
}

export function cancelAuthorLicenseModalAction() {
    const store = shell();
    if (!store) return;
    if (store.state.modalOverlay?.type === 'author-license') {
        closeAuthorLicenseOverlayAction();
        return;
    }
    dismissModalAction();
}

/** Store.prototype, author license overlay. */
export const storeLicenseMethods = {
    openAuthorLicenseOverlay: openAuthorLicenseOverlayAction,
    closeAuthorLicenseOverlay: closeAuthorLicenseOverlayAction,
    hasAcceptedAuthorLicense: hasAcceptedAuthorLicenseAction,
    acceptAuthorLicense: acceptAuthorLicenseAction,
    cancelAuthorLicenseModal: cancelAuthorLicenseModalAction,
};

export const publishTreePublicInteractiveAction = publishCall('publishTreePublicInteractive');
export const revokePublicTreeInteractiveAction = publishCall('revokePublicTreeInteractive');
export const revokeActivePublicTreeInteractiveAction = publishCall('revokeActivePublicTreeInteractive');
export const publishComposedTreeToNostrAction = publishCall('publishComposedTreeToNostr');
export const offerLocalCopyFromNetworkTreeForEditingAction = publishCall(
    'offerLocalCopyFromNetworkTreeForEditing'
);

/**
 * Best-effort local notification for tree creators about directory reports.
 */
export async function maybeNotifyOwnerAboutNewDirectoryReportsAction(source) {
    let notified = false;
    const store = getArboritoStore();
    if (!store) return false;
    try {
        if (!source || typeof source !== 'object') return false;
        if (String(source.origin || '') !== 'nostr') return false;
        const url = String(source.url || '');
        const ref = parseNostrTreeUrl(url);
        const pub = String(ref?.pub || '');
        const universeId = String(ref?.universeId || '');
        if (!pub || !universeId) return false;
        const pair = store.getNostrPublisherPair?.(pub);
        if (!pair?.priv) return false;
        const net = store.nostr;
        if (!net) return false;

        if (typeof net.listTreeLegalReportsOnce === 'function' && typeof net.loadTreeLegalOwnerDefenseOnce === 'function') {
            try {
                const legalRows = await net.listTreeLegalReportsOnce({ ownerPub: pub, universeId, max: 40 });
                const latestLegalAt = String(legalRows?.[0]?.at || '');
                const latestCaseId = String(legalRows?.[0]?.caseId || '').trim();
                if (latestLegalAt) {
                    const def = await net.loadTreeLegalOwnerDefenseOnce({ ownerPub: pub, universeId });
                    const defAt = String(def?.latestLegalReportAt || '');
                    const needsOwner = !defAt || defAt < latestLegalAt;
                    if (needsOwner) {
                        const lk = `arborito-dir-legal-dispute-last-toast-v1:${pub}/${universeId}`;
                        let lastL = '';
                        try {
                            lastL = String(localStorage.getItem(lk) || '');
                        } catch {
                            lastL = '';
                        }
                        if (!lastL || String(latestLegalAt) > String(lastL)) {
                            try {
                                localStorage.setItem(lk, latestLegalAt);
                            } catch {
                                /* ignore */
                            }
                            const legalToast = (
                                store.ui.creatorLegalDisputeToast ||
                                'Legal notice on your tree (case {caseId}): you have about 48 hours to publish a signed owner response. Check the bell icon next to your profile. Until then the listing is deprioritized in Discover; without a response it is hidden from the in-app index only.'
                            ).replace(/\{caseId\}/g, latestCaseId || '—');
                            notifyAction(legalToast, false);
                            notified = true;
                        }
                    }
                }
            } catch {
                /* ignore */
            }
        }

        if (typeof net.listTreeReportsOnce === 'function') {
            const key = `arborito-dir-reports-last-notified-v1:${pub}/${universeId}`;
            let last = '';
            try {
                last = String(localStorage.getItem(key) || '');
            } catch {
                last = '';
            }

            const rows = await net.listTreeReportsOnce({ ownerPub: pub, universeId, max: 80 });
            const latestAt = String(rows?.[0]?.at || '');
            if (latestAt && (!last || String(latestAt) > String(last))) {
                try {
                    localStorage.setItem(key, latestAt);
                } catch {
                    /* ignore */
                }

                /* DSA Art. 17 statement of reasons: when the verified unique-
                 * reporter score reaches the directory hide threshold, tell the
                 * affected owner WHAT happened (visibility restricted in the
                 * in-app directory only), WHY (community reports policy, with
                 * the count of verified unique reporters), and the redress
                 * path. Below the threshold, the generic heads-up is enough. */
                const signals = computeReportSignalsFromRows(rows, { daysWindow: 14 });
                let appealThroughAt = '';
                if (typeof net.loadTreeDirectoryOwnerAppealOnce === 'function') {
                    try {
                        const appeal = await net.loadTreeDirectoryOwnerAppealOnce({ ownerPub: pub, universeId });
                        appealThroughAt = String(appeal?.reportsThroughAt || '');
                    } catch {
                        /* ignore */
                    }
                }
                const signalsAfterAppeal = appealThroughAt
                    ? computeReportSignalsFromRows(rows, {
                          daysWindow: 14,
                          ignoreBeforeAt: appealThroughAt,
                      })
                    : signals;
                let votes = 0;
                let used7 = 0;
                if (typeof net.countTreeVotesOnce === 'function') {
                    try {
                        votes = Number(await net.countTreeVotesOnce({ ownerPub: pub, universeId })) || 0;
                    } catch {
                        /* ignore */
                    }
                }
                if (typeof net.countTreeUsageUniqueLastNDaysOnce === 'function') {
                    try {
                        used7 =
                            Number(
                                await net.countTreeUsageUniqueLastNDaysOnce({
                                    ownerPub: pub,
                                    universeId,
                                    days: 7,
                                })
                            ) || 0;
                    } catch {
                        /* ignore */
                    }
                }
                const hideThr = computeReportHideThreshold({ votes, used7 });
                if (signalsAfterAppeal.score >= hideThr) {
                    const statement = (
                        store.ui.creatorDirectoryHiddenStatement ||
                        'Statement of reasons: score {score} / threshold {threshold} ({n} unique reporters in 14 days), so the in-app public directory no longer shows your tree to others (the tree itself stays on the network and direct links keep working). Redress: Trees → your row ⋯ → contest community reports or fix and republish; About → Legal to contact the operator.'
                    )
                        .replace('{n}', String(signalsAfterAppeal.unique))
                        .replace('{score}', String(signalsAfterAppeal.score))
                        .replace('{threshold}', String(hideThr));
                    notifyAction(statement, true);
                } else if (signalsAfterAppeal.score > 0) {
                    const reportsMsg = (
                        store.ui.creatorReportsToastProgress ||
                        'Community report score {score} / threshold {threshold} (14 days). Open Trees → your row ⋯ to contest or fix before the listing is hidden.'
                    )
                        .replace('{score}', String(signalsAfterAppeal.score))
                        .replace('{threshold}', String(hideThr));
                    notifyAction(reportsMsg, false);
                } else {
                    const n = Array.isArray(rows) ? rows.length : 1;
                    const reportsMsg =
                        n === 1
                            ? store.ui.creatorReportsToastOne ||
                              'Your tree received a recent directory report. Check Trees / reports if relevant.'
                            : (store.ui.creatorReportsToastMany ||
                                  'Your tree received {n} recent directory reports. Check Trees / reports if relevant.'
                              ).replace('{n}', String(n));
                    notifyAction(store.ui.creatorReportsToast || reportsMsg, false);
                }
                notified = true;
            }
        }

        if (notified) {
            void store.refreshCreatorModerationAlerts?.();
        }

        return notified;
    } catch {
        return notified;
    }
}

export async function maybeNotifyOwnerAboutUrgentUserInboxAction(source) {
    const store = getArboritoStore();
    if (!store) return false;
    try {
        if (!source || typeof source !== 'object') return false;
        if (String(source.origin || '') !== 'nostr') return false;
        const url = String(source.url || '');
        const ref = parseNostrTreeUrl(url);
        const pub = String(ref?.pub || '');
        const universeId = String(ref?.universeId || '');
        if (!pub || !universeId) return false;
        const pair = store.getNostrPublisherPair?.(pub);
        if (!pair?.priv) return false;
        const net = store.nostr;
        if (!net || typeof net.listTreeUrgentUserMessagesOnce !== 'function') return false;
        const rows = await net.listTreeUrgentUserMessagesOnce({ ownerPub: pub, universeId, max: 40 });
        const latestAt = String(rows?.[0]?.at || '');
        if (!latestAt) return false;
        const key = `arborito-dir-urgent-user-last-toast-v1:${pub}/${universeId}`;
        let last = '';
        try {
            last = String(localStorage.getItem(key) || '');
        } catch {
            last = '';
        }
        if (last && String(latestAt) <= String(last)) return false;
        try {
            localStorage.setItem(key, latestAt);
        } catch {
            /* ignore */
        }
        notifyAction(
            store.ui.creatorUrgentUserMessageToast ||
                'A visitor left an urgent signed message for you on the network (not the app operator). Open “Report this tree” from the readme or sources context to review network metadata if needed.',
            false
        );
        return true;
    } catch {
        return false;
    }
}

/** Store.prototype, directory report toasts. */
export const storeReportsMethods = {
    maybeNotifyOwnerAboutNewDirectoryReports: maybeNotifyOwnerAboutNewDirectoryReportsAction,
    maybeNotifyOwnerAboutUrgentUserInbox: maybeNotifyOwnerAboutUrgentUserInboxAction,
};

/** Publishing domain actions for hooks. */
export const publishingActions = {
    publishTreePublicInteractive: publishTreePublicInteractiveAction,
    revokePublicTreeInteractive: revokePublicTreeInteractiveAction,
    revokeActivePublicTreeInteractive: revokeActivePublicTreeInteractiveAction,
    publishComposedTreeToNostr: publishComposedTreeToNostrAction,
    offerLocalCopyFromNetworkTreeForEditing: offerLocalCopyFromNetworkTreeForEditingAction,
    openAuthorLicenseOverlay: openAuthorLicenseOverlayAction,
    closeAuthorLicenseOverlay: closeAuthorLicenseOverlayAction,
    hasAcceptedAuthorLicense: hasAcceptedAuthorLicenseAction,
    acceptAuthorLicense: acceptAuthorLicenseAction,
    cancelAuthorLicenseModal: cancelAuthorLicenseModalAction,
    downloadProgressFile: downloadProgressFileAction,
    importProgress: importProgressAction,
    maybeNotifyOwnerAboutNewDirectoryReports: maybeNotifyOwnerAboutNewDirectoryReportsAction,
    maybeNotifyOwnerAboutUrgentUserInbox: maybeNotifyOwnerAboutUrgentUserInboxAction,
    dismissModal: dismissModalAction,
};

function bucketForPath(store, path, bucketCount) {
    const n = Math.max(1, Math.min(256, Number(bucketCount) || 64));
    const hex = typeof store.computeHash === 'function' ? String(store.computeHash(String(path)) || '') : '';
    const b = hex && hex.length >= 2 ? parseInt(hex.slice(0, 2), 16) : 0;
    return b % n;
}

async function fetchJsonTextForPublish(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    let text = await res.text();
    if (text && text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return String(text || '');
}

async function collectAllApiAndContentPathsForPublish(store) {
    const raw = store.state.rawGraphData;
    const srcUrl = String(store.state.activeSource?.url || '');
    const baseDir = srcUrl.substring(0, srcUrl.lastIndexOf('/') + 1);
    const apiPaths = new Set();
    const contentPaths = new Set();

    const walkNode = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.apiPath) apiPaths.add(String(node.apiPath));
        if (node.contentPath) contentPaths.add(String(node.contentPath));
        if (Array.isArray(node.children)) node.children.forEach(walkNode);
    };
    if (raw?.languages) {
        for (const lang of Object.keys(raw.languages)) walkNode(raw.languages[lang]);
    }

    const queue = [...apiPaths];
    const seen = new Set(queue);
    while (queue.length) {
        const ap = queue.shift();
        const url = `${baseDir}nodes/${ap}.json`;
        let arr;
        try {
            const text = await fetchJsonTextForPublish(url);
            arr = JSON.parse(text.trim());
        } catch {
            continue;
        }
        if (!Array.isArray(arr)) continue;
        for (const ch of arr) {
            if (ch?.apiPath) {
                const cap = String(ch.apiPath);
                apiPaths.add(cap);
                if (!seen.has(cap)) {
                    seen.add(cap);
                    queue.push(cap);
                }
            }
            if (ch?.contentPath) contentPaths.add(String(ch.contentPath));
        }
    }

    return { baseDir, apiPaths: [...apiPaths], contentPaths: [...contentPaths] };
}

export async function prepareWebTorrentBucketsForActiveTreeAction() {
    const store = shell();
    if (!store?.webtorrent?.available?.()) return null;
    const srcUrl = String(store.state.activeSource?.url || '');
    if (!/^https?:\/\//i.test(srcUrl)) return null;
    const bucketCount = 64;
    const { baseDir, apiPaths, contentPaths } = await collectAllApiAndContentPathsForPublish(store);

    const nodeBuckets = {};
    const contentBuckets = {};
    for (let i = 0; i < bucketCount; i++) {
        nodeBuckets[String(i)] = [];
        contentBuckets[String(i)] = [];
    }

    for (const ap of apiPaths) {
        const rel = `nodes/${ap}.json`;
        const text = await fetchJsonTextForPublish(`${baseDir}${rel}`);
        const file = new File([new Blob([text], { type: 'application/json' })], rel, { type: 'application/json' });
        nodeBuckets[String(bucketForPath(store, rel, bucketCount))].push(file);
    }

    for (const cp of contentPaths) {
        const rel = `content/${cp}`;
        const text = await fetchJsonTextForPublish(`${baseDir}${rel}`);
        const file = new File([new Blob([text], { type: 'application/json' })], rel, { type: 'application/json' });
        contentBuckets[String(bucketForPath(store, rel, bucketCount))].push(file);
    }

    const nodesBuckets = {};
    const contentBucketsMagnets = {};
    for (let b = 0; b < bucketCount; b++) {
        const key = String(b);
        const files = nodeBuckets[key];
        if (files.length) {
            nodesBuckets[key] = await store.webtorrent.seedFiles({ key: `nodes-${key}`, files });
        }
        const cfiles = contentBuckets[key];
        if (cfiles.length) {
            contentBucketsMagnets[key] = await store.webtorrent.seedFiles({ key: `content-${key}`, files: cfiles });
        }
    }

    let searchPack = null;
    try {
        const raw = store.state.rawGraphData;
        if (raw?.languages) {
            const entries = [];
            for (const langCode of Object.keys(raw.languages)) {
                const root = raw.languages[langCode];
                entries.push(...flattenTreeSearchEntriesWithLessonBody(root, String(langCode).toUpperCase().slice(0, 8)));
            }
            searchPack = { version: 1, entries };
        }
    } catch {
        searchPack = null;
    }

    const meta = {
        mode: 'buckets-v1',
        bucketCount,
        nodesBuckets,
        contentBuckets: contentBucketsMagnets,
    };
    if (searchPack?.entries?.length) {
        const file = new File([new Blob([JSON.stringify(searchPack)], { type: 'application/json' })], 'search-pack.json', {
            type: 'application/json',
        });
        meta.searchMagnet = await store.webtorrent.seedFiles({ key: 'search-pack', files: [file] });
        meta.searchPackPath = 'search-pack.json';
    }
    return meta;
}

/** Store.prototype, WebTorrent buckets for publishing. */
export const webtorrentPublishMethods = {
    _bucketForPath(path, bucketCount) {
        return bucketForPath(shell(), path, bucketCount);
    },
    _fetchJsonText: fetchJsonTextForPublish,
    async _collectAllApiAndContentPathsForPublish() {
        return collectAllApiAndContentPathsForPublish(shell());
    },
    prepareWebTorrentBucketsForActiveTree: prepareWebTorrentBucketsForActiveTreeAction,
};
