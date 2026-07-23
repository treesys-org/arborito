import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { getVitalityPct, getVitalityLabel } from './garden-stage.js';
import { getAvailableLumens } from './lumen-shop.js';

/**
 * @param {object} ctx
 * @param {{ omitGardenBlock?: boolean, omitActions?: boolean, mobile?: boolean, modalFull?: boolean }} [layout]
 */
export function deriveWidgetBodyData(ctx, layout = {}) {
    const { omitGardenBlock = false, omitActions = false, mobile = false, modalFull = false } = layout;
    const { ui, g, stats, collectedItems, certsAll, dueCount, careStats, dailyGoalVal } = ctx;

    const earnedCerts = certsAll.filter((c) => c.isComplete);
    const trophyTotal = certsAll.length;
    const trophyEarned = earnedCerts.length;
    const seedPreview = collectedItems.slice(-12).reverse();
    const trophyPreview = certsAll.slice(-10).reverse();

    const lessonsLineTpl = ui.progressLessonsLine || '{lessons} lessons · {modules} modules';
    const lessonsLine = lessonsLineTpl
        .replace(/\{lessons\}/g, String(stats.completedLeaves))
        .replace(/\{modules\}/g, String(stats.completedModules));

    const careLine = [
        `${careStats.reviewedToday} ${ui.careReviewedToday || 'regados hoy'}`,
        `${careStats.inInterval} ${ui.careInInterval || 'en pausa'}`,
        `${careStats.avgHealth}% ${ui.careHealth || 'vitalidad'}`,
    ];

    const vitalityPct = getVitalityPct(g.dailyXP, dailyGoalVal || 50);
    const vitalityLabel = getVitalityLabel(vitalityPct, ui);
    const lumensBalance = getAvailableLumens(g);
    const shieldCount = g.streakShields || 0;
    const ringLabel = ui.progressRingLabel || 'Crecimiento';
    const tagline = ui.progressBackpackTagline || 'Lo que llevas en el bosque';
    const careEmptyHint =
        dueCount > 0 ? '' : ui.mochilaCareAllClear || ui.arcadeHealthyMsg || 'The forest is calm.';
    const seedsLabelResolved = ui.seedsTitle || ui.gardenTitle || 'Semillas';
    const careLabel = ui.arcadeTabCare || 'Cuidados';
    const waterLabel = ui.arcadeWaterBtn || 'Regar';
    const seedsLabel = ui.gardenTitle || ui.seedsTitle || 'Semillas';
    const progressTitle = ui.progressTitle || 'Tu mochila';

    return {
        omitGardenBlock,
        omitActions,
        mobile,
        modalFull,
        ui,
        g,
        stats,
        collectedItems,
        certsAll,
        dueCount,
        careStats,
        dailyGoalVal,
        earnedCerts,
        trophyTotal,
        trophyEarned,
        seedPreview,
        trophyPreview,
        lessonsLine,
        careLine,
        vitalityPct,
        vitalityLabel,
        lumensBalance,
        shieldCount,
        ringLabel,
        tagline,
        careEmptyHint,
        seedsLabelResolved,
        careLabel,
        waterLabel,
        seedsLabel,
        progressTitle,
        careCountClass: dueCount > 0 ? ' mochila-v2__card-count--due' : '',
        ringEmoji: stats.percentage >= 100 ? '🌳' : stats.percentage > 0 ? '🌿' : '🌱',
        seedsEmptyHint:
            trophyEarned === 0 && trophyTotal > 0
                ? ui.lockedCert || 'Not unlocked yet'
                : ui.progressNoAchievements || 'No achievements yet.',
        gardenEmptyHint: ui.gardenEmpty || 'Complete modules to collect seeds.',
    };
}

export function getProgressStats() {
    const modules = store.getModulesStatus();
    const totalLeaves = modules.reduce((acc, m) => acc + m.totalLeaves, 0);
    const completedLeaves = modules.reduce((acc, m) => acc + m.completedLeaves, 0);
    const completedModules = modules.filter((m) => m.isComplete).length;
    const percentage = totalLeaves === 0 ? 0 : Math.round((completedLeaves / totalLeaves) * 100);
    return { completedLeaves, completedModules, percentage, totalLeaves };
}
