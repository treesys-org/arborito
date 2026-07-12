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

/** Load arcade catalog from repos + manually installed games. */
export async function loadArcadeGamesCatalog(userStore) {
    const repos = [...(userStore?.state?.gameRepos || [])].sort((a, b) => {
        if (a.isOfficial && !b.isOfficial) return -1;
        if (!a.isOfficial && b.isOfficial) return 1;
        return 0;
    });

    const byId = new Map();
    await Promise.all(
        repos.map(async (repo) => {
            try {
                const res = await fetch(repo.url, { cache: 'no-cache' });
                if (!res.ok) return;
                const games = await res.json();
                const repoBase = repo.url.substring(0, repo.url.lastIndexOf('/') + 1);
                games.forEach((g) => {
                    byId.set(g.id, {
                        ...g,
                        path: normalizeGamePath(g.path || g.url, repoBase),
                        repoId: repo.id,
                        repoName: repo.name,
                        isOfficial: !!repo.isOfficial,
                    });
                });
            } catch (e) {
                console.warn(`[Arborito] Failed to load game repo ${repo.name}`, e);
            }
        })
    );

    return mergeManualGames([...byId.values()], userStore);
}
