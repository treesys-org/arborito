import { useMemo } from 'react';
import { shouldShowMobileUI } from '../../shared/ui/breakpoints.js';
import { LoadingBrand, LoadingBrandRing } from '../../shared/ui/Loading.jsx';
import { DockModalShell, ModalCenteredShell } from './ModalShell.jsx';
import { ModalHubHero } from './ModalHero.jsx';
import { ContributorHubShell } from '../../features/nostr/modals/ContributorHubShell.jsx';
import { CONSTRUCTION_HISTORY_HUB_SHELL, CONSTRUCTION_EDIT_PICK_SHELL, PUBLISH_COMPACT_SHELL } from '../../features/editor/api/construction-hub-chrome.js';
import { constructionHubSheetClassName, isConstructionHubCompact } from '../../features/editor/api/construction-hub-sheet.js';
import { ConstructionModalShell } from '../../features/editor/modals/ConstructionModalShell.jsx';
import { BranchPublishFooterSkeleton } from '../../features/publishing/modals/BranchPublishFooter.jsx';
import { modalCtaConfirmFull, MODAL_CTA_CANCEL, modalCtaConfirm } from '../../shared/ui/modal-action-chrome.js';
import { useSourcesSlice } from '../../stores/sources-store.js';
import { getUserStoreAction } from '../../stores/identity-store-actions.js';
import { nostrActions } from '../../stores/nostr-store.js';
import { resolveContributorHubViewFromSource } from '../../features/nostr/api/contributor-hub-view.js';

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
    /** Minimal shell while lazy modal chunk loads, full DockModalShell not required (see MODAL_STANDARDS §4). */
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
                    leadingIcon="🎮"
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
                    leadingIcon="💬"
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

function CertificatesChunkFallback({ ui, mobile }) {
    return (
        <DockModalShell
            mobile={mobile}
            sizeTier="HUB"
            hero={
                <ModalHubHero
                    ui={ui}
                    mobile={mobile}
                    title={ui.navCertificates || 'Logros'}
                    titleId="modal-title-text"
                    subtitle={ui.certificatesTagline || 'Logros y diplomas'}
                    leadingIcon="🏆"
                />
            }
            skipBodyWrap
            shellOpts={{ rootFlags: 'arborito-modal--certificates-hub', z: 200 }}
        >
            <div className="flex flex-col min-h-0 flex-1">
                <LoadingPanel label={ui.loading} tone="sky" />
            </div>
        </DockModalShell>
    );
}

function ContributorChunkFallback({ ui, mobile, dockHost = false }) {
    const activeSource = useSourcesSlice((s) => s.activeSource);
    const userStore = getUserStoreAction();
    const contributorView = useMemo(
        () =>
            resolveContributorHubViewFromSource({
                activeSource,
                userStore,
                getNostrPublisherPair: nostrActions.getNostrPublisherPair,
            }),
        [activeSource, userStore]
    );
    const compact = isConstructionHubCompact('contributor', { contributorView });

    return (
        <ContributorHubShell
            ui={ui}
            mobile={mobile}
            showClose={false}
            dockHost={dockHost}
            compact={compact}
            contributorView={contributorView}
        >
            <div className="flex flex-col min-h-0 flex-1 px-4 pb-4">
                <LoadingPanel label={ui.loading} tone="slate" />
            </div>
        </ContributorHubShell>
    );
}

function ConstructionAboutChunkFallback({ ui, mobile, dockHost = false }) {
    const title = ui.constructionBranchPublishTitle || ui.publicTreePublishOnlineLabel || 'Publish';
    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={title}
            subtitle={ui.publishHubSheetTagline || ui.publicTreePublishBranchTooltip}
            titleId="construction-about-title"
            titleTruncate
            leadingIcon="📤"
            tagClass="btn-construction-about-close"
        />
    );
    const inner = (
        <div className="flex flex-col min-h-0 flex-1">
            <LoadingPanel label={ui.loading} tone="slate" />
        </div>
    );

    return (
        <ConstructionModalShell
            dockHost={dockHost}
            mobile={mobile}
            compact
            sizeTier={PUBLISH_COMPACT_SHELL.sizeTier}
            hero={hero}
            footer={<BranchPublishFooterSkeleton ui={ui} />}
            ariaLabel={ui.constructionBranchPublishTitle || 'Publish'}
            sheetClassName={constructionHubSheetClassName('construction-about')}
            shellOpts={PUBLISH_COMPACT_SHELL.shellOpts}
            panelClass={PUBLISH_COMPACT_SHELL.panelClass}
            skipBodyWrap
        >
            {inner}
        </ConstructionModalShell>
    );
}

