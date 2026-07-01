export const streakMixin = {
    checkStreak() {
        const today = new Date().toISOString().slice(0, 10);
        const g = this.state.gamification;
        const { lastLoginDate, streak, streakShields = 0 } = g;
        let result = null;
        if (lastLoginDate === today) return null;
        if (lastLoginDate) {
            const last = new Date(lastLoginDate);
            const now = new Date(today);
            const diffTime = Math.abs(now - last);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
                let shields = streakShields;
                const nextStreak = streak + 1;
                if (nextStreak % 3 === 0 && shields < 3) shields += 1;
                this.updateGamification({ streak: nextStreak, lastLoginDate: today, dailyXP: 0, streakShields: shields });
                result = this.getUi().streakKept;
            } else if (diffDays > 1) {
                if (streakShields > 0) {
                    this.updateGamification({
                        lastLoginDate: today,
                        dailyXP: 0,
                        streakShields: streakShields - 1
                    });
                    result = this.getUi().streakShieldUsed || this.getUi().streakKept;
                } else {
                    this.updateGamification({ streak: 1, lastLoginDate: today, dailyXP: 0 });
                }
            }
        } else {
            this.updateGamification({ streak: 1, lastLoginDate: today, streakShields: 0 });
        }
        return result;
    }
};
