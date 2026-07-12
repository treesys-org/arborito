export function normSourcesQuery(s) {
    return String(s || '').trim().toLowerCase();
}

export function scoreSourcesMatch(query, ...haystacks) {
    const q = normSourcesQuery(query);
    if (!q) return 0;
    const hs = haystacks.map((h) => normSourcesQuery(h)).filter(Boolean);
    let best = 0;
    for (const h of hs) {
        if (!h) continue;
        if (h === q) best = Math.max(best, 100);
        else if (h.startsWith(q)) best = Math.max(best, 70);
        else if (h.includes(q)) best = Math.max(best, 40);
    }
    return best;
}

/** Discover-style ranking: recency + votes + recent use. */
export function discoverListingScore(r, m = {}) {
    const votes = Number.isFinite(Number(m.votes)) ? Number(m.votes) : 0;
    const used7 = Number.isFinite(Number(m.used7)) ? Number(m.used7) : 0;
    const used1 = Number.isFinite(Number(m.used1)) ? Number(m.used1) : 0;
    const ts = Date.parse(String(r?.updatedAt || '')) || 0;
    const ageDays = ts > 0 ? Math.max(0, (Date.now() - ts) / 86400000) : 365;
    const novelty = Math.exp(-ageDays / 14) * 150;
    const engagement =
        Math.log1p(votes) * 72 +
        Math.log1p(used7) * 58 +
        Math.log1p(used1) * 24 +
        Math.log1p(Number(m.forks) || 0) * 40;
    let score = novelty + engagement;
    if (ageDays >= 12 && votes < 2 && used7 < 3 && used1 < 2) score *= 0.18;
    if (ageDays < 8 && votes === 0 && used7 === 0 && used1 === 0) score += 44;
    return score;
}
