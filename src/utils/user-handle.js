/**
 * Stable public tag for identifying users when display names collide.
 * We derive a short discriminator from a public key (Nostr keys pub) or similar stable id.
 */
export function computePublicTag(id) {
    const s = String(id || '').trim();
    if (!s) return '';
    // FNV-1a 32-bit
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    // Convert to uppercase base36 and take last 4 chars (pad to ensure fixed width).
    const tag = (h >>> 0).toString(36).toUpperCase().padStart(4, '0');
    return tag.slice(-4);
}

export function formatUserHandle(name, idForTag) {
    const n = String(name || '').trim();
    if (!n) return '';
    const t = computePublicTag(idForTag);
    return t ? `${n}#${t}` : n;
}

