import { localDateKey } from './date-key.js';
import { STREAK_SHIELD_MAX } from '../../features/garden-progress/api/lumen-shop.js';

export const streakMixin = {
    /**
     * Called on app boot: reset daily XP on a new calendar day and break the
     * streak if the user missed a study day. Streak *increments* only via
     * recordStudyDay() when the user actually earns XP or completes SRS review.
     */
    checkStreak() {
        const today = localDateKey();
        const g = this.state.gamification;
        const { lastLoginDate, lastStudyDate, streak, streakShields = 0 } = g;
        if (lastLoginDate === today) return null;

        let result = null;
        if (lastLoginDate) {
            const lastStudy = lastStudyDate || lastLoginDate;
            const last = new Date(`${lastStudy}T12:00:00`);
            const now = new Date(`${today}T12:00:00`);
            const diffDays = Math.round(Math.abs(now - last) / (1000 * 60 * 60 * 24));

            if (diffDays > 1) {
                if (streakShields > 0) {
                    this.updateGamification({
                        lastLoginDate: today,
                        dailyXP: 0,
                        streakShields: streakShields - 1,
                    });
                    result = this.getUi().streakShieldUsed || this.getUi().streakKept;
                } else if (streak > 0) {
                    this.updateGamification({ streak: 0, lastLoginDate: today, dailyXP: 0 });
                } else {
                    this.updateGamification({ lastLoginDate: today, dailyXP: 0 });
                }
            } else {
                this.updateGamification({ lastLoginDate: today, dailyXP: 0 });
            }
        } else {
            this.updateGamification({ lastLoginDate: today, streakShields: 0 });
        }
        return result;
    },

    /** Record a study day (XP earned or SRS review), increments streak. */
    recordStudyDay() {
        const today = localDateKey();
        const g = this.state.gamification;
        const { lastStudyDate, streak, streakShields = 0 } = g;
        if (lastStudyDate === today) {
            if (!g.lastLoginDate) this.updateGamification({ lastLoginDate: today });
            return null;
        }

        let nextStreak = 1;
        let msg = null;
        if (lastStudyDate) {
            const last = new Date(`${lastStudyDate}T12:00:00`);
            const now = new Date(`${today}T12:00:00`);
            const diffDays = Math.round(Math.abs(now - last) / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
                nextStreak = streak + 1;
                msg = this.getUi().streakKept;
            }
        }

        let shields = streakShields;
        let earnedShield = false;
        if (nextStreak > 0 && nextStreak % 3 === 0 && shields < STREAK_SHIELD_MAX) {
            shields += 1;
            earnedShield = true;
        }

        this.updateGamification({
            streak: nextStreak,
            lastStudyDate: today,
            lastLoginDate: today,
            streakShields: shields,
        });
        if (!msg && !earnedShield) return null;
        return { msg, earnedShield };
    },
};
