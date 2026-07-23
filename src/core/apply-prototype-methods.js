/** Copy plain method bundles onto a class prototype (no Object.assign(prototype) pattern). */
export function applyPrototypeMethods(proto, ...bundles) {
    for (const bundle of bundles) {
        if (!bundle || typeof bundle !== 'object') continue;
        for (const [key, fn] of Object.entries(bundle)) {
            if (typeof fn === 'function') proto[key] = fn;
        }
    }
}
