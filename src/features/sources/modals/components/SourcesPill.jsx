export function SourcesPill({ children, className = '' }) {
    return (
        <span className={`arborito-pill arborito-pill--chip border ${className}`}>
            {children}
        </span>
    );
}