function ConstructionCurriculumLangChunkFallback({ ui, mobile, dockHost = false }) {
    const title = ui.conConstructionLangModalTitle || ui.conLangDockTab || ui.conCurriculumLangLabel || 'Language';
    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={title}
            leadingIcon="🌐"
        />
    );
    const inner = (
        <div className="flex flex-col min-h-0 flex-1 px-4 pb-4">
            <LoadingPanel label={ui.loading} tone="slate" />
        </div>
    );

    return (
        <ConstructionModalShell
            dockHost={dockHost}
            mobile={mobile}
            compact
            sizeTier="COMPACT"
            hero={hero}
            ariaLabel={title}
            sheetClassName={constructionHubSheetClassName('construction-curriculum-lang')}
            shellOpts={{ scrim: 'translucent', rootFlags: 'arborito-modal--language', layout: 'dock-bottom' }}
            panelClass="arborito-modal-dock-panel w-full max-h-[85vh]"
        >
            {inner}
        </ConstructionModalShell>
    );
}

function ConstructionHistoryChunkFallback({ ui, mobile, dockHost = false }) {
    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={ui.conHistoryTitle || 'Edit history'}
            subtitle={ui.conHistorySheetTagline || ui.conHistorySelectStep}
            leadingIcon="🕒"
        />
    );
    const inner = (
        <div className="flex flex-col min-h-0 flex-1">
            <LoadingPanel label={ui.loading} tone="slate" />
        </div>
    );

    return (
        <ConstructionModalShell
            dockHost={dockHost}
            mobile={mobile}
            sizeTier={CONSTRUCTION_HISTORY_HUB_SHELL.sizeTier}
            hero={hero}
            ariaLabel={ui.conHistoryTitle || 'Edit history'}
            shellOpts={CONSTRUCTION_HISTORY_HUB_SHELL.shellOpts}
            panelClass={CONSTRUCTION_HISTORY_HUB_SHELL.panelClass}
            skipBodyWrap
        >
            {inner}
        </ConstructionModalShell>
    );
}

function BackupFooterSkeleton({ ui, mobile }) {
    const exportLbl = ui.backupBtn || 'Guardar en archivo';
    const importLbl = ui.profileImportBackupButton || ui.restoreBtn || 'Importar archivo';
    return (
        <div className="arborito-modal-footer arborito-modal-footer--blend" role="status" aria-busy="true">
            <div className={`arborito-action-row${mobile ? ' arborito-action-row--stack-mobile' : ''}`}>
                <button type="button" className={`${modalCtaConfirmFull('emerald')} opacity-60 pointer-events-none`} disabled>
                    {exportLbl}
                </button>
                <button type="button" className={`${modalCtaConfirmFull('slate')} opacity-60 pointer-events-none`} disabled>
                    {importLbl}
                </button>
            </div>
        </div>
    );
}

function BackupChunkFallback({ ui, mobile }) {
    const title = ui.profileBackupGroupLabel || ui.backpackTitle || 'Respaldo';
    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={title}
            titleTruncate
            titleId="backup-modal-title"
            leadingIcon="💾"
            tagClass="btn-close"
        />
    );
    const body = (
        <div className="px-4 pb-4 pt-2 flex flex-col min-h-0 flex-1">
            <LoadingPanel label={ui.loading} tone="slate" />
        </div>
    );
    const footer = <BackupFooterSkeleton ui={ui} mobile={mobile} />;

    if (mobile) {
        return (
            <DockModalShell
                mobile
                sizeTier="COMPACT"
                layout="dock-bottom"
                shellOpts={{ rootFlags: 'arborito-modal--backup', scrim: 'translucent' }}
                panelClass="arborito-modal-dock-panel w-full max-h-[85vh]"
                hero={hero}
                footer={footer}
            >
                {body}
            </DockModalShell>
        );
    }

    return (
        <ModalCenteredShell
            mobile={false}
            layout="centered"
            sizeTier="COMPACT"
            hero={hero}
            footer={footer}
            panelRadius="2xl"
            shellOpts={{ rootFlags: 'arborito-modal--backup', enter: 'fade-fast', scrim: 'translucent' }}
        >
            {body}
        </ModalCenteredShell>
    );
}

function SourcesChunkFallback({ ui, mobile }) {
    return (
        <DockModalShell
            mobile={mobile}
            sizeTier="HUB"
            rootClass="arborito-sources-modal-shell"
            skipBodyWrap
            shellOpts={{ rootFlags: 'arborito-modal--sources' }}
            hero={
                <ModalHubHero
                    mobile={mobile}
                    title={ui.sourceManagerTitle || ui.navSources || 'Library'}
                    subtitle={ui.sourceManagerDesc}
                    leadingIcon="📚"
                />
            }
        >
            <div className="flex flex-col min-h-0 flex-1">
                <LoadingPanel label={ui.loading} tone="sky" />
            </div>
        </DockModalShell>
    );
}

function NodePropertiesChunkFallback({ ui, mobile }) {
    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={ui.nodePropertiesTitle || 'Properties'}
            leadingIcon="⚙️"
        />
    );
    const footer = (
        <div className="arborito-modal-footer arborito-modal-footer--bg-flat">
            <div className="arborito-action-row">
                <button type="button" className={`${MODAL_CTA_CANCEL} opacity-60 pointer-events-none`} disabled>
                    Cancel
                </button>
                <button type="button" className={`${modalCtaConfirm('sky')} opacity-60 pointer-events-none`} disabled>
                    Save
                </button>
            </div>
        </div>
    );
    const body = (
        <div className="p-6 flex flex-col min-h-0 flex-1">
            <LoadingPanel label={ui.loading} tone="slate" />
        </div>
    );

    if (mobile) {
        return (
            <DockModalShell mobile sizeTier="STANDARD" hero={hero} footer={footer}>
                {body}
            </DockModalShell>
        );
    }

    return (
        <ModalCenteredShell mobile={false} layout="centered" sizeTier="STANDARD" hero={hero} footer={footer}>
            {body}
        </ModalCenteredShell>
    );
}

