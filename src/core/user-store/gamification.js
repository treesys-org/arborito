import { ensureWeeklyLumensReset } from '../../features/tree-graph/api/tree-ranking.js';

// BOTANICAL SEEDS: More universal concept for knowledge trees
const SEED_TYPES = ['🌲', '🌰', '🌾', '🍁', '🥥', '🥜', '🌰', '🫘', '🍄', '🌱'];

export const gamificationMixin = {
    addXP(amount) {
        const n = Math.max(0, Math.floor(Number(amount) || 0));
        if (n <= 0) return null;
        const { gamification } = this.state;
        const weekReset = ensureWeeklyLumensReset(gamification);
        const baseWeekly = weekReset ? 0 : (gamification.weeklyLumens || 0);
        const newDaily = gamification.dailyXP + n;
        const newTotal = gamification.xp + n;
        let msg = `+${n} ${this.getUi().xpUnit}`;
        const hitGoal = gamification.dailyXP < this.dailyXpGoal && newDaily >= this.dailyXpGoal;
        if (hitGoal) msg = this.getUi().goalReached + ' ☀️';
        this.updateGamification({
            xp: newTotal,
            dailyXP: newDaily,
            weeklyLumens: baseWeekly + n,
            ...(weekReset || {})
        });
        return { msg, hitGoal };
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
