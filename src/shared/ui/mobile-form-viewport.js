/**
 * Keeps focused inputs visible when the mobile virtual keyboard resizes the visual viewport.
 */
export function bindMobileInputKeepVisible(rootEl) {
    if (typeof window === 'undefined' || !rootEl) return () => {};

    const scrollFocused = () => {
        const active = document.activeElement;
        if (!active || !rootEl.contains(active)) return;
        const tag = active.tagName;
        if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !active.isContentEditable) return;
        requestAnimationFrame(() => {
            try {
                active.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
            } catch {
                active.scrollIntoView(true);
            }
        });
    };

    rootEl.addEventListener('focusin', scrollFocused);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', scrollFocused);
    vv?.addEventListener('scroll', scrollFocused);

    return () => {
        rootEl.removeEventListener('focusin', scrollFocused);
        vv?.removeEventListener('resize', scrollFocused);
        vv?.removeEventListener('scroll', scrollFocused);
    };
}
