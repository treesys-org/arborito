/** True while the user is actively touching/dragging the mobile tree trunk. */
let userGesturing = false;
let gestureEndTimer = 0;

const GESTURE_COOLDOWN_MS = 120;

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

export function markTrunkGestureStart() {
    userGesturing = true;
    if (gestureEndTimer) {
        clearTimeout(gestureEndTimer);
        gestureEndTimer = 0;
    }
}

/** Keep gesture alive during an active finger drag (capture-phase touchmove). */
export function markTrunkGestureMove() {
    if (!userGesturing) userGesturing = true;
    if (gestureEndTimer) {
        clearTimeout(gestureEndTimer);
        gestureEndTimer = 0;
    }
}

/** Extend cooldown while momentum scroll continues after touchend. */
export function markTrunkGestureScroll() {
    if (!userGesturing) return;
    armGestureCooldown();
}

export function markTrunkGestureEnd() {
    if (!userGesturing) return;
    armGestureCooldown();
}