function ExportPdfChunkFallback({ ui, mobile }) {
    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={ui.exportTitle || 'Export PDF'}
            leadingIcon="📄"
            tagClass="btn-close"
        />
    );
    const body = (
        <div className="px-4 pb-6 pt-2 flex flex-col min-h-0 flex-1">
            <LoadingPanel label={ui.loading} tone="slate" />
        </div>
    );

    if (mobile) {
        return (
            <DockModalShell mobile sizeTier="COMPACT" hero={hero}>
                {body}
            </DockModalShell>
        );
    }

    return (
        <ModalCenteredShell mobile={false} layout="centered" sizeTier="COMPACT" hero={hero}>
            {body}
        </ModalCenteredShell>
    );
}

function ConstructionEditPickChunkFallback({ ui, mobile }) {
    const title = ui.constructionEnterPickTitle || 'What do you want to edit?';
    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={title}
            leadingIcon="🏗️"
            tagClass="btn-construction-pick-close"
        />
    );
    const inner = (
        <div className="px-4 pb-6 pt-2 flex flex-col min-h-0 flex-1">
            <LoadingPanel label={ui.loading} tone="slate" />
        </div>
    );

    if (mobile) {
        const shell = CONSTRUCTION_EDIT_PICK_SHELL;
        return (
            <DockModalShell
                mobile
                layout={shell.shellOpts.layout}
                sizeTier={shell.sizeTier}
                panelClass={shell.panelClass}
                skipBodyWrap
                useDockChrome
                shellOpts={shell.shellOpts}
                hero={hero}
            >
                {inner}
            </DockModalShell>
        );
    }

    return (
        <DockModalShell
            mobile={false}
            layout="centered"
            sizeTier="COMPACT"
            skipBodyWrap
            shellOpts={{ scrim: 'translucent' }}
            hero={hero}
        >
            {inner}
        </DockModalShell>
    );
}

function SearchChunkFallback({ ui, mobile }) {
    return (
        <DockModalShell
            mobile={mobile}
            useDockChrome={false}
            shellOpts={{
                rootFlags: 'arborito-modal--search arborito-search-dock',
                panelRadius: 'none',
            }}
            hero={
                <ModalHubHero
                    ui={ui}
                    mobile={mobile}
                    title={ui.navSearch || 'Search'}
                    leadingIcon="🔍"
                    tagClass="btn-close-search"
                />
            }
        >
            <div className="flex-1 flex flex-col min-h-0">
                <LoadingPanel label={ui.loading} tone="sky" />
            </div>
        </DockModalShell>
    );
}

/** Suspense fallback while lazy modal chunks load. */
export function ModalChunkFallback({ chunkType, ui, dockHost = false }) {
    const mobUi = shouldShowMobileUI();
    if (chunkType === 'search') return <SearchChunkFallback ui={ui || {}} mobile={mobUi} />;
    if (chunkType === 'arcade') return <ArcadeChunkFallback ui={ui || {}} mobile={mobUi} />;
    if (chunkType === 'forum') return <ForumChunkFallback ui={ui || {}} mobile={mobUi} />;
    if (chunkType === 'certificates') return <CertificatesChunkFallback ui={ui || {}} mobile={mobUi} />;
    if (chunkType === 'contributor') return <ContributorChunkFallback ui={ui || {}} mobile={mobUi} dockHost={dockHost} />;
    if (chunkType === 'construction-history') {
        return <ConstructionHistoryChunkFallback ui={ui || {}} mobile={mobUi} dockHost={dockHost} />;
    }
    if (chunkType === 'construction-about') {
        return <ConstructionAboutChunkFallback ui={ui || {}} mobile={mobUi} dockHost={dockHost} />;
    }
    if (chunkType === 'construction-curriculum-lang') {
        return <ConstructionCurriculumLangChunkFallback ui={ui || {}} mobile={mobUi} dockHost={dockHost} />;
    }
    if (chunkType === 'backup') return <BackupChunkFallback ui={ui || {}} mobile={mobUi} />;
    if (chunkType === 'sources') return <SourcesChunkFallback ui={ui || {}} mobile={mobUi} />;
    if (chunkType === 'node-properties') return <NodePropertiesChunkFallback ui={ui || {}} mobile={mobUi} />;
    if (chunkType === 'export-pdf') return <ExportPdfChunkFallback ui={ui || {}} mobile={mobUi} />;
    if (chunkType === 'construction-edit-pick') {
        return <ConstructionEditPickChunkFallback ui={ui || {}} mobile={mobUi} />;
    }
    return <GenericChunkFallback />;
}
