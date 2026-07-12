/**
 * Groups store prototype method bundles by domain, applied at boot via `attach-actions.js`.
 *
 * **Rule:** import prototype bundles from `stores/` only. Logic lives in `*-store-actions.js`.
 */
import { mountBundleMethods } from './sources-store-actions.js';
import { storeSourceResolveMethods } from './sources-resolve-store-actions.js';
import { nostrGraphCurriculumMethods } from './tree-graph-curriculum-store-actions.js';
import { storeGraphUiMethods } from './tree-graph-store-actions.js';
import { storeGraphActionsMethods } from './tree-graph-actions-store-actions.js';
import {
    storeNostrSyncProgressMethods,
    storeProgressCertificatesMethods,
    gardenGamificationMethods,
} from './garden-progress-store-actions.js';
import { storeNostrCommunityMethods } from './nostr-community-store-actions.js';
import { storeConstructionUndoMethods } from './editor-construction-undo-store-actions.js';
import { userProgressBundleMethods } from './garden-user-progress-store-actions.js';
import {
    storePresenceMethods,
    storeAccountEscrowClientMethods,
} from './identity-store-actions.js';
import { storeIdentityAuthMethods } from './identity-auth-store-actions.js';
import { storeSyncLoginMethods } from './identity-sync-login-store-actions.js';
import { storeAccountRestoreMethods } from './identity-account-restore-store-actions.js';
import { storeNavigationSearchMethods } from './navigation-store-actions.js';
import { storeLearningSageMethods, storeLearningContentMethods } from './learning-store-actions.js';
import { storeGdprConsentMethods } from './privacy-gdpr-store-actions.js';
import { storeForestMethods } from './sources-forest-store-actions.js';
import { publishRevokeMethods } from './publishing-publish-revoke-store-actions.js';
import { storeNostrForumMethods } from './forum-nostr-store-actions.js';
import {
    storeReportsMethods,
    storeLicenseMethods,
    storeImportExportMethods,
    webtorrentPublishMethods,
} from './publishing-store-actions.js';
import { creatorModerationAlertsMethods } from './creator-moderation-alerts-store-actions.js';
import { nostrAdminGovernanceMethods } from './nostr-store-actions.js';

export const sourcesBundles = [mountBundleMethods, storeSourceResolveMethods];

export const treeGraphBundles = [
    nostrGraphCurriculumMethods,
    storeGraphUiMethods,
    storeGraphActionsMethods,
];

export const gardenProgressBundles = [
    storeNostrSyncProgressMethods,
    userProgressBundleMethods,
    gardenGamificationMethods,
    storeProgressCertificatesMethods,
];

export const nostrNetworkBundles = [
    storeNostrCommunityMethods,
    storeNostrForumMethods,
    nostrAdminGovernanceMethods,
];

export const identityBundles = [
    storeIdentityAuthMethods,
    storeSyncLoginMethods,
    storeAccountRestoreMethods,
    storeAccountEscrowClientMethods,
    storePresenceMethods,
];

export const learningAndNavBundles = [
    storeLearningSageMethods,
    storeLearningContentMethods,
    storeNavigationSearchMethods,
];

export const publishingBundles = [
    publishRevokeMethods,
    webtorrentPublishMethods,
    storeImportExportMethods,
    storeReportsMethods,
    storeLicenseMethods,
    creatorModerationAlertsMethods,
];

export const editorBundles = [storeConstructionUndoMethods];

export const miscBundles = [storeGdprConsentMethods, storeForestMethods];

/** Application order on Store.prototype (historical monolith order). */
export const allStoreActionBundles = [
    ...sourcesBundles,
    ...treeGraphBundles,
    ...gardenProgressBundles,
    ...nostrNetworkBundles,
    ...editorBundles,
    ...identityBundles,
    ...learningAndNavBundles,
    ...publishingBundles,
    ...miscBundles,
];
