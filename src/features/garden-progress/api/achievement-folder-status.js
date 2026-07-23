import { getArboritoStore } from '../../../core/store-singleton.js';
import { isSubtreeComplete } from './certificate-entries.js';

/** Whether the learner earned the optional folder achievement (all lessons done). */
export function isFolderAchievementEarned(node) {
    if (!node) return false;
    const completed = getArboritoStore()?.userStore?.state?.completedNodes;
    const set = completed instanceof Set ? completed : new Set(completed || []);
    return isSubtreeComplete(node, set);
}
