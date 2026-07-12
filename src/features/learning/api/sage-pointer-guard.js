/** Suppress Sage outside-dismiss / close during the same pointer sequence as mode toggles. */

let guardUntil = 0;
let guardClassTimer = null;
let settingsDismissBlockedUntil = 0;

function syncGuardClass() {
    if (typeof document === 'undefined') return;
    const on = Date.now() < guardUntil;
    document.documentElement.classList.toggle('arborito-sage-pointer-guard', on);
}

export function armSagePointerGuard(ms = 800) {
    const dur = Math.max(0, Number(ms) || 0);
    guardUntil = Date.now() + dur;
    syncGuardClass();
    if (guardClassTimer) clearTimeout(guardClassTimer);
    guardClassTimer = setTimeout(() => {
        guardClassTimer = null;
        syncGuardClass();
    }, dur + 16);
}

export function isSagePointerGuarded() {
    return Date.now() < guardUntil;
}

/** Block settings backdrop / back from closing during the open click sequence. */
export function armSageSettingsDismissBlock(ms = 700) {
    settingsDismissBlockedUntil = Date.now() + Math.max(0, Number(ms) || 0);
}

export function isSageSettingsDismissBlocked() {
    return Date.now() < settingsDismissBlockedUntil;
}

/** Block FAB / dock owl from toggling Sage closed right after a mode switch tap. */
export function shouldBlockSageChromeToggle() {
    return isSagePointerGuarded();
}
