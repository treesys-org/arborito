import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useHookUi, useShellModalActions, useShellModalLang } from '../../../app/hooks/useHookShell.js';
import { useShellUiSlice } from '../../../stores/shell-ui-store.js';
import { useTreeGraphSlice } from '../../../stores/tree-graph-store.js';
import { useSourcesSlice } from '../../../stores/sources-store.js';
import { getArboritoStore } from '../../../core/store-singleton.js';
import { gardenProgressActions } from '../../../stores/garden-progress-store-actions.js';
import { arcadeActions } from '../../../stores/arcade-store-actions.js';
import { identityActions, getGamificationAction, getUserStoreAction } from '../../../stores/identity-store-actions.js';
import { treeGraphActions } from '../../../stores/tree-graph-store.js';
import { countCareDue, openArcadeCare } from '../api/care-reminders.js';
import { computeCareStats } from '../api/study-stats.js';

/** Jardín, logros, certificados, gamificación. */
export function useGardenProgress() {
    const ui = useHookUi();
    const { modal, lang } = useShellModalLang();
    const { viewMode, certificatesFromMobileMore } = useShellUiSlice((s) => s);
    const { data, rawGraphData, constructionMode } = useTreeGraphSlice(
        useShallow((s) => ({
            data: s.data,
            rawGraphData: s.rawGraphData,
            constructionMode: s.constructionMode,
        }))
    );
    const activeSource = useSourcesSlice((s) => s.activeSource);
    const { dismissModal, setModal, setViewMode, notify } = useShellModalActions();
    const singleton = getArboritoStore();

    const findNode = useCallback((id) => treeGraphActions.findNode(id), []);
    const getCareDueCount = useCallback(() => countCareDue(singleton), [singleton]);
    const getCareStats = useCallback(() => computeCareStats(singleton), [singleton]);
    const openArcadeCarePanel = useCallback(() => openArcadeCare(singleton), [singleton]);

    return {
        ui,
        modal,
        lang,
        data,
        rawGraphData,
        constructionMode,
        activeSource,
        gardenProgressActions,
        viewMode,
        certificatesFromMobileMore,
        gamification: getGamificationAction(),
        userStore: getUserStoreAction(),
        loadTreeRanking: arcadeActions.loadTreeRanking,
        buyGardenShopItem: arcadeActions.buyGardenShopItem,
        equipGardenShopItem: arcadeActions.equipGardenShopItem,
        unequipGardenShopItem: arcadeActions.unequipGardenShopItem,
        setRankingOptIn: arcadeActions.setRankingOptIn,
        grantNetworkSocialConsent: identityActions.grantNetworkSocialConsent,
        needsNetworkSocialConsent: identityActions.needsNetworkSocialConsent,
        dismissModal,
        setModal,
        setViewMode,
        notify,
        findNode,
        getBookmark: gardenProgressActions.getBookmark,
        getCareDueCount,
        getCareStats,
        openArcadeCare: openArcadeCarePanel,
        dailyXpGoal: singleton?.dailyXpGoal,
        store: singleton,
    };
}

export function useGardenProgressStore() {
    return gardenProgressActions;
}
