/** Install accessor descriptors on a class prototype (getters/setters). */
export function applyPrototypeAccessors(proto, ...specs) {
    for (const spec of specs) {
        if (!spec || typeof spec !== 'object') continue;
        for (const [key, descriptor] of Object.entries(spec)) {
            if (!descriptor || typeof descriptor !== 'object') continue;
            const { get, set } = descriptor;
            if (typeof get !== 'function' && typeof set !== 'function') continue;
            Object.defineProperty(proto, key, {
                configurable: true,
                enumerable: true,
                ...(typeof get === 'function' ? { get } : {}),
                ...(typeof set === 'function' ? { set } : {}),
            });
        }
    }
}
