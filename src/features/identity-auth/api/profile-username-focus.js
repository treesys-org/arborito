/** Scroll to and highlight the guest auth username field (or signed-in display name). */
export function focusProfileUsernameField() {
    if (typeof document === 'undefined') return;
    const authInput = document.getElementById('profile-auth-username');
    if (authInput) {
        authInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        authInput.setAttribute('aria-invalid', 'true');
        authInput.classList.add('arborito-onb-input--attention');
        try {
            authInput.focus({ preventScroll: true });
        } catch (_) {}
        return;
    }
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
    const authInput = document.getElementById('profile-auth-username');
    authInput?.removeAttribute('aria-invalid');
    authInput?.classList.remove('arborito-onb-input--attention');
}
