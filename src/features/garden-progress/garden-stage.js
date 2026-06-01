/**
 * Derive garden / seed visual state from existing SRS memory (no extra persisted state).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MATURE_INTERVAL_DAYS = 30;

/** @typedef {'dormant'|'withered'|'sprout'|'healthy'|'mature'} SeedStage */

/**
 * @param {import('../../core/store.js').default} store
 * @param {string} moduleId
 * @returns {{ stage: SeedStage, emoji: string, healthPct: number }}
 */
function getModuleGardenState(store, moduleId) {
    const g = store.userStore.state.gamification;
    const seed = (g.seeds || []).find((s) => String(s.id) === String(moduleId));
    const icon = seed?.icon || '🌱';
    const memory = store.userStore.state.memory || {};
    const root = store.state.data;
    if (!root) return { stage: 'dormant', emoji: icon, healthPct: 100 };

    let worstHealth = 1;
    let anyDue = false;
    let maxInterval = 0;
    let hasMemory = false;

    const walk = (node) => {
        if (!node) return;
        if (node.type === 'leaf' || node.type === 'exam') {
            const mem = memory[node.id];
            if (mem) {
                hasMemory = true;
                const st = store.userStore.getMemoryStatus(node.id);
                if (st.isDue) anyDue = true;
                worstHealth = Math.min(worstHealth, st.health);
                maxInterval = Math.max(maxInterval, mem.interval || 0);
            }
        }
        if (Array.isArray(node.children)) node.children.forEach(walk);
    };

    const moduleNode = store.findNode(moduleId);
    if (moduleNode) walk(moduleNode);

    if (!seed && !hasMemory) return { stage: 'dormant', emoji: '🌰', healthPct: 0 };

    if (anyDue || worstHealth <= 0.15) {
        return { stage: 'withered', emoji: '🍂', healthPct: Math.round(worstHealth * 100) };
    }
    if (maxInterval >= MATURE_INTERVAL_DAYS && worstHealth > 0.6) {
        return { stage: 'mature', emoji: '🌳', healthPct: Math.round(worstHealth * 100) };
    }
    if (worstHealth >= 0.6) {
        return { stage: 'healthy', emoji: '🌿', healthPct: Math.round(worstHealth * 100) };
    }
    return { stage: 'sprout', emoji: '🌱', healthPct: Math.round(worstHealth * 100) };
}

/**
 * Vitality = daily photosynthesis progress. Theme-neutral (works light + dark).
 * @param {number} dailyXP
 * @param {number} [goal]
 */
export function getVitalityPct(dailyXP, goal = 50) {
    if (goal <= 0) return 0;
    return Math.min(100, Math.round((Math.max(0, dailyXP) / goal) * 100));
}

/**
 * @param {number} pct
 * @param {Record<string, string>} ui
 */
export function getVitalityLabel(pct, ui) {
    if (pct >= 100) return ui.gardenVitalityRadiant || 'Radiante';
    if (pct >= 75) return ui.gardenVitalityBright || 'Luminoso';
    if (pct >= 50) return ui.gardenVitalityWarm || 'Cálido';
    if (pct >= 25) return ui.gardenVitalityDawn || 'Amanecer';
    if (pct > 0) return ui.gardenVitalitySeedling || 'Brote';
    return ui.gardenVitalityRest || 'Reposo';
}

/**
 * @param {import('../../core/store.js').default} store
 * @param {Record<string, string>} ui
 */
export function buildGardenPlotItems(store, ui) {
    const seeds = store.userStore.state.gamification.seeds || [];
    return seeds.map((seed) => {
        const st = getModuleGardenState(store, seed.id);
        const node = store.findNode(seed.id);
        const name = node?.name || seed.id;
        return { ...seed, ...st, name };
    });
}
