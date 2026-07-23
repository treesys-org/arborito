import { useEffect, useState } from 'react';
import {
    branchShareCode,
    composedTreeShareCode,
    hydratePublishedShareCode,
    shareCodeFromActiveSource,
    shareOptsForPublishedBranch,
    shareOptsForPublishedComposedTree,
} from '../api/published-share-context.js';

/** Resolve + optionally hydrate missing share codes for a library row. */
export function usePublishedShareCode({ entry, kind = 'branch', rawGraphData, activeSource } = {}) {
    const readCode = () => {
        const fromEntry = kind === 'composed-tree' ? composedTreeShareCode(entry) : branchShareCode(entry);
        if (fromEntry) return fromEntry;
        return shareCodeFromActiveSource(activeSource, rawGraphData);
    };
    const readOpts = () =>
        kind === 'composed-tree'
            ? shareOptsForPublishedComposedTree(entry, { rawGraphData, activeSource })
            : shareOptsForPublishedBranch(entry, { rawGraphData, activeSource });

    const [shareCode, setShareCode] = useState(() => readCode());
    const [shareOpts, setShareOpts] = useState(() => readOpts());
    const [loading, setLoading] = useState(() => !!entry?.publishedNetworkUrl && !readCode());

    useEffect(() => {
        const code = readCode();
        const opts = readOpts();
        setShareCode(code);
        setShareOpts(opts);
        if (code || !entry?.publishedNetworkUrl) {
            setLoading(false);
            return undefined;
        }
        let cancelled = false;
        setLoading(true);
        void hydratePublishedShareCode(entry, { kind }).then((hydrated) => {
            if (cancelled) return;
            setLoading(false);
            if (hydrated) {
                setShareCode(String(hydrated).trim());
                setShareOpts(readOpts());
            }
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        entry?.id,
        entry?.publishedNetworkUrl,
        entry?.publishedShareCode,
        entry?.data?.meta?.shareCode,
        kind,
        rawGraphData?.meta?.shareCode,
        activeSource?.shareCode,
    ]);

    return { shareCode, shareOpts, loading };
}
