import { randomUUIDSafe } from '../../shared/lib/secure-web-crypto.js';
import { DEFAULT_ARCADE_GAME_CATALOG } from './_helpers.js';

export const installedGamesMixin = {
    /**
     * Pin the official Arborito Games catalog (treesys-org/arborito-games) to the
     * front of the repos list. Dedupes by URL and reorders if needed.
     */
    ensureDefaultArcadeGameCatalog() {
        const def = DEFAULT_ARCADE_GAME_CATALOG;
        let repos = this.state.gameRepos.filter((r) => !(r.url === def.url && r.id !== def.id));
        const idx = repos.findIndex((r) => r.id === def.id);
        let changed = repos.length !== this.state.gameRepos.length;
        if (idx === -1) {
            repos = [{ ...def }, ...repos];
            changed = true;
        } else {
            const row = repos[idx];
            const updated = { ...row, url: def.url, name: def.name };
            if (row.url !== updated.url || row.name !== updated.name) {
                repos[idx] = updated;
                changed = true;
            }
            if (idx > 0) {
                repos.splice(idx, 1);
                repos.unshift(updated);
                changed = true;
            }
        }
        if (changed) this.state.gameRepos = repos;
        return changed;
    },

    saveGameData(gameId, key, value) {
        if (!this.state.gameData[gameId]) this.state.gameData[gameId] = {};
        this.state.gameData[gameId][key] = value;
        this.persist();
    },

    loadGameData(gameId, key) { return (this.state.gameData[gameId] ? this.state.gameData[gameId][key] : undefined) || null; },

    addGame(name, url, icon) {
        const newGame = { id: randomUUIDSafe(), name, url, icon: icon || '🎮' };
        this.state.installedGames = [...this.state.installedGames, newGame];
        this.persist();
    },

    removeGame(id) {
        this.state.installedGames = this.state.installedGames.filter(g => g.id !== id);
        delete this.state.offlineGames[id];
        this.persist();
    },

    isGameOffline(gameId) {
        return !!this.state.offlineGames[gameId];
    },

    setGameOffline(gameId, enabled) {
        if (!gameId) return;
        if (enabled) this.state.offlineGames[gameId] = true;
        else delete this.state.offlineGames[gameId];
        this.persist();
    },

    addGameRepo(url, name) {
        const u = String(url || '').trim();
        if (!u) return false;
        if (this.state.gameRepos.some((r) => r.url === u)) return false;
        let repoName = String(name || '').trim();
        if (!repoName) {
            try { repoName = new URL(u).hostname; } catch { repoName = 'Custom catalog'; }
        }
        const newRepo = { id: randomUUIDSafe(), name: repoName, url: u, isOfficial: false };
        this.state.gameRepos.push(newRepo);
        this.persist();
        return true;
    },

    removeGameRepo(id) {
        if (id === DEFAULT_ARCADE_GAME_CATALOG.id) return false;
        const before = this.state.gameRepos.length;
        this.state.gameRepos = this.state.gameRepos.filter((r) => r.id !== id);
        if (this.state.gameRepos.length === before) return false;
        this.persist();
        return true;
    }
};
