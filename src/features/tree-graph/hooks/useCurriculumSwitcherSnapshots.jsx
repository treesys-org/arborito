import { useEffect } from 'react';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { _ensureLocalSnapshotsLoaded } from '../../version-updates/api/version-timeline.js';
import { _ensureSnapshotsAdminLoaded } from '../../version-updates/api/snapshots-admin.js';

/** Lazy-load snapshot admin modules when curriculum switcher opens. */
export function useCurriculumSwitcherSnapshots(actionCtx, { isLocal, isComposed }) {
    useEffect(() => {
        if (!actionCtx) return undefined;
        void _ensureSnapshotsAdminLoaded(actionCtx);
        if (
            isLocal ||
            (isComposed && fileSystem.isLocalComposedTree() && fileSystem.activeComposedBranchId())
        ) {
            void _ensureLocalSnapshotsLoaded(actionCtx);
        }
        return undefined;
    }, [actionCtx, isLocal, isComposed]);
}
