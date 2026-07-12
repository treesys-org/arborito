import { useConstructionAbout } from '../hooks/useConstructionAbout.js';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { TreePresentation } from '../../tree-graph/components/TreePresentation.jsx';
import { PublishDiffPanel } from '../../publishing/modals/PublishDiffPanel.jsx';
import { BranchPublishFooter } from '../../publishing/modals/BranchPublishFooter.jsx';
import { PUBLISH_HUB_BODY_SCROLL } from '../../publishing/api/publish-hub-chrome.js';
import { PUBLISH_COMPACT_SHELL } from '../api/construction-hub-chrome.js';
import { constructionHubSheetClassName } from '../api/construction-hub-sheet.js';
import { ConstructionModalShell } from './ConstructionModalShell.jsx';
import { modalCtaConfirmFull } from '../../../shared/ui/modal-action-chrome.js';

/** Branch metadata + optional change diff + publish, dock hub above construction dock. */
export function ModalConstructionAbout({ dockHost = false, instantReveal = false }) {
    const {
        ui,
        modal,
        activeSource,
        rawGraphData,
        userStore,
        publishTreePublicInteractive,
        notify,
        formRef,
        mobile,
        title,
        subtitle,
        instantOpen,
        close,
        flushMetadata,
        showForumModerationLink,
        openForumModeration,
    } = useConstructionAbout();

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={title}
            subtitle={subtitle || undefined}
            titleId="construction-about-title"
            titleTruncate
            leadingIcon="📤"
            tagClass="btn-construction-about-close"
            onClose={close}
        />
    );

    const footer = (
        <BranchPublishFooter
            ui={ui}
            modal={modal}
            activeSource={activeSource}
            rawGraphData={rawGraphData}
            userStore={userStore}
            publishTreePublicInteractive={publishTreePublicInteractive}
            flushMetadata={flushMetadata}
            notify={notify}
            onClose={close}
        />
    );

    const body = (
        <div className={`${PUBLISH_HUB_BODY_SCROLL} md:px-6`}>
            {showForumModerationLink ? (
                <div className="construction-publish-hub__forum-block">
                    <div className="arborito-action-row arborito-action-row--stack-mobile">
                        <button
                            type="button"
                            className={modalCtaConfirmFull('sky')}
                            onClick={openForumModeration}
                        >
                            {ui.constructionForumModerationLink || 'Open forum (moderation)'}
                        </button>
                    </div>
                    <p className="construction-publish-hub__forum-hint">
                        {ui.constructionForumModerationHint ||
                            'Choose Open or Strict (review first) posting policy and approve pending messages.'}
                    </p>
                </div>
            ) : null}
            <TreePresentation modalHost publishHub formRef={formRef} />
            <PublishDiffPanel
                ui={ui}
                modal={modal}
                activeSource={activeSource}
                rawGraphData={rawGraphData}
                userStore={userStore}
            />
        </div>
    );

    const shell = PUBLISH_COMPACT_SHELL;
    const shellOpts = {
        ...shell.shellOpts,
        instantOpen: instantOpen || instantReveal || undefined,
    };

    return (
        <ConstructionModalShell
            dockHost={dockHost}
            mobile={mobile}
            compact
            sizeTier={shell.sizeTier}
            hero={hero}
            footer={footer}
            onClose={close}
            ariaLabel={title}
            instantReveal={instantOpen || instantReveal}
            panelDataAttr="modal-construction-about"
            sheetClassName={constructionHubSheetClassName('construction-about')}
            shellOpts={shellOpts}
            panelClass={shell.panelClass}
            skipBodyWrap
        >
            {body}
        </ConstructionModalShell>
    );
}
