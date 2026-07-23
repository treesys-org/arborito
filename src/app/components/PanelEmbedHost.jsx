/**
 * Renders an embedded panel component inside a host (sidebar mobile dock, construction about, etc.).
 *
 * @param {{ component: import('react').ComponentType<{ embed?: boolean }> | null, embed?: boolean, className?: string }} props
 */
export function PanelEmbedHost({ component: Component, embed = true, className }) {
    if (!Component) return null;
    return (
        <div className={className} data-arborito-embed-host="">
            <Component embed={embed} />
        </div>
    );
}
