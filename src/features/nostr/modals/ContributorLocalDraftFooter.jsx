import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { modalCtaConfirmFull } from '../../../shared/ui/modal-action-chrome.js';

/** Sticky publish CTA for local-draft team hub, shell footer slot (matches BranchPublishFooter). */
export function ContributorLocalDraftFooter({ ui, onPublish }) {
    const mobile = shouldShowMobileUI();

    return (
        <div className="arborito-modal-footer arborito-modal-footer--blend">
            <div className={`arborito-action-row${mobile ? ' arborito-action-row--stack-mobile' : ''}`}>
                <button
                    type="button"
                    id="btn-governance-make-public"
                    className={modalCtaConfirmFull('emerald')}
                    onClick={onPublish}
                >
                    {ui.governanceLocalMakePublicCta || ui.publicTreeDockLabel || 'Publish branch'}
                </button>
            </div>
        </div>
    );
}
