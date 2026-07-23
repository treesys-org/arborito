/**
 * Adaptive Sage defaults from available CPU / RAM (modest ↔ capable).
 * Applied once when the user has not set context/token prefs manually.
 */

export const SAGE_PERF_AUTO_KEY = 'arborito_sage_perf_auto_v1';

/** @returns {'modest'|'standard'|'capable'} */
export function detectHardwareTier() {
    let cores = 4;
    let memGb = 8;
    try {
        if (typeof navigator !== 'undefined') {
            if (Number.isFinite(navigator.hardwareConcurrency) && navigator.hardwareConcurrency > 0) {
                cores = navigator.hardwareConcurrency;
            }
            /* Chromium caps deviceMemory at 8; treat 8 as “at least 8 GB”. */
            if (Number.isFinite(navigator.deviceMemory) && navigator.deviceMemory > 0) {
                memGb = navigator.deviceMemory;
            }
        }
    } catch (_) {}

    if (cores <= 2 || memGb <= 2) return 'modest';
    if (cores <= 4 || memGb <= 4) return 'modest';
    if (cores >= 8 && memGb >= 8) return 'capable';
    return 'standard';
}

/** @param {'modest'|'standard'|'capable'} tier */
export function resolveAdaptiveSageDefaults(tier) {
    if (tier === 'modest') {
        return { contextPreset: 'micro', browserMaxNewTokens: 768, historyTurns: 4 };
    }
    if (tier === 'capable') {
        return { contextPreset: 'balanced', browserMaxNewTokens: 1536, historyTurns: 8 };
    }
    return { contextPreset: 'minimal', browserMaxNewTokens: 1024, historyTurns: 6 };
}

/**
 * Pick context / max-token defaults from hardware on first run.
 * @returns {'modest'|'standard'|'capable'}
 */
export function applyAdaptiveSageDefaultsIfNeeded() {
    const tier = detectHardwareTier();
    try {
        const hasContext = localStorage.getItem('arborito_ai_context_preset');
        const hasTokens = localStorage.getItem('arborito_browser_max_new_tokens');
        const applied = localStorage.getItem(SAGE_PERF_AUTO_KEY);

        if (hasContext && hasTokens) {
            if (!applied) localStorage.setItem(SAGE_PERF_AUTO_KEY, tier);
            return tier;
        }

        if (applied && (hasContext || hasTokens)) {
            return tier;
        }

        const defs = resolveAdaptiveSageDefaults(tier);
        if (!hasContext) localStorage.setItem('arborito_ai_context_preset', defs.contextPreset);
        if (!hasTokens) localStorage.setItem('arborito_browser_max_new_tokens', String(defs.browserMaxNewTokens));
        localStorage.setItem(SAGE_PERF_AUTO_KEY, tier);
    } catch (_) {}
    return tier;
}

/** @param {string} preset @param {'modest'|'standard'|'capable'} [tier] */
export function resolveAdaptiveHistoryTurns(preset, tier = detectHardwareTier()) {
    const p = String(preset || 'minimal');
    if (p === 'micro') return 4;
    if (p === 'balanced') return 8;
    if (tier === 'modest') return 4;
    if (tier === 'capable') return 8;
    return 6;
}

/** Fraction of nCtx reserved for RAG + system (rest → history + generation). */
export function resolveContextInputShare(preset) {
    const p = String(preset || 'minimal');
    if (p === 'micro') return 0.48;
    if (p === 'balanced') return 0.58;
    return 0.52;
}
