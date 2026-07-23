/** Completed-lesson tick for UI chrome (SVG — not emoji/dingbat). */
export function CompletedTickIcon({ className = '', size = 14, title = '' }) {
    const s = Math.max(10, Number(size) || 14);
    return (
        <svg
            className={className}
            width={s}
            height={s}
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden={title ? undefined : true}
            role={title ? 'img' : undefined}
            aria-label={title || undefined}
        >
            <path
                d="M3.2 8.2 6.4 11.4 12.8 4.2"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
