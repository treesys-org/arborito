import {
    _revokePublicTreeCoreAction,
    revokePublicTreeInteractiveAction,
    revokeActivePublicTreeInteractiveAction,
} from './publishing-revoke-store-actions.js';
import {
    publishActiveTreeToNostrUniverseAction,
    publishComposedTreeToNostrAction,
} from './publishing-publish-universe-store-actions.js';
import {
    publishTreePublicInteractiveAction,
    offerLocalCopyFromNetworkTreeForEditingAction,
} from './publishing-publish-interactive-store-actions.js';

import {
    touchPublishedInactivityActivityAction,
    checkPublishedInactivityAutoRetractAction,
} from './publishing-inactivity-store-actions.js';
import {
    repairPublishedBranchAction,
    repairPublishedComposedTreeAction,
} from './publishing-repair-store-actions.js';

export {
    _revokePublicTreeCoreAction,
    publishActiveTreeToNostrUniverseAction,
    publishTreePublicInteractiveAction,
    revokePublicTreeInteractiveAction,
    revokeActivePublicTreeInteractiveAction,
    offerLocalCopyFromNetworkTreeForEditingAction,
    publishComposedTreeToNostrAction,
    repairPublishedBranchAction,
    repairPublishedComposedTreeAction,
};

/** Tree publish and revoke methods on `Store.prototype`. */
export const publishRevokeMethods = {
    _revokePublicTreeCore: _revokePublicTreeCoreAction,
    publishActiveTreeToNostrUniverse: publishActiveTreeToNostrUniverseAction,
    publishTreePublicInteractive: publishTreePublicInteractiveAction,
    revokePublicTreeInteractive: revokePublicTreeInteractiveAction,
    revokeActivePublicTreeInteractive: revokeActivePublicTreeInteractiveAction,
    offerLocalCopyFromNetworkTreeForEditing: offerLocalCopyFromNetworkTreeForEditingAction,
    publishComposedTreeToNostr: publishComposedTreeToNostrAction,
    touchPublishedInactivityActivity: touchPublishedInactivityActivityAction,
    checkPublishedInactivityAutoRetract: checkPublishedInactivityAutoRetractAction,
    repairPublishedBranch: repairPublishedBranchAction,
    repairPublishedComposedTree: repairPublishedComposedTreeAction,
};
