import { getArboritoStore } from '../core/store-singleton.js';
import {
    buyGardenShopItemAction,
    equipGardenShopItemAction,
    loadTreeRankingAction,
    setRankingOptInAction,
    unequipGardenShopItemAction,
} from './garden-progress-store-actions.js';
import { treeGraphActions } from './tree-graph-store.js';
import { learningActions } from './learning-store.js';
import { nostrDomainActions } from './nostr-store-actions.js';
import { shellUiActions } from './shell-ui-store-actions.js';

function shell() {
    return getArboritoStore();
}

export {
    loadTreeRankingAction,
    buyGardenShopItemAction,
    equipGardenShopItemAction,
    unequipGardenShopItemAction,
    setRankingOptInAction,
};

export function getArcadeStorageAction() {
    return shell()?.storage ?? null;
}

export function getArcadeUserStoreAction() {
    return shell()?.userStore ?? null;
}

/** Arcade / garden / minigame actions for hooks. */
export const arcadeActions = {
    loadTreeRanking: loadTreeRankingAction,
    buyGardenShopItem: buyGardenShopItemAction,
    equipGardenShopItem: equipGardenShopItemAction,
    unequipGardenShopItem: unequipGardenShopItemAction,
    setRankingOptIn: setRankingOptInAction,
    loadNodeChildren: treeGraphActions.loadNodeChildren,
    findNode: treeGraphActions.findNode,
    loadNodeContent: learningActions.loadNodeContent,
    initSage: learningActions.initSage,
    addXP: (amount, silent) => shell()?.addXP?.(amount, silent),
    getActivePublicTreeRef: nostrDomainActions.getActivePublicTreeRef,
    getNetworkUserPair: nostrDomainActions.getNetworkUserPair,
    showDialog: shellUiActions.showDialog,
    confirm: shellUiActions.confirm,
    getStorage: getArcadeStorageAction,
    getUserStore: getArcadeUserStoreAction,
    addEventListener: (...args) => shell()?.addEventListener?.(...args),
    removeEventListener: (...args) => shell()?.removeEventListener?.(...args),
};
