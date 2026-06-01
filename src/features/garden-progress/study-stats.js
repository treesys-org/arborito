/**
 * Care metrics derived from memory + current tree.
 */

import { countCareDue, getCareDueNodeIds } from './care-reminders.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {import('../../core/store.js').default} store
 */
export function computeCareStats(store) {
    const memory = store.userStore.state.memory || {};
    const now = Date.now();
    const todayStart = now - DAY_MS;
    const dueIds = new Set(getCareDueNodeIds(store));

    let scheduled = 0;
    let healthSum = 0;
    let reviewedToday = 0;

    for (const [id, item] of Object.entries(memory)) {
        if (!item) continue;
        const node = store.findNode(id);
        if (!node) continue;
        scheduled += 1;
        const st = store.userStore.getMemoryStatus(id);
        healthSum += st.health;
        if (item.lastReview >= todayStart) reviewedToday += 1;
    }

    const due = countCareDue(store);

    return {
        due,
        scheduled,
        reviewedToday,
        inInterval: Math.max(0, scheduled - due),
        avgHealth: scheduled > 0 ? Math.round((healthSum / scheduled) * 100) : 100,
        dueIds
    };
}
