/** Scroll to and highlight the profile header username field (#inp-username). */
export function focusProfileUsernameField() {
    if (typeof document === 'undefined') return;
    const head = document.querySelector('.profile-identity-head');
    const input = document.getElementById('inp-username');
    head?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    head?.classList.add('profile-identity-head--attention');
    input?.setAttribute('aria-invalid', 'true');
    try {
        input?.focus({ preventScroll: true });
    } catch (_) {}
}

export function clearProfileUsernameAttention() {
    if (typeof document === 'undefined') return;
    document.querySelector('.profile-identity-head')?.classList.remove('profile-identity-head--attention');
    document.getElementById('inp-username')?.removeAttribute('aria-invalid');
}
