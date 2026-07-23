/** Shared modal body wrapper — matches ChangePasswordModal / onboarding form chrome. */
export function AuthModalForm({ children }) {
    return (
        <div className="arborito-auth-surface">
            <div className="arborito-onb-form">{children}</div>
        </div>
    );
}
