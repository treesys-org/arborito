/**
 * Publish hub (construction-about), footer CTA labels.
 * Dock tab labels live in construction-scope-publish.js → ConstructionDockPublishButton.
 */

export function resolvePublishHubFooterLabel(ui = {}, { isFirstPublish, noChanges }) {
    if (isFirstPublish) {
        return (
            ui.publicTreePublishOnlineLabel ||
            ui.publicTreePublishBranchDockLabel ||
            ui.publicTreeConfirmButton ||
            'Publish online'
        );
    }
    if (noChanges) {
        /* Hub no longer shows this as a fake CTA; dock still uses the short status word. */
        return ui.publicTreeUpToDateLabel || ui.publishDiffClean || 'Up to date';
    }
    return (
        ui.publicTreeUpdateLabel ||
        ui.publishDiffPublishCta ||
        ui.publicTreeRepublishButton ||
        'Update'
    );
}

/** Scroll host class for publish hub body (ConstructionAboutModal). */
export const PUBLISH_HUB_BODY_SCROLL =
    'flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar px-3 py-3 sm:px-4 sm:py-4';
