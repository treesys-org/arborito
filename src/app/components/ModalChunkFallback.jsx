import { shouldShowMobileUI } from '../../shared/ui/breakpoints.js';
import { LoadingBrand, LoadingBrandRing } from '../../shared/ui/Loading.jsx';
import { DockModalShell } from './ModalShell.jsx';
import { ModalHubHero } from './ModalHero.jsx';
import { ChromeEmoji } from './ChromeEmoji.jsx';

function LoadingPanel({ label, tone = 'sky' }) {
    const toneCls =
        tone === 'sky'
            ? ' arborito-loading-panel--sky'
            : tone === 'slate'
              ? ' arborito-loading-panel--slate'
              : ' arborito-loading-panel--sage';
    return (
        <div
            className={`arborito-loading-panel${toneCls}`}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <LoadingBrand
                label={label}
                size="lg"
                tone={tone === 'slate' ? 'slate' : 'sage'}
                extraClass="arborito-loading-brand--panel"
            />
        </div>
    );
}

function GenericChunkFallback() {
    return (
        <div
            id="modal-backdrop"
            className="arborito-modal-root arborito-modal-root--chunk-pending fixed inset-0 z-[200] flex items-center justify-center"
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <div className="arborito-modal-chunk-spinner" aria-hidden="true">
                <LoadingBrandRing size="md" />
            </div>
        </div>
    );
}

function ArcadeChunkFallback({ ui, mobile }) {
    return (
        <DockModalShell
            mobile={mobile}
            sizeTier="HUB"
            hero={
                <ModalHubHero
                    ui={ui}
                    mobile={mobile}
                    wrapperId="main-header"
                    tagClass="btn-close"
                    title={ui.arcadeTitle}
                    subtitle={ui.arcadeDesc}
                    leadingIcon={<ChromeEmoji emoji="🎮" size={mobile ? 24 : 28} />}
                />
            }
            skipBodyWrap
            shellOpts={{ rootFlags: 'arborito-modal--arcade' }}
        >
            <div id="modal-content" className="flex flex-col min-h-0 flex-1">
                <LoadingPanel label={ui.loading} tone="sky" />
            </div>
        </DockModalShell>
    );
}

function ForumChunkFallback({ ui, mobile }) {
    return (
        <DockModalShell
            mobile={mobile}
            sizeTier="FORUM"
            hero={
                <ModalHubHero
                    ui={ui}
                    mobile={mobile}
                    showClose
                    title={ui.forumTitle || 'Forum'}
                    titleId="forum-modal-title"
                    leadingIcon={<ChromeEmoji emoji="💬" size={mobile ? 24 : 28} />}
                />
            }
            skipBodyWrap
            shellOpts={{ rootFlags: 'arborito-modal--forum' }}
        >
            <div className="flex flex-col min-h-0 flex-1">
                <LoadingPanel label={ui.loading} tone="sky" />
            </div>
        </DockModalShell>
    );
}

/** Suspense fallback while lazy modal chunks load. */
export function ModalChunkFallback({ chunkType, ui }) {
    const mobUi = shouldShowMobileUI();
    if (chunkType === 'arcade') return <ArcadeChunkFallback ui={ui || {}} mobile={mobUi} />;
    if (chunkType === 'forum') return <ForumChunkFallback ui={ui || {}} mobile={mobUi} />;
    return <GenericChunkFallback />;
}
