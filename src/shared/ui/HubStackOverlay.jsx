/**
 * Full-screen stack overlay inside a dock hub panel (Biblioteca tree editor, …).
 * Parent hub stays mounted, mount under the hub's overlay host (`absolute inset-0`).
 */
export function HubStackOverlay({ children, className = '', ariaLabel, ariaLabelledBy }) {
    return (
        <div
            className={`arborito-hub-stack-overlay absolute inset-0 flex flex-col min-h-0 w-full bg-white dark:bg-slate-900 ${className}`.trim()}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel || undefined}
            aria-labelledby={ariaLabelledBy || undefined}
        >
            {children}
        </div>
    );
}
