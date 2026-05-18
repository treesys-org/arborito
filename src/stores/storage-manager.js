
export class StorageManager {
    constructor() {
        this.STORAGE_KEY = 'arborito_arcade_saves_v1';
        
        // --- STORAGE QUOTAS (BROWSER LIMIT: ~5MB TOTAL) ---
        // Global Limit for Arcade: 3,500,000 characters (~3.4 MB)
        this.MAX_GLOBAL_SIZE = 3500000; 
        
        // Per Game Limit: 200,000 characters (~195 KB)
        this.MAX_GAME_SIZE = 200000; 
        
        this.cache = null;
        this.loadFromDisk();
    }

    loadFromDisk() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                this.cache = JSON.parse(raw);
            } else {
                this.cache = {};
            }
        } catch (e) {
            console.error("StorageManager: Failed to load index", e);
            this.cache = {};
        }
    }

    saveToDisk() {
        try {
            const raw = JSON.stringify(this.cache);
            
            // MANUAL MANAGEMENT ENFORCED: No Auto-GC.
            if (raw.length > this.MAX_GLOBAL_SIZE) {
                console.error(`StorageManager: Global quota exceeded (${raw.length} / ${this.MAX_GLOBAL_SIZE})`);
                return false; // Return false to indicate failure
            }
            
            localStorage.setItem(this.STORAGE_KEY, raw);
            return true;
        } catch (e) {
            console.error("StorageManager: Disk write failed (Browser Quota?)", e);
            return false;
        }
    }

    // --- API FOR GAMES ---

    saveGameData(gameId, key, value) {
        if (!gameId) return false;
        
        // Ensure game bucket exists
        if (!this.cache[gameId]) {
            this.cache[gameId] = {};
        }

        // Create a tentative new state for this game to check size
        const gameClone = { ...this.cache[gameId] };
        gameClone[key] = value;
        // Inject system timestamp just for sorting metadata later
        gameClone._sys_updated = Date.now();

        // Check Individual Game Quota (Anti-Hogging)
        const gameStr = JSON.stringify(gameClone);
        if (gameStr.length > this.MAX_GAME_SIZE) {
            console.warn(`StorageManager: Game "${gameId}" exceeded quota.`);
            throw new Error("GAME_QUOTA_EXCEEDED");
        }

        // Commit to memory temporarily
        const oldState = this.cache[gameId];
        this.cache[gameId] = gameClone;

        // Try to commit to disk
        const success = this.saveToDisk();
        if (!success) {
            // ROLLBACK if disk full
            console.error("StorageManager: Rollback due to full disk.");
            this.cache[gameId] = oldState; 
            throw new Error("GLOBAL_QUOTA_EXCEEDED");
        }
        
        return true;
    }

    loadGameData(gameId, key) {
        if (!this.cache[gameId]) return null;
        return this.cache[gameId][key] || null;
    }

    clearGameData(gameId) {
        if (this.cache[gameId]) {
            delete this.cache[gameId];
            const saved = this.saveToDisk();
            return saved;
        }
        return false;
    }
    
    clearAll() {
        this.cache = {};
        return this.saveToDisk();
    }

    // --- METRICS FOR UI ---

    getStats() {
        // Arcade Stats
        const arcadeRaw = JSON.stringify(this.cache);
        const arcadeUsed = arcadeRaw.length;
        const arcadePct = Math.round((arcadeUsed / this.MAX_GLOBAL_SIZE) * 100);

        // Core App Stats (Estimate)
        let coreUsed = 0;
        try {
            const keys = ['arborito-progress', 'arborito-bookmarks', 'arborito-theme', 'arborito-lang', 'arborito-sources'];
            keys.forEach(k => {
                const item = localStorage.getItem(k);
                if (item) coreUsed += item.length;
            });
        } catch(e) {}
        
        // Reserve 1.5MB for Core
        const MAX_CORE_SIZE = 1500000;
        const corePct = Math.round((coreUsed / MAX_CORE_SIZE) * 100);

        // Calculate per game usage
        const games = Object.keys(this.cache).map(gameId => {
            const size = JSON.stringify(this.cache[gameId]).length;
            return {
                id: gameId,
                size: size,
                sizeFmt: (size / 1024).toFixed(1) + ' KB',
                pct: Math.round((size / this.MAX_GAME_SIZE) * 100),
                updated: this.cache[gameId]._sys_updated || 0
            };
        }).sort((a,b) => b.size - a.size);

        return {
            arcade: {
                usedBytes: arcadeUsed,
                maxBytes: this.MAX_GLOBAL_SIZE,
                usedFmt: (arcadeUsed / 1024).toFixed(1) + ' KB',
                percent: arcadePct,
                games: games
            },
            core: {
                usedBytes: coreUsed,
                maxBytes: MAX_CORE_SIZE,
                usedFmt: (coreUsed / 1024).toFixed(1) + ' KB',
                percent: corePct
            }
        };
    }
}

export const storageManager = new StorageManager();
