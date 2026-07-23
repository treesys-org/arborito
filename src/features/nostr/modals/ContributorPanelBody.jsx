import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualScrollSlice } from '../../../shared/hooks/useVirtualScrollSlice.js';
import { SourcesFilterChip } from '../../sources/modals/components/SourcesFilterChip.jsx';
import { SourcesShareCodeField } from '../../sources/modals/components/SourcesShareCodeField.jsx';
import { parseNostrTreeUrl } from '../api/nostr-refs.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { modalCtaConfirmFull } from '../../../shared/ui/modal-action-chrome.js';
import { copyTextToClipboard } from '../../../shared/lib/copy-text.js';
import {
    resolveContributorHubViewFromSource,
    resolveContributorIntroText,
} from '../api/contributor-hub-view.js';
import { CONTRIBUTOR_HUB_BODY_SCROLL } from '../api/contributor-hub-chrome.js';

function abbrevPublicKey(pub) {
    const s = String(pub || '');
    if (s.length <= 22) return s;
    return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

function ContributorHubSection({ title, subtitle, children, variant = 'plain' }) {
    return (
        <section className={`contributor-hub-section contributor-hub-section--${variant}`}>
            <header className="contributor-hub-section__head">
                <p className="arborito-eyebrow m-0">{title}</p>
                {subtitle ? <p className="contributor-hub-section__subtitle m-0">{subtitle}</p> : null}
            </header>
            {children}
        </section>
    );
}

function fieldLabel(text, htmlFor) {
    return (
        <label className="contributor-hub-field-label" htmlFor={htmlFor}>
            {text}
        </label>
    );
}

/** Local branch not published, consolidated amber warning gate (Callout only; CTA in shell footer). */
function ContributorLocalDraftGate({ ui }) {
    return (
        <div className="contributor-hub-gate flex flex-col w-full">
            <Callout
                tone="amber"
                layout="stack"
                icon="📡"
                title={ui.governanceLocalNoActionsTitle || 'Branch only on this device'}
                extraClass="contributor-hub-publish-gate rounded-xl"
                titleClass="arborito-callout__title text-sm font-black m-0"
            >
                <p className="arborito-callout__body text-xs leading-relaxed m-0">
                    {ui.governanceLocalNoActionsBody ||
                        'Publish this branch to share it, invite editors, and open it on other devices.'}
                </p>
                {ui.governanceLocalNoActionsPublishedBenefits ? (
                    <p className="contributor-hub-gate-detail m-0 text-xs leading-relaxed">
                        {ui.governanceLocalNoActionsPublishedBenefits}
                    </p>
                ) : null}
                {ui.governanceLocalNoActionsHelp ? (
                    <p className="contributor-hub-gate-detail contributor-hub-gate-detail--muted m-0 text-xs leading-relaxed">
                        {ui.governanceLocalNoActionsHelp}
                    </p>
                ) : null}
            </Callout>
        </div>
    );
}

/** No public / network branch context. */
function ContributorNoTreeEmpty({ ui }) {
    return (
        <div className="contributor-hub-gate flex flex-col w-full">
            <Callout
                tone="slate"
                layout="stack"
                icon="👥"
                title={ui.governanceNoPublicTree || 'Open an online branch to see the link.'}
                extraClass="contributor-hub-publish-gate rounded-xl"
                titleClass="arborito-callout__title text-sm font-black m-0"
            />
        </div>
    );
}

function roleLabelFor(ui, role) {
    if (role === 'proposer') {
        return ui.governanceRoleProposerShort || ui.governanceRoleProposer || 'Suggestions';
    }
    return ui.governanceRoleEditor || 'Editor';
}

const COLLAB_ROW_HEIGHT = 40;
const COLLAB_LIST_VIRTUAL_THRESHOLD = 25;

function collabDisplayLabel(row) {
    return row.inviteeUsername || abbrevPublicKey(row.inviteePub);
}

function CollaboratorRow({ ui, row, onRemove }) {
    const label = roleLabelFor(ui, row.role);
    const displayLabel = collabDisplayLabel(row);
    const roleClass =
        row.role === 'proposer'
            ? 'governance-collab-row__role--proposer'
            : 'governance-collab-row__role--editor';

    return (
        <li className="governance-collab-row governance-collab-row--compact">
            <div className="governance-collab-row__main governance-collab-row__main--inline">
                <p className="governance-collab-row__name" title={displayLabel}>
                    {displayLabel}
                </p>
                <span className={`governance-collab-row__role ${roleClass}`}>{label}</span>
            </div>
            <button
                type="button"
                className="governance-collab-remove arborito-cta-red text-xs font-bold px-2.5 py-1 rounded-lg shrink-0"
                onClick={() => onRemove(row.inviteePub)}
            >
                {ui.governanceCollabRemove || 'Remove'}
            </button>
        </li>
    );
}

function CollaboratorInviteSection({ ui, onInvite }) {
    const [inviteeUsername, setInviteeUsername] = useState('');
    const [role, setRole] = useState('editor');

    return (
        <ContributorHubSection
            title={ui.governanceCollabHeading || 'Invite to edit'}
            variant="invite"
        >
            <div className="governance-collab-invite-grid">
                <div className="governance-collab-invite-grid__field governance-collab-invite-grid__field--username">
                    {fieldLabel(ui.governanceCollabUsernameLabel || 'Username', 'inp-collab-username')}
                    <input
                        id="inp-collab-username"
                        type="text"
                        autoComplete="off"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        className="arborito-input rounded-lg text-sm w-full"
                        placeholder={ui.governanceCollabUsernamePh || ''}
                        value={inviteeUsername}
                        onChange={(e) => setInviteeUsername(e.target.value)}
                    />
                </div>
                <div className="governance-collab-invite-grid__field governance-collab-invite-grid__field--role">
                    {fieldLabel(ui.governanceCollabRoleLabel || 'Role', 'sel-collab-role')}
                    <select
                        id="sel-collab-role"
                        className="arborito-select arborito-select--compact rounded-lg w-full text-sm"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                    >
                        <option value="editor">{ui.governanceRoleEditor || 'Editor'}</option>
                        <option value="proposer">
                            {ui.governanceRoleProposerShort || ui.governanceRoleProposer || 'Suggestions'}
                        </option>
                    </select>
                </div>
                <div className="governance-collab-invite-grid__action">
                    <button
                        type="button"
                        id="btn-governance-invite"
                        className={modalCtaConfirmFull('purple')}
                        onClick={() => {
                            onInvite(inviteeUsername.trim(), role);
                            setInviteeUsername('');
                        }}
                    >
                        {ui.governanceCollabInviteBtn || 'Save'}
                    </button>
                </div>
            </div>
        </ContributorHubSection>
    );
}

function IntroBlock({ text }) {
    if (!text) return null;
    return (
        <Callout tone="info" layout="stack" extraClass="rounded-xl p-3">
            <p className="arborito-callout__body text-xs leading-snug m-0">{text}</p>
        </Callout>
    );
}

function CollaboratorListSection({ ui, collabRows, onRemove }) {
    const [filter, setFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const listScrollRef = useRef(null);

    const sortedRows = useMemo(() => {
        return [...collabRows].sort((a, b) =>
            collabDisplayLabel(a).localeCompare(collabDisplayLabel(b), undefined, { sensitivity: 'base' })
        );
    }, [collabRows]);

    const filteredRows = useMemo(() => {
        const q = filter.trim().toLowerCase();
        return sortedRows.filter((r) => {
            if (roleFilter !== 'all' && r.role !== roleFilter) return false;
            if (!q) return true;
            const roleLabel = roleLabelFor(ui, r.role);
            const hay = `${r.inviteeUsername || ''} ${r.inviteePub} ${r.role} ${roleLabel}`.toLowerCase();
            return hay.includes(q);
        });
    }, [sortedRows, filter, roleFilter, ui]);

    const filterKey = `${filter}|${roleFilter}`;
    useEffect(() => {
        const el = listScrollRef.current;
        if (el) el.scrollTop = 0;
    }, [filterKey]);

    const { items: visibleRows, paddingTop, paddingBottom } = useVirtualScrollSlice(
        filteredRows,
        listScrollRef,
        { rowHeight: COLLAB_ROW_HEIGHT, threshold: COLLAB_LIST_VIRTUAL_THRESHOLD }
    );

    const listHeading = ui.governanceCollabListLabel || 'Collaborators';
    const searchPlaceholder = ui.governanceCollabSearchPlaceholder || '';
    const listTitle =
        collabRows.length > 0
            ? `${listHeading} · ${collabRows.length}`
            : listHeading;

    const countLabel =
        filteredRows.length !== collabRows.length
            ? String(ui.governanceCollabFilteredCount || 'Showing {shown} of {total}')
                  .replace(/\{shown\}/g, String(filteredRows.length))
                  .replace(/\{total\}/g, String(collabRows.length))
            : null;

    const roleFilters = [
        ['all', ui.governanceCollabRoleFilterAll || 'All'],
        ['editor', ui.governanceCollabRoleFilterEditor || ui.governanceRoleEditor || 'Editors'],
        [
            'proposer',
            ui.governanceCollabRoleFilterProposer ||
                ui.governanceRoleProposerShort ||
                ui.governanceRoleProposer ||
                'Suggestions',
        ],
    ];

    return (
        <ContributorHubSection title={listTitle} variant="list">
            {collabRows.length === 0 ? (
                <p className="arborito-empty m-0 py-3">{ui.governanceCollabEmpty || 'No invitations yet.'}</p>
            ) : (
                <>
                    <div className="governance-collab-list-toolbar">
                        <input
                            type="search"
                            id="inp-collab-filter"
                            autoComplete="off"
                            className="arborito-input arborito-input--compact rounded-lg text-sm w-full"
                            placeholder={searchPlaceholder}
                            aria-label={searchPlaceholder || listHeading}
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                        />
                        <div className="governance-collab-list-toolbar__filters" role="group">
                            {roleFilters.map(([id, label]) => (
                                <SourcesFilterChip
                                    key={id}
                                    label={label}
                                    active={roleFilter === id}
                                    onClick={() => setRoleFilter(id)}
                                />
                            ))}
                        </div>
                        {countLabel ? (
                            <p className="contributor-hub-section__subtitle m-0">{countLabel}</p>
                        ) : null}
                    </div>
                    {filteredRows.length === 0 ? (
                        <p className="arborito-empty m-0 py-3">
                            {ui.governanceCollabNoMatches || 'No matches.'}
                        </p>
                    ) : (
                        <ul
                            ref={listScrollRef}
                            className="governance-collab-list custom-scrollbar m-0 p-0 list-none"
                            aria-label={listHeading}
                        >
                            {paddingTop > 0 ? (
                                <li
                                    className="governance-collab-list__spacer"
                                    style={{ height: paddingTop }}
                                    aria-hidden="true"
                                />
                            ) : null}
                            {visibleRows.map((r) => (
                                <CollaboratorRow key={r.inviteePub} ui={ui} row={r} onRemove={onRemove} />
                            ))}
                            {paddingBottom > 0 ? (
                                <li
                                    className="governance-collab-list__spacer"
                                    style={{ height: paddingBottom }}
                                    aria-hidden="true"
                                />
                            ) : null}
                        </ul>
                    )}
                </>
            )}
        </ContributorHubSection>
    );
}

function CollaboratorOwnerPanels({ ui, collabRows, onInvite, onRemove }) {
    return (
        <div className="contributor-hub-panels">
            <CollaboratorInviteSection ui={ui} onInvite={onInvite} />
            <CollaboratorListSection ui={ui} collabRows={collabRows} onRemove={onRemove} />
        </div>
    );
}

function ShareCodeBlock({ ui, treeShareCode, onCopy }) {
    const shareUi = {
        ...ui,
        sourcesShareCodeLabel: ui.sourcesShareCodeLabel || 'Code',
        sourcesShareCodeAction: ui.sourcesShareCodeAction || ui.governanceCopyShareCodeBtn || 'Copy',
        sourcesShareCodeTap: ui.sourcesShareCodeTap || ui.governanceCopyShareCodeBtn || 'Copy',
    };

    return (
        <ContributorHubSection title={ui.governanceOwnerInviteCodeHeading || 'Branch code'} variant="share">
            {treeShareCode ? (
                <SourcesShareCodeField
                    ui={shareUi}
                    shareCode={treeShareCode}
                    published
                    tone="emerald"
                    className="m-0 w-full"
                    onShare={({ shareCode }) => onCopy(shareCode)}
                />
            ) : (
                <p className="contributor-hub-section__subtitle m-0">
                    {ui.governanceOwnerInviteCodeMissing ||
                        'No short code in metadata (older tree or not republished).'}
                </p>
            )}
        </ContributorHubSection>
    );
}

function CourseLinkBlock({ ui, courseUrlRaw, openCoursePageHref, courseLinkFoot, onCopy }) {
    return (
        <ContributorHubSection title={ui.governanceNostrTree || 'Branch link'} variant="link">
            {ui.governanceCourseLinkBlurb ? (
                <p className="contributor-hub-section__subtitle m-0">{ui.governanceCourseLinkBlurb}</p>
            ) : null}
            <p className="m-0 font-mono text-[10px] break-all text-slate-500 dark:text-slate-400">{courseUrlRaw}</p>
            {openCoursePageHref ? (
                <div className="arborito-action-row arborito-action-row--stack-mobile">
                    <button
                        type="button"
                        id="btn-governance-copy-open-link"
                        className={modalCtaConfirmFull('slate')}
                        onClick={() => onCopy(openCoursePageHref)}
                    >
                        {ui.governanceCopyOpenLinkBtn || 'Copy link'}
                    </button>
                </div>
            ) : null}
            {courseLinkFoot ? (
                <p className="contributor-hub-section__footnote m-0">{courseLinkFoot}</p>
            ) : null}
        </ContributorHubSection>
    );
}

function YourUsernameBlock({ ui, accountUsername, onCopy }) {
    return (
        <ContributorHubSection
            title={ui.governanceYourUsernameHeading || 'Your username'}
            subtitle={ui.governanceYourUsernameHint || undefined}
            variant="profile"
        >
            <input
                type="text"
                readOnly
                className="arborito-input rounded-lg text-sm w-full"
                value={accountUsername}
                aria-label={ui.governanceYourUsernameHeading || 'Your username'}
                onFocus={(e) => e.currentTarget.select()}
            />
            <div className="arborito-action-row arborito-action-row--stack-mobile">
                <button
                    type="button"
                    id="btn-copy-my-username"
                    className={modalCtaConfirmFull('slate')}
                    onClick={() => onCopy(accountUsername)}
                >
                    {ui.governanceCopyUsernameBtn || 'Copy username'}
                </button>
            </div>
        </ContributorHubSection>
    );
}

function RoleCallout({ ui, myRole }) {
    if (myRole === 'editor') return null;
    return (
        <Callout
            tone="info"
            layout="stack"
            extraClass="rounded-xl p-3 border border-violet-200 dark:border-violet-800"
        >
            <p className="arborito-callout__body text-xs m-0">
                {ui.governanceYourRoleProposer ||
                    'You have suggest-only access. Ask the owner for Editor to change lessons.'}
            </p>
        </Callout>
    );
}

/** Scrollable body for the team / governance hub. */
export function ContributorPanelBody({
    ui,
    notify,
    activeSource,
    rawGraphData,
    userStore,
    treeCollaboratorRoles,
    treeCollaboratorUsernames,
    accountUsername,
    getNostrPublisherPair,
    getMyTreeNetworkRole,
    inviteNostrCollaborator,
    removeNostrCollaborator,
}) {
    const treeRef = parseNostrTreeUrl((activeSource && activeSource.url) || '');
    const isLocal = fileSystem.isLocal;
    const activeUrl = (activeSource && activeSource.url) || '';
    const localId =
        isLocal && String(activeUrl).startsWith('branch://')
            ? String(activeUrl).slice('branch://'.length)
            : '';
    const localEntry = localId ? userStore.state.branches.find((t) => t.id === localId) : null;
    const localPublishedNetworkUrl =
        localEntry && typeof localEntry.publishedNetworkUrl === 'string'
            ? localEntry.publishedNetworkUrl.trim()
            : '';

    const isOwner = !!(treeRef && getNostrPublisherPair(treeRef.pub)?.priv);
    const publishedNetworkParsed =
        localPublishedNetworkUrl && parseNostrTreeUrl(localPublishedNetworkUrl)
            ? parseNostrTreeUrl(localPublishedNetworkUrl)
            : null;
    const isPublishedLocalOwner = !!(
        publishedNetworkParsed && getNostrPublisherPair(publishedNetworkParsed.pub)?.priv
    );
    const isTreeOwner = isOwner || isPublishedLocalOwner;

    const hubView = resolveContributorHubViewFromSource({
        activeSource,
        userStore,
        getNostrPublisherPair,
    });

    const treeShareCode = String(
        (activeSource && activeSource.shareCode) || rawGraphData?.meta?.shareCode || ''
    ).trim();

    const myRole = typeof getMyTreeNetworkRole === 'function' ? getMyTreeNetworkRole() : null;
    const collabMap =
        treeCollaboratorRoles && typeof treeCollaboratorRoles === 'object' ? treeCollaboratorRoles : {};
    const collabNames =
        treeCollaboratorUsernames && typeof treeCollaboratorUsernames === 'object'
            ? treeCollaboratorUsernames
            : {};
    const collabRows = Object.keys(collabMap).map((k) => ({
        inviteePub: k,
        inviteeUsername: collabNames[k] || '',
        role: collabMap[k],
    }));

    const courseUrlRaw = treeRef
        ? String((activeSource && activeSource.url) || '').trim()
        : String(localPublishedNetworkUrl || '').trim();
    let openCoursePageHref = '';
    if (typeof window !== 'undefined' && courseUrlRaw) {
        try {
            const u = new URL(window.location.href);
            u.searchParams.set('source', courseUrlRaw);
            openCoursePageHref = u.toString();
        } catch {
            openCoursePageHref = '';
        }
    }

    const introText = resolveContributorIntroText(hubView, ui, { isTreeOwner, myRole });

    const hasNetworkTreeContext = !!(treeRef || localPublishedNetworkUrl);
    const canManageCollaborators = isTreeOwner && hasNetworkTreeContext;

    const ownerHidesTechnicalCourseLink = isTreeOwner && !!treeShareCode;
    const hideCourseLinkForAnonymousReader = hubView === 'networkGuest' && !isTreeOwner && !myRole;
    const showCourseLink =
        (treeRef || localPublishedNetworkUrl) &&
        !ownerHidesTechnicalCourseLink &&
        !hideCourseLinkForAnonymousReader;
    const showYourUsernameBlock =
        hubView === 'networkGuest' && !!accountUsername && !isTreeOwner && myRole !== 'editor';
    const showSignInForInviteHint =
        hubView === 'networkGuest' && !accountUsername && !isTreeOwner && myRole !== 'editor';

    const copyToClipboard = async (text, okMsg, failMsg) => {
        const ok = await copyTextToClipboard(text);
        if (ok) notify(okMsg, false);
        else notify(failMsg, true);
    };

    const courseLinkFoot =
        ui.governanceLinkFootShort ||
        ui.governancePublicLinkNote ||
        ui.governanceNostrForumHint ||
        'Only this browser can take the course offline or clean up the forum (Construction mode).';

    const bodyShell = (children) => (
        <div
            className={`contributor-hub-body ${CONTRIBUTOR_HUB_BODY_SCROLL} flex flex-col gap-5 text-sm leading-relaxed md:px-6`}
        >
            {children}
        </div>
    );

    const compactBodyShell = (children) => (
        <div className="contributor-hub-body px-4 py-4 text-sm leading-relaxed">{children}</div>
    );

    if (hubView === 'localDraft') {
        return compactBodyShell(<ContributorLocalDraftGate ui={ui} />);
    }

    if (hubView === 'noNetworkTree') {
        return compactBodyShell(<ContributorNoTreeEmpty ui={ui} />);
    }

    return bodyShell(
        <>
            <IntroBlock text={introText} />

            {hubView === 'localPublished' && isTreeOwner && ui.governanceLocalPublishedCollabHint ? (
                <Callout tone="amber" size="sm" layout="stack" extraClass="rounded-lg p-2.5">
                    <p className="arborito-callout__body text-xs leading-snug m-0">
                        {ui.governanceLocalPublishedCollabHint}
                    </p>
                </Callout>
            ) : null}

            {isTreeOwner && hasNetworkTreeContext ? (
                <ShareCodeBlock
                    ui={ui}
                    treeShareCode={treeShareCode}
                    onCopy={(code) =>
                        void copyToClipboard(
                            code,
                            ui.governanceCopyShareCodeOk || 'Copied.',
                            ui.governanceCopyShareCodeFail || 'Could not copy.'
                        )
                    }
                />
            ) : null}

            {canManageCollaborators ? (
                <CollaboratorOwnerPanels
                    ui={ui}
                    collabRows={collabRows}
                    onInvite={(username, inviteRole) =>
                        void inviteNostrCollaborator({ inviteeUsername: username, role: inviteRole })
                    }
                    onRemove={(pub) => void removeNostrCollaborator(pub)}
                />
            ) : null}

            {showCourseLink ? (
                <CourseLinkBlock
                    ui={ui}
                    courseUrlRaw={courseUrlRaw}
                    openCoursePageHref={openCoursePageHref}
                    courseLinkFoot={courseLinkFoot}
                    onCopy={(href) =>
                        void copyToClipboard(
                            href,
                            ui.governanceCopyOpenLinkOk || 'Copied.',
                            ui.governanceCopyOpenLinkFail || 'Could not copy.'
                        )
                    }
                />
            ) : null}

            {showSignInForInviteHint ? (
                <Callout tone="info" layout="stack" extraClass="rounded-xl p-3">
                    <p className="arborito-callout__body text-xs leading-snug m-0">
                        {ui.governanceReaderNeedLoginHint ||
                            'Sign in from Profile so the branch admin can invite you by username.'}
                    </p>
                </Callout>
            ) : null}

            {showYourUsernameBlock ? (
                <YourUsernameBlock
                    ui={ui}
                    accountUsername={accountUsername}
                    onCopy={(name) =>
                        void copyToClipboard(
                            name,
                            ui.governanceCopyUsernameOk || 'Copied.',
                            ui.governanceCopyUsernameFail || 'Could not copy.'
                        )
                    }
                />
            ) : null}

            {hubView === 'networkGuest' && myRole && !isOwner ? (
                <RoleCallout ui={ui} myRole={myRole} />
            ) : null}
        </>
    );
}
