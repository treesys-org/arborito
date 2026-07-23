import { useEffect, useState } from 'react';
import {
    MODAL_EXPORT_NAMES,
    EAGER_MODAL_TYPES,
    chunkIsReady,
    ensureModalChunk,
    resolveModalChunkComponent,
} from '../modal-chunk-loaders.js';
import { EAGER_MODALS } from '../components/eager-modals.js';

function needsLazyChunk(type) {
    const key = String(type || '');
    return !!(key && MODAL_EXPORT_NAMES[key] && !EAGER_MODAL_TYPES.has(key));
}

function resolveComponent(type) {
    const key = String(type || '');
    if (!key) return null;
    return EAGER_MODALS[key] || resolveModalChunkComponent(key) || null;
}

/**
 * Shared modal chunk gate, skips spinner when chunk is already cached.
 * @param {string | null | undefined} type
 * @param {string} [depKey], optional remount key (e.g. route.suspenseKey)
 */
export function useModalChunk(type, depKey) {
    const gateType = String(type || '');
    const needsChunk = needsLazyChunk(gateType);
    const [ready, setReady] = useState(() => !needsChunk || chunkIsReady(gateType));

    useEffect(() => {
        if (!needsChunk) {
            setReady(true);
            return undefined;
        }
        if (chunkIsReady(gateType)) {
            setReady(true);
            return undefined;
        }

        let cancelled = false;
        setReady(false);
        void (async () => {
            try {
                await ensureModalChunk(gateType);
            } catch {
                /* caller surfaces load errors */
            }
            if (!cancelled) setReady(true);
        })();

        return () => {
            cancelled = true;
        };
    }, [depKey, gateType, needsChunk]);

    return {
        ready,
        Component: ready ? resolveComponent(gateType) : null,
        chunkType: gateType || null,
        needsChunk,
    };
}
