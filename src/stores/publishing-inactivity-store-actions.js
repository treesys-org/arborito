import { getArboritoStore } from '../core/store-singleton.js';
import { parseNostrTreeUrl, formatNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';
import { ensureConnectedNostr } from '../shared/lib/connected-services/index.js';
import {
    bumpInactivityPolicy,
    getInactivityPolicyFromMeta,
    isInactivityExpired,
} from '../features/publishing/api/inactivity-lifetime.js';
import { isPublishedResourceOwner } from '../features/publishing/api/published-owner.js';

function shell() {
    return getArboritoStore();
}

async function learnerActiveToday(store, ownerPub, universeId) {
    try {
        const net = store.nostr;
        if (!net || typeof net.countTreeUsageUniqueLastNDaysOnce !== 'function') return false;
        const used1 = await net.countTreeUsageUniqueLastNDaysOnce({
            ownerPub,
            universeId,
            days: 1,
            maxUsersPerDay: 200,
        });
        return Number(used1) > 0;
    } catch {
        return false;
    }
}

/**
 * Owner opened a published copy, bump local policy; republish meta when stale (>7d since last bump).
 * @param {import('../core/store.js').Store} store
 * @param {object | null | undefined} source
 */
export async function touchPublishedInactivityActivityAction(source) {
    const store = shell();
    if (!store || !source) return;
    const url = String(source.url || '').trim();
    let treeRef = parseNostrTreeUrl(url);
    let localBranchId = null;
    let localTreeId = null;

    if (url.startsWith('branch://')) {
        localBranchId = url.slice('branch://'.length);
        const entry = store.userStore?.state?.branches?.find((t) => t.id === localBranchId);
        const pubUrl = String(entry?.publishedNetworkUrl || '').trim();
        if (!pubUrl) return;
        treeRef = parseNostrTreeUrl(pubUrl);
    } else if (source.type === 'composed-tree' && source.treeId) {
        localTreeId = String(source.treeId);
        const entry = store.userStore?.getTree?.(localTreeId);
        const pubUrl = String(entry?.publishedNetworkUrl || '').trim();
        if (!pubUrl) return;
        treeRef = parseNostrTreeUrl(pubUrl);
    }

    if (!treeRef?.pub || !treeRef?.universeId) return;
    if (!store.getNostrPublisherPair(treeRef.pub)?.priv) return;

    const raw = store.state.rawGraphData;
    if (!raw?.meta) return;

    const prev = getInactivityPolicyFromMeta(raw.meta);
    const now = Date.now();
    const stale = !prev || now - (prev.lastActivityAt || 0) > 7 * 86400000;
    if (!stale) return;

    raw.meta.inactivityPolicy = bumpInactivityPolicy(prev, now);
    if (localBranchId) {
        const entry = store.userStore.state.branches.find((t) => t.id === localBranchId);
        if (entry) entry.publishedInactivityPolicy = raw.meta.inactivityPolicy;
        store.userStore.persist?.();
    }
    if (localTreeId) {
        const entry = store.userStore.getTree(localTreeId);
        if (entry) entry.publishedInactivityPolicy = raw.meta.inactivityPolicy;
        store.userStore.persist?.();
    }

    try {
        await ensureConnectedNostr(store);
        const active = await learnerActiveToday(store, treeRef.pub, treeRef.universeId);
        if (active) {
            raw.meta.inactivityPolicy = bumpInactivityPolicy(raw.meta.inactivityPolicy, now);
        }
        await store.publishActiveTreeToNostrUniverse({
            reuseNostrTreeUrl: formatNostrTreeUrl(treeRef.pub, treeRef.universeId),
            includeForum: !!raw.meta.forumEnabled,
        });
    } catch (e) {
        console.warn('touchPublishedInactivityActivity republish failed', e);
    }
}

/** Scan owned published branches/trees; auto-retract when inactivity timer expired. */
export async function checkPublishedInactivityAutoRetractAction() {
    const store = shell();
    if (!store || !store.nostr) return;
    try {
        await ensureConnectedNostr(store, { timeoutMs: 8000 });
    } catch {
        return;
    }

    const candidates = [];
    for (const b of store.userStore?.state?.branches || []) {
        if (b?.publishedNetworkUrl && isPublishedResourceOwner(b, store.getNostrPublisherPair.bind(store))) {
            candidates.push({ url: b.publishedNetworkUrl, branchId: b.id, policy: b.publishedInactivityPolicy });
        }
    }
    for (const t of store.userStore?.state?.trees || []) {
        if (t?.publishedNetworkUrl && isPublishedResourceOwner(t, store.getNostrPublisherPair.bind(store))) {
            candidates.push({ url: t.publishedNetworkUrl, treeId: t.id, policy: t.publishedInactivityPolicy });
        }
    }

    for (const c of candidates) {
        const ref = parseNostrTreeUrl(String(c.url));
        if (!ref) continue;
        let policy = c.policy;
        if (!policy && store.state.rawGraphData) {
            policy = getInactivityPolicyFromMeta(store.state.rawGraphData.meta);
        }
        if (!policy) continue;
        const active = await learnerActiveToday(store, ref.pub, ref.universeId);
        if (!isInactivityExpired(policy, { learnerActiveToday: active })) continue;
        try {
            await store._revokePublicTreeCore(ref, {
                branchIdToUnlink: c.branchId || null,
                treeIdToUnlink: c.treeId || null,
                skipConfirm: true,
                silent: true,
            });
            const ui = store.ui || {};
            store.notify(
                ui.treeInactivityAutoRetracted ||
                    'An unused public copy was retracted automatically (GDPR inactivity policy).',
                false
            );
        } catch (e) {
            console.warn('auto-retract inactivity failed', e);
        }
    }
}
