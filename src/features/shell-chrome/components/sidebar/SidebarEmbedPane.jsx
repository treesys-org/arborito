import { EAGER_MODALS } from '../../../../app/components/eager-modals.js';
import { PanelEmbedHost } from '../../../../app/components/PanelEmbedHost.jsx';
import { useModalChunk } from '../../../../app/hooks/useModalChunk.js';

const EAGER_EMBED_MAP = {
    about: EAGER_MODALS.about,
    celebration: EAGER_MODALS['celebration-prefs'],
    a11y: EAGER_MODALS['accessibility-prefs'],
};

const LAZY_EMBED_TYPES = {
    sources: 'sources',
    certs: 'certificates',
    forum: 'forum',
};

const HOST_ATTR = {
    about: { 'data-arborito-embed-host': 'about' },
    sources: { 'data-arborito-embed-host': 'sources' },
    certs: { 'data-arborito-embed-host': 'certificates' },
    forum: { 'data-arborito-embed-host': 'forum' },
    celebration: { 'data-arborito-embed-host': 'celebration-prefs' },
    a11y: { 'data-arborito-embed-host': 'accessibility-prefs' },
};

const HOST_CLASS = {
    about: 'arborito-mmenu-about-host flex flex-col flex-1 min-h-0 w-full',
    default: 'arborito-mmenu-embed-pane-host flex flex-col flex-1 min-h-0 w-full min-w-0',
};

function LazyEmbedContent({ type, className }) {
    const { ready, Component } = useModalChunk(type, type);
    if (!ready || !Component) return null;
    return <PanelEmbedHost component={Component} embed className={className} />;
}

export function SidebarEmbedPane({ pane }) {
    const hostAttr = HOST_ATTR[pane];
    const className = pane === 'about' ? HOST_CLASS.about : HOST_CLASS.default;
    const embedClass = 'flex flex-col flex-1 min-h-0 w-full min-w-0';

    const lazyType = LAZY_EMBED_TYPES[pane];
    const EagerComponent = EAGER_EMBED_MAP[pane];

    if (!lazyType && !EagerComponent) return null;

    return (
        <div className={className} {...hostAttr}>
            {lazyType ? (
                <LazyEmbedContent type={lazyType} className={embedClass} />
            ) : (
                <PanelEmbedHost component={EagerComponent} embed className={embedClass} />
            )}
        </div>
    );
}
