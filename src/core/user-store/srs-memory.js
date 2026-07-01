export const srsMemoryMixin = {
    // --- MEMORY CORE (SRS LOGIC / SM-2) ---

    // Quality: 0 (Forgot) to 5 (Perfect)
    reportMemory(nodeId, quality) {
        if (!nodeId) return;
        
        // Initialize if new or missing
        let item = this.state.memory[nodeId] || {
            lvl: 0,         // Streak/Interval Level
            ease: 2.5,      // Easiness Factor
            interval: 0,    // Days until next review
            lastReview: 0,  // Timestamp
            dueDate: 0      // Timestamp
        };

        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        item.reviews = (item.reviews || 0) + 1;

        if (quality < 3) {
            // Failed: Reset interval, keep ease relatively same but lower
            item.lvl = 0;
            item.interval = 1;
        } else {
            // Success
            if (item.lvl === 0) {
                item.interval = 1;
            } else if (item.lvl === 1) {
                item.interval = 6; // Standard SM-2 jump
            } else {
                item.interval = Math.round(item.interval * item.ease);
            }
            item.lvl++;
            
            // Adjust Ease
            // standard SM-2 formula: EF' = EF + (0.1 - (5-q)*(0.08+(5-q)*0.02))
            item.ease = item.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
            if (item.ease < 1.3) item.ease = 1.3; // Minimum ease cap
        }

        item.lastReview = now;
        item.dueDate = now + (item.interval * oneDay);

        this.state.memory[nodeId] = item;
        this.persist();
        
        return item;
    },

    getMemoryStatus(nodeId) {
        const item = this.state.memory[nodeId];
        // No SRS record yet: treat as freshly learned (full health, not due).
        if (!item) return { health: 1.0, isDue: false, interval: 0 };

        const now = Date.now();
        if (now >= item.dueDate) {
            return { health: 0, isDue: true, interval: item.interval };
        }

        // Calculate linear decay for visualization
        // Health goes from 1.0 (Review Date) to 0.0 (Due Date)
        const totalDuration = item.dueDate - item.lastReview;
        const elapsed = now - item.lastReview;
        let health = 1.0 - (elapsed / totalDuration);
        if (health < 0) health = 0;
        
        return { health, isDue: false, interval: item.interval };
    },

    getDueNodes() {
        const dueIds = [];
        const now = Date.now();
        for (const [id, item] of Object.entries(this.state.memory)) {
            if (now >= item.dueDate) {
                dueIds.push(id);
            }
        }
        return dueIds;
    }
};
