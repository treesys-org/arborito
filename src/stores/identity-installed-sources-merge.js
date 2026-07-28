/**
 * Helpers for the encrypted installed-sources account pack (Bosque “Saved”).
 * Keep free of nostr-tools so unit tests stay lightweight.
 */

/** Canonical network URL for installed-sources pack rows (nostr:// preferred). */
export function canonicalInstalledSourceUrl(urlStr) {
    const raw = String(urlStr || '').trim();
    if (!raw || raw.startsWith('branch://') || raw.startsWith('privtree://') || raw.startsWith('tree://')) {
        return '';
    }
    const m = raw.match(/^nostr:\/\/([0-9a-fA-F]{64})\/([^?#]+)$/i);
    if (m) {
        let uid = m[2];
        try {
            uid = decodeURIComponent(uid);
        } catch {
            /* keep raw */
        }
        return `nostr://${m[1].toLowerCase()}/${encodeURIComponent(uid)}`;
    }
    try {
        return new URL(raw).href;
    } catch {
        return raw;
    }
}

/**
 * Prefer non-empty fields from `prefer` over `base` (same course, two devices).
 * @param {object} base
 * @param {object} prefer
 */
export function mergeInstalledSourceRecord(base, prefer) {
    const a = base && typeof base === 'object' ? base : {};
    const b = prefer && typeof prefer === 'object' ? prefer : {};
    const pick = (key) => {
        const bv = b[key];
        if (bv != null && String(bv).trim() !== '') return bv;
        return a[key];
    };
    const url = canonicalInstalledSourceUrl(b.url || a.url) || String(b.url || a.url || '').trim();
    const langsA = Array.isArray(a.languages) ? a.languages : undefined;
    const langsB = Array.isArray(b.languages) ? b.languages : undefined;
    const relaysA = Array.isArray(a.recommendedRelays) ? a.recommendedRelays : [];
    const relaysB = Array.isArray(b.recommendedRelays) ? b.recommendedRelays : [];
    const relays = [...new Set([...relaysA, ...relaysB].map((u) => String(u || '').trim()).filter(Boolean))];
    return {
        id: pick('id') || url,
        name: pick('name') || pick('title') || '',
        url,
        authorName: pick('authorName') || pick('listAuthorName') || '',
        description: pick('description') || pick('listDescription') || '',
        titles: b.titles || a.titles,
        descriptions: b.descriptions || a.descriptions,
        languages: langsB?.length ? langsB : langsA,
        icon: pick('icon') || undefined,
        shareCode: pick('shareCode') || undefined,
        contentKind: pick('contentKind') || undefined,
        recommendedRelays: relays,
    };
}

/**
 * Union two installed-sources lists by canonical URL (never drop a device's joins).
 * @param {object[]} localList
 * @param {object[]} remoteList
 */
export function unionInstalledSourcesLists(localList, remoteList) {
    /** @type {Map<string, object>} */
    const byUrl = new Map();
    const ingest = (row, preferOverExisting) => {
        if (!row || typeof row !== 'object') return;
        const url = canonicalInstalledSourceUrl(row.url);
        if (!url) return;
        const prev = byUrl.get(url);
        if (!prev) {
            byUrl.set(url, mergeInstalledSourceRecord({ url }, row));
            return;
        }
        byUrl.set(
            url,
            preferOverExisting
                ? mergeInstalledSourceRecord(prev, row)
                : mergeInstalledSourceRecord(row, prev)
        );
    };
    for (const row of Array.isArray(remoteList) ? remoteList : []) ingest(row, false);
    for (const row of Array.isArray(localList) ? localList : []) ingest(row, true);
    return [...byUrl.values()];
}

/**
 * Drop pack rows the user explicitly uninstalled on this device (until publish lands).
 * @param {object[]} list
 * @param {Set<string>|null|undefined} removedCanon
 */
export function omitInstalledSourceTombstones(list, removedCanon) {
    if (!removedCanon || !removedCanon.size) return Array.isArray(list) ? list : [];
    return (Array.isArray(list) ? list : []).filter((row) => {
        const url = canonicalInstalledSourceUrl(row?.url);
        return !url || !removedCanon.has(url);
    });
}
