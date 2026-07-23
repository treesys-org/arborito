import { ensureWeeklyLumensReset } from '../../features/tree-graph/api/tree-ranking.js';
import { localDateKey } from './date-key.js';

// BOTANICAL SEEDS: More universal concept for knowledge trees
const SEED_TYPES = ['🌲', '🌰', '🌾', '🍁', '🥥', '🥜', '🌰', '🫘', '🍄', '🌱'];

/**
 * Soft daily cap: Arcade → shop/ranking lumens only.
 * Play keeps awarding arcadeScore without a hard stop (motivation to practice).
 */
export const DAILY_ARCADE_LUMEN_CAP = 80;

/** @deprecated Use DAILY_ARCADE_LUMEN_CAP — kept for any external imports. */
export const DAILY_ARCADE_XP_CAP = DAILY_ARCADE_LUMEN_CAP;

function streakXpMultiplier(streak) {
    if (streak >= 14) return 1.15;
    if (streak >= 7) return 1.1;
    if (streak >= 3) return 1.05;
    return 1;
}

function normalizeStreakResult(streakResult) {
    if (!streakResult) return { msg: null, earnedShield: false };
    if (typeof streakResult === 'string') return { msg: streakResult, earnedShield: false };
    if (typeof streakResult === 'object') {
        return {
            msg: streakResult.msg || null,
            earnedShield: !!streakResult.earnedShield,
        };
    }
    return { msg: null, earnedShield: false };
}

export const gamificationMixin = {
    addXP(amount, opts = {}) {
        const n = Math.max(0, Math.floor(Number(amount) || 0));
        if (n <= 0) return null;
        const { gamification } = this.state;
        const fromArcade = opts.fromArcade === true;
        const boosted = Math.floor(n * streakXpMultiplier(gamification.streak || 0));
        if (boosted <= 0) return null;

        const today = localDateKey();
        let lumenGrant = boosted;
        let arcadeScoreGrant = 0;

        if (fromArcade) {
            arcadeScoreGrant = boosted;
            const arcadeDay = gamification.arcadeXpDay || '';
            const arcadeLumensSoFar = arcadeDay === today ? Number(gamification.arcadeDailyXP) || 0 : 0;
            const room = Math.max(0, DAILY_ARCADE_LUMEN_CAP - arcadeLumensSoFar);
            lumenGrant = Math.min(boosted, room);
        }

        const streakResult = normalizeStreakResult(this.recordStudyDay?.() || null);
        const weekReset = ensureWeeklyLumensReset(gamification);
        const baseWeekly = weekReset ? 0 : Number(gamification.weeklyLumens) || 0;

        const patch = {
            ...(weekReset || {}),
        };
        if (arcadeScoreGrant > 0) {
            patch.arcadeScore = (Number(gamification.arcadeScore) || 0) + arcadeScoreGrant;
        }

        let hitGoal = false;
        let msg = null;

        if (lumenGrant > 0) {
            const newDaily = (Number(gamification.dailyXP) || 0) + lumenGrant;
            const newTotal = (Number(gamification.xp) || 0) + lumenGrant;
            hitGoal =
                (Number(gamification.dailyXP) || 0) < this.dailyXpGoal &&
                newDaily >= this.dailyXpGoal;
            msg = hitGoal
                ? this.getUi().goalReached + ' ☀️'
                : `+${lumenGrant} ${this.getUi().xpUnit}`;
            if (fromArcade && arcadeScoreGrant > lumenGrant) {
                const scoreOnly = arcadeScoreGrant - lumenGrant;
                msg = `${msg} · +${scoreOnly} ${this.getUi().arcadeScoreUnit || 'arcade'}`;
            }
            patch.xp = newTotal;
            patch.dailyXP = newDaily;
            patch.weeklyLumens = baseWeekly + lumenGrant;
            if (fromArcade) {
                const prev = gamification.arcadeXpDay === today ? Number(gamification.arcadeDailyXP) || 0 : 0;
                patch.arcadeXpDay = today;
                patch.arcadeDailyXP = prev + lumenGrant;
            }
        } else if (fromArcade && arcadeScoreGrant > 0) {
            /* Lumens capped for the day — score still grows so play stays rewarding. */
            const tpl =
                this.getUi().arcadeScoreOnlyToast ||
                '+{n} arcade pts (daily lumens capped)';
            msg = String(tpl).replace(/\{n\}/g, String(arcadeScoreGrant));
            patch.arcadeXpDay = today;
            patch.arcadeDailyXP =
                gamification.arcadeXpDay === today
                    ? Number(gamification.arcadeDailyXP) || DAILY_ARCADE_LUMEN_CAP
                    : DAILY_ARCADE_LUMEN_CAP;
        } else {
            return null;
        }

        if (streakResult.msg && !hitGoal) {
            msg = msg ? `${msg} · ${streakResult.msg}` : streakResult.msg;
        }

        this.updateGamification(patch);
        return {
            msg,
            hitGoal,
            earnedShield: streakResult.earnedShield,
            arcadeScoreGrant,
            lumenGrant,
        };
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
        if (gamification.seeds.find((f) => f.id === moduleId)) return null;
        const charSum = moduleId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        const seedIcon = SEED_TYPES[charSum % SEED_TYPES.length];
        const newSeed = { id: moduleId, icon: seedIcon, date: Date.now() };
        this.updateGamification({ seeds: [...gamification.seeds, newSeed] });
        return `${this.getUi().seedCollected} ${seedIcon}`;
    },

    updateGamification(updates) {
        const prev = this.state.gamification;
        const next = { ...prev, ...updates };
        if (!Object.prototype.hasOwnProperty.call(updates, 'profileUpdatedAt')) {
            const avatarChanged =
                Object.prototype.hasOwnProperty.call(updates, 'avatar') &&
                String(updates.avatar ?? '') !== String(prev.avatar ?? '');
            const usernameChanged =
                Object.prototype.hasOwnProperty.call(updates, 'username') &&
                String(updates.username ?? '') !== String(prev.username ?? '');
            if (avatarChanged || usernameChanged) {
                next.profileUpdatedAt = new Date().toISOString();
            }
        }
        this.state.gamification = next;
        this.persist();
    },
};
