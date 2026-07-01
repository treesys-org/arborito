import { lazy, Suspense } from 'react';
import { PanelEmbedHost } from '../../../../app/components/PanelEmbedHost.jsx';

const ModalAbout = lazy(() => import('../../modals/AboutModal.jsx').then((m) => ({ default: m.ModalAbout })));
const ModalSources = lazy(() =>
    import('../../../sources/modals/SourcesModal.jsx').then((m) => ({ default: m.ModalSources }))
);
const ModalCertificates = lazy(() =>
    import('../../../garden-progress/modals/CertificatesModal.jsx').then((m) => ({
        default: m.ModalCertificates,
    }))
);
const ModalForum = lazy(() =>
    import('../../../forum/modals/ForumModal.jsx').then((m) => ({ default: m.ModalForum }))
);
const ModalCelebrationPrefs = lazy(() =>
    import('../../../garden-progress/modals/CelebrationPrefsModal.jsx').then((m) => ({
        default: m.ModalCelebrationPrefs,
    }))
);
const ModalAccessibilityPrefs = lazy(() =>
    import('../../../garden-progress/modals/AccessibilityPrefsModal.jsx').then((m) => ({
        default: m.ModalAccessibilityPrefs,
    }))
);

const EMBED_MAP = {
    about: ModalAbout,
    sources: ModalSources,
    certs: ModalCertificates,
    forum: ModalForum,
    celebration: ModalCelebrationPrefs,
    a11y: ModalAccessibilityPrefs,
};

export function SidebarEmbedPane({ pane }) {
    const Component = EMBED_MAP[pane];
    if (!Component) return null;
    const hostAttr = {
        about: { 'data-arborito-embed-host': 'about' },
        sources: { 'data-arborito-embed-host': 'sources' },
        certs: { 'data-arborito-embed-host': 'certificates' },
        forum: { 'data-arborito-embed-host': 'forum' },
        celebration: { 'data-arborito-embed-host': 'celebration-prefs' },
        a11y: { 'data-arborito-embed-host': 'accessibility-prefs' },
    }[pane];

    return (
        <div
            className={
                pane === 'about'
                    ? 'arborito-mmenu-about-host flex flex-col flex-1 min-h-0 w-full'
                    : 'arborito-mmenu-embed-pane-host flex flex-col flex-1 min-h-0 w-full min-w-0'
            }
            {...hostAttr}
        >
            <Suspense fallback={null}>
                <PanelEmbedHost component={Component} embed className="flex flex-col flex-1 min-h-0 w-full min-w-0" />
            </Suspense>
        </div>
    );
}
