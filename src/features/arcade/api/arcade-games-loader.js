import { pinJsdelivrGitHubUrl } from './arcade-games-cdn.js';

function normalizeGamePath(path, repoBase) {
    if (!path) return '';
    if (path.startsWith('http') || path.startsWith('//')) return path;
    if (path.startsWith('./')) return repoBase + path.substring(2);
    if (path.startsWith('/')) return repoBase + path.substring(1);
    return repoBase + path;
}

function mergeManualGames(catalogGames, userStore) {
    const manual = (userStore?.state?.installedGames || []).map((g) => ({
        ...g,
        path: g.url || g.path || '',
        isManual: true,
    }));
    const byId = new Map();
    for (const g of catalogGames) {
        if (g?.id != null) byId.set(String(g.id), g);
    }
    for (const g of manual) {
        if (g?.id == null) continue;
        const id = String(g.id);
        byId.set(id, { ...byId.get(id), ...g, id: g.id });
    }
    return [...byId.values()];
}

/**
 * Load arcade catalog from repos + manually installed games.
 * @returns {Promise<{ games: object[], catalogError: string|null }>}
 */
export async function loadArcadeGamesCatalog(userStore) {
    const repos = [...(userStore?.state?.gameRepos || [])].sort((a, b) => {
        if (a.isOfficial && !b.isOfficial) return -1;
        if (!a.isOfficial && b.isOfficial) return 1;
        return 0;
    });

    const byId = new Map();
    let lastError = null;
    let anyOk = false;

    await Promise.all(
        repos.map(async (repo) => {
            try {
                const catalogUrl = await pinJsdelivrGitHubUrl(repo.url);
                const res = await fetch(catalogUrl, { cache: 'no-store' });
                if (!res.ok) {
                    lastError = `HTTP ${res.status}`;
                    return;
                }
                const games = await res.json();
                if (!Array.isArray(games)) {
                    lastError = 'invalid_catalog';
                    console.warn(
                        `[Arborito] Game repo ${repo.name} returned non-array catalog`,
                        catalogUrl
                    );
                    return;
                }
                const repoBase = catalogUrl.substring(0, catalogUrl.lastIndexOf('/') + 1);
                games.forEach((g) => {
                    if (!g || g.id == null) return;
                    byId.set(g.id, {
                        ...g,
                        path: normalizeGamePath(g.path || g.url, repoBase),
                        repoId: repo.id,
                        repoName: repo.name,
                        isOfficial: !!repo.isOfficial,
                    });
                });
                anyOk = true;
            } catch (e) {
                lastError = e?.message || 'catalog_load_failed';
                console.warn(`[Arborito] Failed to load game repo ${repo.name}`, e);
            }
        })
    );

    const games = mergeManualGames([...byId.values()], userStore);
    const catalogError = !anyOk && games.length === 0 ? lastError || 'catalog_load_failed' : null;
    return { games, catalogError };
}
