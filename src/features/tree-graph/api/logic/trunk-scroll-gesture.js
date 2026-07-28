/** True while the user is actively dragging/momentum-scrolling the mobile tree trunk. */
let userGesturing = false;
let gestureEndTimer = 0;
/** >0 while path sync / clamp writes scrollTop — those must not look like finger pans. */
let programmaticScrollDepth = 0;

/* Long enough to cover momentum on tall trunks (Linux-sized paths). */
const GESTURE_COOLDOWN_MS = 320;

function armGestureCooldown() {
    if (gestureEndTimer) clearTimeout(gestureEndTimer);
    gestureEndTimer = setTimeout(() => {
        userGesturing = false;
        gestureEndTimer = 0;
    }, GESTURE_COOLDOWN_MS);
}

export function isTrunkUserGesturing() {
    return userGesturing;
}

/**
 * Wrap programmatic trunk scrollTop writes so the scroll listener does not
 * treat them as a finger pan (that used to skip the next path sync after Back).
 */
export function beginProgrammaticTrunkScroll() {
    programmaticScrollDepth += 1;
}

export function endProgrammaticTrunkScroll() {
    queueMicrotask(() => {
        programmaticScrollDepth = Math.max(0, programmaticScrollDepth - 1);
    });
}

/** Keep gesture alive during an active finger drag (capture-phase touchmove). */
export function markTrunkGestureMove() {
    if (!userGesturing) userGesturing = true;
    if (gestureEndTimer) {
        clearTimeout(gestureEndTimer);
        gestureEndTimer = 0;
    }
}

/** Keep clamps suppressed while momentum scroll continues after touchend. */
export function markTrunkGestureScroll() {
    if (programmaticScrollDepth > 0) return;
    userGesturing = true;
    armGestureCooldown();
}

export function markTrunkGestureEnd() {
    if (!userGesturing) return;
    armGestureCooldown();
}

/** Force-clear (e.g. after lesson overlay closes mid-gesture / swallowed touchend). */
export function resetTrunkUserGesture() {
    if (gestureEndTimer) {
        clearTimeout(gestureEndTimer);
        gestureEndTimer = 0;
    }
    userGesturing = false;
}
