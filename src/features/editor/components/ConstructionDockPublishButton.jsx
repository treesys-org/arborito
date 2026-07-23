import { resolveScopePublishButton } from '../api/construction-scope-publish.js';
import { shortDockLabel } from '../../../shared/ui/MobDockTab.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

function publishCtaClass(variant) {
    if (variant === 'danger') return 'arborito-mob-tab--cta arborito-mob-tab--cta-danger';
    if (variant === 'update') return 'arborito-mob-tab--cta arborito-mob-tab--cta-amber';
    return 'arborito-mob-tab--cta';
}

export function ConstructionDockPublishButton({
    ui,
    scopeKind,
    canShowPublish,
    publishingPublic,
    revokingPublic,
    openingPublishHub = false,
    publishHubActive = false,
    onClick,
}) {
    if (!canShowPublish) return null;

    const pub = resolveScopePublishButton(ui, {
        scopeKind: scopeKind || 'branch_course',
        publishingPublic: publishingPublic || openingPublishHub,
        revokingPublic,
    });
    const effective =
        pub && pub.show !== false
            ? pub
            : {
                  label: ui.publicTreeDockLabel || ui.publicTreePublishBranchLabel || 'Publish',
                  title: ui.publicTreeDockTooltip || ui.publicTreePublishBranchTooltip || 'Publish',
                  icon: '🌐',
                  busy: !!(publishingPublic || revokingPublic),
                  disabled: true,
                  variant: 'publish',
              };

    const glyph = effective.busy ? '⏳' : effective.icon;

    return (
        <button
            type="button"
            id="btn-public-tree"
            data-arbor-tour="con-publish"
            className={`arborito-mob-tab ${publishCtaClass(effective.variant)}${publishHubActive ? ' arborito-mob-tab--active' : ''}`.trim()}
            title={effective.title}
            aria-label={effective.title}
            disabled={effective.disabled}
            onClick={onClick}
        >
            <span className="arborito-mob-tab__icon" aria-hidden="true">
                <ChromeEmoji emoji={glyph} size={22} />
            </span>
            <span className="arborito-mob-tab__label">{shortDockLabel(effective.label)}</span>
        </button>
    );
}
