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
        return ui.publicTreeUpToDateLabel || 'Up to date';
    }
    return ui.publishDiffPublishCta || ui.publicTreeRepublishButton || 'Publish these changes';
}

/** Scroll host class for publish hub body (ConstructionAboutModal). */
export const PUBLISH_HUB_BODY_SCROLL =
    'flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar px-3 py-3 sm:px-4 sm:py-4';
