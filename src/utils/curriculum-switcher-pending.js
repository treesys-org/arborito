/** Marks that after the next full loadData we should open the unified curriculum switcher overlay. */

const KEY = 'arborito-pending-curriculum-switcher';

export function markPendingCurriculumSwitcher() {
    try {
        sessionStorage.setItem(KEY, '1');
    } catch {
        /* ignore */
    }
}

export function consumePendingCurriculumSwitcher() {
    try {
        if (sessionStorage.getItem(KEY) === '1') {
            sessionStorage.removeItem(KEY);
            return true;
        }
    } catch {
        /* ignore */
    }
    return false;
}

