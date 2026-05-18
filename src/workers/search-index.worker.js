/**
 * Construye mapas de shards en segundo plano.
 * @see docs/SEARCH_INDEX_WORKER_PROTOCOL.md
 */
import { buildShardMapFromEntries } from '../utils/search-index-core.js';

self.onmessage = (ev) => {
    const data = ev.data || {};
    if (data.type === 'cancel') return;
    if (data.type !== 'build') return;
    const mySeq = typeof data.seq === 'number' ? data.seq : 0;
    const entries = Array.isArray(data.entries) ? data.entries : [];
    try {
        const shardMap = buildShardMapFromEntries(entries);
        self.postMessage({ type: 'done', seq: mySeq, shards: shardMap });
    } catch (err) {
        self.postMessage({
            type: 'error',
            seq: mySeq,
            message: err && err.message ? err.message : String(err)
        });
    }
};
