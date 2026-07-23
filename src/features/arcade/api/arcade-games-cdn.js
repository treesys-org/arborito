/**
 * jsDelivr `@main` can serve stale cartridge files from CDN edges (days old).
 * Fix: resolve the live commit SHA from GitHub on each load, then fetch
 * `cdn.jsdelivr.net/gh/owner/repo@<sha>/…` (immutable snapshot, always matches GitHub).
 *
 * No hardcoded SHAs in the app — push to arborito-games/main and the next play
 * picks up the new commit automatically (cache TTL below).
 */
const JSDELIVR_GH_REGEX = /^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^/]+)@([^/]+)\//;

/** @type {Map<string, { sha: string, at: number }>} */
const commitPinCache = new Map();

/** How long to reuse a resolved SHA before asking GitHub again. */
const PIN_TTL_MS = 90 * 1000;

export function clearJsdelivrCommitPinCache() {
    commitPinCache.clear();
}

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function pinJsdelivrGitHubUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return raw;

    const [pathPart, queryPart = ''] = raw.split('?');
    const match = pathPart.match(JSDELIVR_GH_REGEX);
    if (!match) return raw;

    const [, owner, repo, ref] = match;
    const cacheKey = `${owner}/${repo}@${ref}`;
    const cached = commitPinCache.get(cacheKey);
    if (cached && Date.now() - cached.at < PIN_TTL_MS) {
        const pinned = pathPart.replace(`@${ref}/`, `@${cached.sha}/`);
        return queryPart ? `${pinned}?${queryPart}` : pinned;
    }

    try {
        const res = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
            { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } }
        );
        if (!res.ok) return raw;
        const data = await res.json();
        const sha = data && data.sha ? String(data.sha) : '';
        if (!sha) return raw;
        commitPinCache.set(cacheKey, { sha, at: Date.now() });
        const pinned = pathPart.replace(`@${ref}/`, `@${sha}/`);
        return queryPart ? `${pinned}?${queryPart}` : pinned;
    } catch {
        return raw;
    }
}

/** Official catalog URL stored in user settings (always `@main`; pin runs at fetch time). */
export function officialArboritoGamesCatalogUrl() {
    return 'https://cdn.jsdelivr.net/gh/treesys-org/arborito-games@main/manifest.json';
}

/** @param {string} url */
export function isOfficialArboritoGamesCatalogUrl(url) {
    return JSDELIVR_GH_REGEX.test(String(url || '')) &&
        /^https:\/\/cdn\.jsdelivr\.net\/gh\/treesys-org\/arborito-games@/i.test(String(url || ''));
}
