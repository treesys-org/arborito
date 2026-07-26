import { resolveScopePublishButton } from '../api/construction-scope-publish.js';
import { shortDockLabel } from '../../../shared/ui/MobDockTab.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

function publishCtaClass(variant) {
    if (variant === 'danger') return 'arborito-mob-tab--cta arborito-mob-tab--cta-danger';
    if (variant === 'update') return 'arborito-mob-tab--cta arborito-mob-tab--cta-amber';
    if (variant === 'published') return 'arborito-mob-tab--cta arborito-mob-tab--cta-published';
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
    /* Never invent a disabled “Publicar” — that looked clickable and did nothing. */
    if (!pub || pub.show === false) return null;
    const effective = pub;

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
            <span className="arborito-mob-tab__label">
                {effective.isUpToDate
                    ? effective.label
                    : shortDockLabel(effective.label)}
            </span>
        </button>
    );
}
