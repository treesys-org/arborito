/** Max simultaneous bucket swarms (64 buckets on a giant tree, never attach all at once). */
export const WEBTORRENT_SEED_MAX_SWARMS = 8;

/** Buckets to attach per rotation step. */
export const WEBTORRENT_SEED_BATCH_SIZE = 2;

/** Ms between adding the next batch (limits background download on metered links). */
export const WEBTORRENT_SEED_ROTATE_MS = 3 * 60 * 1000;

/**
 * @param {object|null|undefined} rawGraphData
 * @returns {string[]}
 */
export function collectWebTorrentMagnets(rawGraphData) {
    const wt = rawGraphData?.meta?.webtorrent;
    if (!wt || typeof wt !== 'object' || wt.mode !== 'buckets-v1') return [];
    const nodes = wt.nodesBuckets && typeof wt.nodesBuckets === 'object' ? wt.nodesBuckets : {};
    const content = wt.contentBuckets && typeof wt.contentBuckets === 'object' ? wt.contentBuckets : {};
    const magnets = [
        ...Object.values(nodes).map((s) => String(s || '').trim()).filter(Boolean),
        ...Object.values(content).map((s) => String(s || '').trim()).filter(Boolean),
    ];
    return [...new Set(magnets)];
}

function clearRotationTimer(store) {
    if (store._webtorrentSeederRotateTimer) {
        clearInterval(store._webtorrentSeederRotateTimer);
        store._webtorrentSeederRotateTimer = null;
    }
}

/**
 * Rotating seeder: attach a few bucket magnets at a time so a giant tree (dozens–hundreds of MB
 * across 64 buckets) does not pull the full course over mobile data in one shot.
 * @param {import('../../../core/store-singleton.js').ArboritoStore} store
 */
export async function startRotatingWebTorrentSeeder(store) {
    if (!store?.webtorrent?.available?.()) return false;

    const magnets = collectWebTorrentMagnets(store.state.rawGraphData);
    if (!magnets.length) return false;

    clearRotationTimer(store);

    /** @type {Set<string>} */
    const attached = new Set();
    let cursor = 0;

    const attachBatch = async () => {
        if (attached.size >= WEBTORRENT_SEED_MAX_SWARMS) return;
        const batch = [];
        while (batch.length < WEBTORRENT_SEED_BATCH_SIZE && cursor < magnets.length) {
            const m = magnets[cursor++];
            if (!attached.has(m)) {
                batch.push(m);
                attached.add(m);
            }
        }
        if (!batch.length) {
            clearRotationTimer(store);
            return;
        }
        for (const m of batch) {
            try {
                await store.webtorrent.ensureAdded({ magnet: m });
            } catch {
                /* ignore per-bucket failure */
            }
        }
        let peers = 0;
        for (const m of attached) {
            try {
                const st = await store.webtorrent.getStats({ magnet: m });
                peers += st?.numPeers || 0;
            } catch {
                /* ignore */
            }
        }
        store.update({
            webtorrentSeeder: {
                running: true,
                total: magnets.length,
                done: attached.size,
                peers,
                startedAt: store.state.webtorrentSeeder?.startedAt || Date.now(),
                rotate: true,
            },
        });
        if (cursor >= magnets.length && attached.size >= Math.min(magnets.length, WEBTORRENT_SEED_MAX_SWARMS)) {
            clearRotationTimer(store);
        }
    };

    store.update({
        webtorrentSeeder: {
            running: true,
            total: magnets.length,
            done: 0,
            peers: 0,
            startedAt: Date.now(),
            rotate: true,
        },
    });

    await attachBatch();

    if (cursor < magnets.length) {
        store._webtorrentSeederRotateTimer = setInterval(() => {
            void attachBatch();
        }, WEBTORRENT_SEED_ROTATE_MS);
    }

    return true;
}

/** @param {import('../../../core/store-singleton.js').ArboritoStore} store */
export function stopRotatingWebTorrentSeeder(store) {
    if (!store) return;
    clearRotationTimer(store);
    try {
        store.webtorrent?.stopAll?.();
    } catch {
        /* ignore */
    }
    store.update({
        webtorrentSeeder: { running: false, total: 0, done: 0, peers: 0, stoppedAt: Date.now() },
    });
}
