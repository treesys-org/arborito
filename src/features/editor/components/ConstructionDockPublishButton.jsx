import { resolveScopePublishButton } from '../api/construction-scope-publish.js';

/** Short label for dock tabs (same row as Home / Search). */
export function shortDockLabel(s) {
    const t = String(s || '').trim();
    if (!t) return '…';
    const first = t.split(/\s+/)[0].replace(/[,;:.)]+$/g, '');
    if (!first) return '…';
    const max = 20;
    return first.length <= max ? first : `${first.slice(0, max - 1)}…`;
}

export function ConstructionDockPublishButton({ ui, scopeKind, canShowPublish, publishingPublic, revokingPublic, variant = 'dock', onClick }) {
    if (!canShowPublish) return null;

    const pub = resolveScopePublishButton(ui, {
        scopeKind: scopeKind || 'branch_course',
        publishingPublic,
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

    const variantClass =
        effective.variant === 'danger'
            ? 'cp-dock-tab--cta cp-dock-tab--cta-danger'
            : effective.variant === 'update'
              ? 'cp-dock-tab--cta cp-dock-tab--cta-amber'
              : 'cp-dock-tab--cta';
    const glyph = effective.busy ? '⏳' : effective.icon;
    const isMob = variant === 'mob';

    return (
        <button
            type="button"
            id="btn-public-tree"
            data-arbor-tour="con-publish"
            className={
                isMob
                    ? `arborito-mob-tab cp-construct-mob-tab--publish ${variantClass}`.trim()
                    : `cp-dock-tab ${variantClass}`.trim()
            }
            title={effective.title}
            aria-label={effective.title}
            disabled={effective.disabled}
            onClick={onClick}
        >
            {isMob ? (
                <>
                    <span className="arborito-mob-tab__icon" aria-hidden="true">
                        {glyph}
                    </span>
                    <span className="arborito-mob-tab__label">{shortDockLabel(effective.label)}</span>
                </>
            ) : (
                <>
                    <span className="cp-dock-tab__curriculum-glyph" aria-hidden="true">
                        {glyph}
                    </span>
                    <span className="cp-dock-tab__label">{shortDockLabel(effective.label)}</span>
                </>
            )}
        </button>
    );
}
