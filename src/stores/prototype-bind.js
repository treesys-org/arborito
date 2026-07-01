/**
 * Bind plain action functions onto Store.prototype (thin delegation layer).
 * Actions should use `getArboritoStore()` internally — not `this`.
 *
 * @param {object} proto — Store.prototype
 * @param {Record<string, Function>} methods
 */
export function bindPrototypeMethods(proto, methods) {
    if (!proto || !methods) return;
    for (const [key, fn] of Object.entries(methods)) {
        if (typeof fn !== 'function') continue;
        proto[key] = function (...args) {
            return fn(...args);
        };
    }
}
