/** True while the user is actively touching/dragging the mobile tree trunk. */
let userGesturing = false;
let gestureEndTimer = 0;

/* Long enough to cover layout RAF clamps after lift; short enough not to block path sync. */
const GESTURE_COOLDOWN_MS = 280;

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

/** Force-clear (e.g. after lesson overlay closes mid-gesture / swallowed touchend). */
export function resetTrunkUserGesture() {
    if (gestureEndTimer) {
        clearTimeout(gestureEndTimer);
        gestureEndTimer = 0;
    }
    userGesturing = false;
}
