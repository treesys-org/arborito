/**
 * Injected iframe code blocks must not use nested template literals — backticks
 * in the payload (e.g. markdown fence regex) would terminate the host module.
 * Export plain strings via this helper so fragments stay parse-safe.
 */
export function iframeSdkBlock(lines) {
    return (Array.isArray(lines) ? lines : [lines]).join('\n');
}
