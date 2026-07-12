import { ensureWeeklyLumensReset } from '../../features/tree-graph/api/tree-ranking.js';
import { localDateKey } from './date-key.js';

// BOTANICAL SEEDS: More universal concept for knowledge trees
const SEED_TYPES = ['🌲', '🌰', '🌾', '🍁', '🥥', '🥜', '🌰', '🫘', '🍄', '🌱'];

/** Daily cap for arcade/game bridge XP to prevent infinite farming. */
export const DAILY_ARCADE_XP_CAP = 120;

function streakXpMultiplier(streak) {
    if (streak >= 14) return 1.15;
    if (streak >= 7) return 1.1;
    if (streak >= 3) return 1.05;
    return 1;
}

export const gamificationMixin = {
    addXP(amount, opts = {}) {
        const n = Math.max(0, Math.floor(Number(amount) || 0));
        if (n <= 0) return null;
        const { gamification } = this.state;
        const fromArcade = opts.fromArcade === true;

        if (fromArcade) {
            const today = localDateKey();
            const arcadeDay = gamification.arcadeXpDay || '';
            const arcadeSoFar = arcadeDay === today ? (gamification.arcadeDailyXP || 0) : 0;
            if (arcadeSoFar >= DAILY_ARCADE_XP_CAP) return null;
            const room = DAILY_ARCADE_XP_CAP - arcadeSoFar;
            if (n > room) {
                opts = { ...opts, _arcadePartial: room };
            }
        }

        let boosted = Math.floor(n * streakXpMultiplier(gamification.streak || 0));
        if (fromArcade && opts._arcadePartial != null) {
            boosted = Math.min(boosted, opts._arcadePartial);
        }
        if (boosted <= 0) return null;

        const weekReset = ensureWeeklyLumensReset(gamification);
        const baseWeekly = weekReset ? 0 : (gamification.weeklyLumens || 0);
        const newDaily = gamification.dailyXP + boosted;
        const newTotal = gamification.xp + boosted;
        let msg = `+${boosted} ${this.getUi().xpUnit}`;
        const hitGoal = gamification.dailyXP < this.dailyXpGoal && newDaily >= this.dailyXpGoal;
        if (hitGoal) msg = this.getUi().goalReached + ' ☀️';

        const streakMsg = this.recordStudyDay?.() || null;
        if (streakMsg && !hitGoal) msg = `${msg} · ${streakMsg}`;

        const today = localDateKey();
        const patch = {
            xp: newTotal,
            dailyXP: newDaily,
            weeklyLumens: baseWeekly + boosted,
            ...(weekReset || {}),
        };
        if (fromArcade) {
            const prev = gamification.arcadeXpDay === today ? (gamification.arcadeDailyXP || 0) : 0;
            patch.arcadeXpDay = today;
            patch.arcadeDailyXP = prev + boosted;
        }
        this.updateGamification(patch);
        return { msg, hitGoal };
    },

    wasQuizXpAwarded(key) {
        const map = this.state.gamification.quizXpAwarded;
        return !!(map && typeof map === 'object' && map[String(key)]);
    },

    markQuizXpAwarded(key) {
        const map = { ...(this.state.gamification.quizXpAwarded || {}) };
        map[String(key)] = Date.now();
        this.updateGamification({ quizXpAwarded: map });
    },

    harvestSeed(moduleId) {
        const { gamification } = this.state;
        if (gamification.seeds.find(f => f.id === moduleId)) return null;
        const charSum = moduleId.split('').reduce((a,b) => a + b.charCodeAt(0), 0);
        const seedIcon = SEED_TYPES[charSum % SEED_TYPES.length];
        const newSeed = { id: moduleId, icon: seedIcon, date: Date.now() };
        this.updateGamification({ seeds: [...gamification.seeds, newSeed] });
        return `${this.getUi().seedCollected} ${seedIcon}`;
    },

    updateGamification(updates) {
        this.state.gamification = { ...this.state.gamification, ...updates };
        this.persist();
    }
};
