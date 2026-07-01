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

export {
    _revokePublicTreeCoreAction,
    publishActiveTreeToNostrUniverseAction,
    publishTreePublicInteractiveAction,
    revokePublicTreeInteractiveAction,
    revokeActivePublicTreeInteractiveAction,
    offerLocalCopyFromNetworkTreeForEditingAction,
    publishComposedTreeToNostrAction,
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
};
