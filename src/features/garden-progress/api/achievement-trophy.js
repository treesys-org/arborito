/** Trophy vignette for achievements, gray while in progress, gold when earned. */
export const ACHIEVEMENT_TROPHY_EMOJI = '🏆';

export function achievementTrophyToneClass(isComplete) {
    return isComplete
        ? 'arborito-achievement-trophy arborito-achievement-trophy--earned'
        : 'arborito-achievement-trophy arborito-achievement-trophy--locked';
}

export function mochilaTrophyToneClass(isComplete) {
    return isComplete ? 'mochila-v2__trophy--earned' : 'mochila-v2__trophy--locked';
}
