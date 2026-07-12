import { useEffect, useMemo } from 'react';
import { useNostr } from '../hooks/useNostr.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { ContributorPanelBody } from './ContributorPanelBody.jsx';
import { ContributorHubShell } from './ContributorHubShell.jsx';
import { ContributorLocalDraftFooter } from './ContributorLocalDraftFooter.jsx';
import { resolveContributorHubViewFromSource } from '../api/contributor-hub-view.js';
import { isConstructionHubCompact } from '../../editor/api/construction-hub-sheet.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { getAuthSessionAction } from '../../../stores/identity-store-actions.js';
import { getArboritoStore } from '../../../core/store-singleton.js';
import { openPublishHub } from '../../publishing/api/account-hub-gate.js';

/** Team / governance hub, collaborators, links, publish CTA. */
export function ModalContributor({ dockHost = false, instantReveal = false }) {
    const nostr = useNostr();
    const {
        ui,
        dismissModal,
        notify,
        activeSource,
        rawGraphData,
        userStore,
        treeCollaboratorRoles,
        treeCollaboratorUsernames,
        getNostrPublisherPair,
        getMyTreeNetworkRole,
        inviteNostrCollaborator,
        removeNostrCollaborator,
    } = nostr;
    const accountUsername = String(getAuthSessionAction()?.username || '').trim();
    const mobile = shouldShowMobileUI();

    const hubView = useMemo(
        () =>
            resolveContributorHubViewFromSource({
                activeSource,
                userStore,
                getNostrPublisherPair,
            }),
        [activeSource, userStore, getNostrPublisherPair]
    );
    const compact = isConstructionHubCompact('contributor', { contributorView: hubView });
    const canPublish = !!fileSystem.features.canWrite;

    useEffect(() => {
        document.documentElement.classList.add('arborito-contributor-modal-open');
        return () => document.documentElement.classList.remove('arborito-contributor-modal-open');
    }, []);

    const close = () => dismissModal();

    const openPublishFromTeam = () => {
        dismissModal();
        void openPublishHub(getArboritoStore());
    };

    const footer =
        hubView === 'localDraft' && canPublish ? (
            <ContributorLocalDraftFooter ui={ui} onPublish={openPublishFromTeam} />
        ) : null;

    const body = (
        <ContributorPanelBody
            ui={ui}
            notify={notify}
            activeSource={activeSource}
            rawGraphData={rawGraphData}
            userStore={userStore}
            treeCollaboratorRoles={treeCollaboratorRoles}
            treeCollaboratorUsernames={treeCollaboratorUsernames}
            accountUsername={accountUsername}
            getNostrPublisherPair={getNostrPublisherPair}
            getMyTreeNetworkRole={getMyTreeNetworkRole}
            inviteNostrCollaborator={inviteNostrCollaborator}
            removeNostrCollaborator={removeNostrCollaborator}
        />
    );

    return (
        <div data-arborito-panel="modal-contributor">
            <ContributorHubShell
                ui={ui}
                mobile={mobile}
                onClose={close}
                dockHost={dockHost}
                compact={compact}
                contributorView={hubView}
                instantReveal={instantReveal}
                footer={footer}
            >
                {body}
            </ContributorHubShell>
        </div>
    );
}
