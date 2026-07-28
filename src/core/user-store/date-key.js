/** Local calendar date YYYY-MM-DD (not UTC, streaks must follow the user's day). */
export function localDateKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Shift a YYYY-MM-DD local key by whole calendar days (noon anchor avoids DST glitches). */
export function shiftLocalDateKey(key, deltaDays) {
    const d = new Date(`${key}T12:00:00`);
    d.setDate(d.getDate() + deltaDays);
    return localDateKey(d);
}
