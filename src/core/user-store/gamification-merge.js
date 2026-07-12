/**
 * Merge remote gamification blob into local state (multi-device sync).
 * Takes the best of both without losing shields, inventory, or weekly stats.
 */
export function mergeRemoteGamification(local, remote) {
    const g = local && typeof local === 'object' ? { ...local } : {};
    const bg = remote && typeof remote === 'object' ? remote : null;
    if (!bg) return g;

    if ((bg.xp || 0) > (g.xp || 0)) g.xp = bg.xp;
    g.dailyXP = Math.max(g.dailyXP || 0, bg.dailyXP || 0);
    g.streak = Math.max(g.streak || 0, bg.streak || 0);
    g.weeklyLumens = Math.max(g.weeklyLumens || 0, bg.weeklyLumens || 0);
    g.streakShields = Math.max(g.streakShields || 0, bg.streakShields || 0);
    g.lumensSpent = Math.max(g.lumensSpent || 0, bg.lumensSpent || 0);
    g.arcadeDailyXP = Math.max(g.arcadeDailyXP || 0, bg.arcadeDailyXP || 0);

    if (bg.username && (!g.username || g.username === '')) g.username = bg.username;
    if (bg.avatar && (!g.avatar || g.avatar === '👤' || g.avatar === '🌱')) g.avatar = bg.avatar;

    if (bg.lastLoginDate && (!g.lastLoginDate || String(bg.lastLoginDate) < String(bg.lastLoginDate))) {
        g.lastLoginDate = bg.lastLoginDate;
    }
    if (bg.lastStudyDate && (!g.lastStudyDate || String(g.lastStudyDate) < String(bg.lastStudyDate))) {
        g.lastStudyDate = bg.lastStudyDate;
    }
    if (bg.weeklyWeekKey) g.weeklyWeekKey = bg.weeklyWeekKey;
    if (bg.arcadeXpDay) g.arcadeXpDay = bg.arcadeXpDay;

    if (Array.isArray(bg.seeds)) {
        const byId = new Map((g.seeds || []).map((s) => [String(s.id), s]));
        for (const s of bg.seeds) {
            if (s && s.id) byId.set(String(s.id), s);
        }
        g.seeds = Array.from(byId.values());
    }

    if (Array.isArray(bg.inventory) && bg.inventory.length) {
        const seen = new Set((g.inventory || []).map((x) => String(x)));
        g.inventory = [...(g.inventory || [])];
        for (const item of bg.inventory) {
            const k = String(item);
            if (!seen.has(k)) {
                seen.add(k);
                g.inventory.push(item);
            }
        }
    }

    if (bg.gardenDecor && typeof bg.gardenDecor === 'object') {
        g.gardenDecor = { ...(g.gardenDecor || {}), ...bg.gardenDecor };
    }

    if (bg.quizXpAwarded && typeof bg.quizXpAwarded === 'object') {
        g.quizXpAwarded = { ...(g.quizXpAwarded || {}), ...bg.quizXpAwarded };
    }

    if (typeof bg.rankingOptIn === 'boolean') g.rankingOptIn = g.rankingOptIn || bg.rankingOptIn;
    if (typeof bg.rankingAnonymous === 'boolean' && bg.rankingAnonymous) g.rankingAnonymous = true;

    return g;
}
