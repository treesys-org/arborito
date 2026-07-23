import { useMemo } from 'react';
import { computePublishDiffState } from '../api/publish-diff-state.js';

/** Publish diff between branch baseline and current draft (construction about modal). */
export function usePublishDiffState(modal, activeSource, rawGraphData, userStore) {
    return useMemo(
        () => computePublishDiffState(modal, activeSource, rawGraphData, userStore),
        [modal, activeSource, rawGraphData, userStore]
    );
}
