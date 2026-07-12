import { useDockModalChrome } from '../../../shared/ui/breakpoints.js';

/** Context to restore when game-player closes back into arcade. */
export function buildArcadeReturnContext({
    dockEmbed = false,
    activeTab,
} = {}) {
    const ctx = {
        dockUi: dockEmbed || useDockModalChrome(),
    };
    if (activeTab === 'games' || activeTab === 'garden' || activeTab === 'storage') {
        ctx.initialTab = activeTab;
    }
    return ctx;
}

/** Modal payload after closing game-player, keeps dock hub routing on mobile. */
export function resolveArcadeReturnModal(gamePlayerModal) {
    const back = gamePlayerModal?.returnArcade;
    if (back && typeof back === 'object') {
        return { type: 'arcade', ...back };
    }
    return { type: 'arcade', dockUi: useDockModalChrome() };
}
