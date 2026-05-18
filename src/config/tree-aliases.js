/**
 * Optional short names → full URL (resolved in this bundle only).
 * Empty by default — add entries here if you ship curated aliases.
 */
import { isTreeShareCodeInput, normalizeTreeShareCode } from './share-code.js';

export const TREE_ALIASES = {};

/** @returns {string[]} stable list for UI chips */
export function listKnownAliasKeys() {
    return Object.keys(TREE_ALIASES).sort();
}

/** If this URL is a curated alias target, return the short name (for shorter share links). */
export function getAliasForUrl(url) {
    const u = String(url || '').trim();
    if (!u) return null;
    for (const [key, target] of Object.entries(TREE_ALIASES)) {
        if (target === u) return key;
    }
    return null;
}

function normalizeAliasKey(input) {
    return String(input || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');
}

/**
 * @returns {{ kind: 'resolved', url: string, alias: string, displayName: string }
 *   | { kind: 'code', code: string }
 *   | { kind: 'raw', value: string }
 *   | { kind: 'unknown_alias', tried: string }
 *   | { kind: 'empty' }}
 */
export function resolveTreeInput(rawInput) {
    const trimmed = String(rawInput || '').trim();
    if (!trimmed) return { kind: 'empty' };

    if (/^(nostr:|nostr:\/\/|https?:|\/\/|\.{1,2}\/)/i.test(trimmed)) {
        return { kind: 'raw', value: trimmed };
    }
    if (trimmed.includes('://')) {
        return { kind: 'raw', value: trimmed };
    }

    const key = normalizeAliasKey(trimmed);
    const url = TREE_ALIASES[key];
    if (url) {
        const displayName = key.replace(/-/g, ' ');
        return { kind: 'resolved', url, alias: key, displayName };
    }

    if (isTreeShareCodeInput(trimmed)) {
        return { kind: 'code', code: normalizeTreeShareCode(trimmed) };
    }

    if (/^[a-z0-9][a-z0-9_-]*$/i.test(trimmed)) {
        return { kind: 'unknown_alias', tried: trimmed };
    }

    return { kind: 'raw', value: trimmed };
}
