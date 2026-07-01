import { useNostr } from '../hooks/useNostr.js';
import { useEffect, useMemo, useState } from 'react';
import { parseNostrTreeUrl } from '../api/nostr-refs.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { ModalHero } from '../../../app/components/ModalHero.jsx';

function abbrevPublicKey(pub) {
    const s = String(pub || '');
    if (s.length <= 22) return s;
    return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

function IntroBlock({ text }) {
    if (!text) return null;
    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-900/50 p-3">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug m-0">{text}</p>
        </div>
    );
}

function CollaboratorOwnerBlock({ ui, collabRows, onInvite, onRemove }) {
    const [inviteePub, setInviteePub] = useState('');
    const [role, setRole] = useState('editor');
    const [filter, setFilter] = useState('');

    const filteredRows = useMemo(() => {
        const q = filter.trim().toLowerCase();
        if (!q) return collabRows;
        return collabRows.filter((r) => {
            const roleLabel =
                r.role === 'proposer'
                    ? ui.governanceRoleProposer || 'Proposer'
                    : ui.governanceRoleEditor || 'Editor';
            const hay = `${r.inviteePub} ${r.role} ${roleLabel}`.toLowerCase();
            return hay.includes(q);
        });
    }, [collabRows, filter, ui]);

    return (
        <div className="rounded-xl border border-violet-200 dark:border-violet-800 p-3 space-y-3 bg-violet-50/50 dark:bg-violet-950/20">
            <p className="font-bold text-xs uppercase text-violet-800 dark:text-violet-200">
                {ui.governanceCollabHeading || 'Collaborators'}
            </p>
            <div className="flex flex-col gap-2">
                <label className="arborito-eyebrow" htmlFor="inp-collab-pub">
                    {ui.governanceCollabPubLabel || 'Public key'}
                </label>
                <textarea
                    id="inp-collab-pub"
                    rows={2}
                    className="arborito-input arborito-textarea arborito-input--mono rounded-lg text-xs"
                    placeholder={ui.governanceCollabPubPh || ''}
                    value={inviteePub}
                    onChange={(e) => setInviteePub(e.target.value)}
                />
                <label className="arborito-eyebrow" htmlFor="sel-collab-role">
                    {ui.governanceCollabRoleLabel || 'Role'}
                </label>
                <select
                    id="sel-collab-role"
                    className="arborito-select arborito-select--compact rounded-lg"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                >
                    <option value="editor">{ui.governanceRoleEditor || 'Editor'}</option>
                    <option value="proposer">{ui.governanceRoleProposer || 'Proposer'}</option>
                </select>
                <button
                    type="button"
                    id="btn-governance-invite"
                    className="w-full py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-black"
                    onClick={() => onInvite(inviteePub.trim(), role)}
                >
                    {ui.governanceCollabInviteBtn || 'Save invitation'}
                </button>
            </div>
            {collabRows.length === 0 ? (
                <p className="text-xs text-slate-500">{ui.governanceCollabEmpty || 'No invited collaborators yet.'}</p>
            ) : (
                <div className="space-y-2">
                    <input
                        type="search"
                        id="inp-collab-filter"
                        autoComplete="off"
                        className="arborito-input arborito-input--compact rounded-lg text-xs"
                        placeholder={ui.governanceCollabSearchPlaceholder || ''}
                        aria-label={ui.governanceCollabSearchPlaceholder || ''}
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                    <ul className="space-y-2">
                        {filteredRows.map((r) => {
                            const roleLabel =
                                r.role === 'proposer'
                                    ? ui.governanceRoleProposer || 'Proposer'
                                    : ui.governanceRoleEditor || 'Editor';
                            return (
                                <li
                                    key={r.inviteePub}
                                    className="collab-row flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5"
                                >
                                    <div className="min-w-0">
                                        <p
                                            className="font-mono text-[10px] text-slate-600 dark:text-slate-300 truncate"
                                            title={r.inviteePub}
                                        >
                                            {abbrevPublicKey(r.inviteePub)}
                                        </p>
                                        <p className="arborito-eyebrow">{roleLabel}</p>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-collab-remove shrink-0 text-xs font-bold text-rose-600 dark:text-rose-400 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-800"
                                        onClick={() => onRemove(r.inviteePub)}
                                    >
                                        {ui.governanceCollabRemove || 'Remove'}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}

export function AdminPanel({ embed }) {
    const nostr = useNostr();
    const {
        ui,
        dismissModal,
        notify,
        activeSource,
        rawGraphData,
        userStore,
        treeCollaboratorRoles,
        getNostrPublisherPair,
        getMyTreeNetworkRole,
        getNetworkUserPair,
        publishTreePublicInteractive,
        inviteNostrCollaborator,
        removeNostrCollaborator,
    } = nostr;
    const mobile = shouldShowMobileUI();

    useEffect(() => {
        document.documentElement.classList.add('arborito-contributor-modal-open');
        return () => document.documentElement.classList.remove('arborito-contributor-modal-open');
    }, []);

    const close = () => dismissModal();

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
    const showLocalUnpublishedHint = isLocal && !localPublishedNetworkUrl;

    const title = ui.adminGovModalHeading || ui.adminGovTitle || ui.adminConsole || 'Governance';

    const isOwner = !!(treeRef && getNostrPublisherPair(treeRef.pub) && getNostrPublisherPair(treeRef.pub).priv);
    const publishedNetworkParsed =
        localPublishedNetworkUrl && parseNostrTreeUrl(localPublishedNetworkUrl)
            ? parseNostrTreeUrl(localPublishedNetworkUrl)
            : null;
    const isPublishedLocalOwner = !!(
        publishedNetworkParsed &&
        getNostrPublisherPair(publishedNetworkParsed.pub) &&
        getNostrPublisherPair(publishedNetworkParsed.pub).priv
    );
    const isTreeOwner = isOwner || isPublishedLocalOwner;
    const activeSrc = activeSource;
    const treeShareCode = String(
        (activeSrc && activeSrc.shareCode) || rawGraphData?.meta?.shareCode || ''
    ).trim();

    const myRole = typeof getMyTreeNetworkRole === 'function' ? getMyTreeNetworkRole() : null;
    const myUserPub =
        typeof getNetworkUserPair === 'function'
            ? (getNetworkUserPair() ? getNetworkUserPair().pub : undefined) || ''
            : '';
    const collabMap =
        treeCollaboratorRoles && typeof treeCollaboratorRoles === 'object' ? treeCollaboratorRoles : {};
    const collabRows = Object.keys(collabMap).map((k) => ({
        inviteePub: k,
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

    let introText = '';
    if (treeRef || localPublishedNetworkUrl) {
        if (treeRef && !isTreeOwner && !myRole && ui.governanceReaderNoRoleIntro) {
            introText = ui.governanceReaderNoRoleIntro;
        } else if (isTreeOwner && (ui.governanceModalIntroOwner || ui.governanceModalIntro)) {
            introText = ui.governanceModalIntroOwner || ui.governanceModalIntro;
        } else if (ui.governanceModalIntro) {
            introText = ui.governanceModalIntro;
        }
    }

    const ownerHidesTechnicalCourseLink = isTreeOwner && !!treeShareCode;
    const hideCourseLinkForAnonymousReader = !!(treeRef && !isTreeOwner && !myRole);
    const showCourseLink =
        (treeRef || localPublishedNetworkUrl) && !ownerHidesTechnicalCourseLink && !hideCourseLinkForAnonymousReader;

    const showYourPubBlock = !!(treeRef && myUserPub) && !isTreeOwner && myRole !== 'editor';
    const canPublish = !!(publishTreePublicInteractive && fileSystem.features.canWrite);

    const copyToClipboard = async (text, okMsg, failMsg) => {
        try {
            await navigator.clipboard.writeText(text);
            notify(okMsg, false);
        } catch {
            notify(failMsg, true);
        }
    };

    const localUnpublishedCallout = showLocalUnpublishedHint ? (
        <Callout
            tone="emerald"
            layout="stack"
            extraClass="rounded-xl p-3"
            title={ui.governanceLocalNoActionsTitle || 'Local tree (not public yet)'}
        >
            <p className="arborito-callout__body text-xs leading-snug m-0">
                {ui.governanceLocalNoActionsBody ||
                    'Governance only works for public (nostr://) trees: collaborators, moderation and retraction live on the shared network. Your local tree stays on this device.'}
            </p>
            {ui.governanceLocalNoActionsHelp ? (
                <p className="text-[11px] leading-snug m-0 mt-2 opacity-80">{ui.governanceLocalNoActionsHelp}</p>
            ) : null}
            {ui.governanceLocalNoActionsPublishedBenefits ? (
                <p className="text-[11px] leading-snug m-0 mt-1 opacity-80">
                    {ui.governanceLocalNoActionsPublishedBenefits}
                </p>
            ) : null}
            {canPublish ? (
                <button
                    type="button"
                    id="btn-governance-make-public"
                    className="arborito-cta-emerald mt-3 w-full py-2 rounded-xl text-sm font-black"
                >
                    {ui.governanceLocalMakePublicCta || ui.publicTreeDockLabel || 'Make public'}
                </button>
            ) : null}
        </Callout>
    ) : null;

    const ownerInviteCallout =
        isTreeOwner && (treeRef || localPublishedNetworkUrl) ? (
            <Callout tone="emerald" layout="stack" extraClass="rounded-xl p-3 space-y-2">
                <p className="font-bold text-xs uppercase m-0">
                    {ui.governanceOwnerInviteCodeHeading || 'Course code'}
                </p>
                <p className="text-xs leading-snug m-0">{ui.governanceOwnerInviteCodeBlurb || ''}</p>
                {treeShareCode ? (
                    <p className="font-mono text-base font-black tracking-widest text-center text-emerald-800 dark:text-emerald-200 governance-share-code py-2 px-3 rounded-lg border border-emerald-200 dark:border-emerald-800">
                        {treeShareCode}
                    </p>
                ) : null}
                {treeShareCode ? (
                    <button
                        type="button"
                        id="btn-governance-copy-share-code"
                        className="w-full py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 text-sm font-bold text-emerald-900 dark:text-emerald-100"
                    >
                        {ui.governanceCopyShareCodeBtn || 'Copy course code'}
                    </button>
                ) : null}
                {!treeShareCode ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400 m-0 leading-snug">
                        {ui.governanceOwnerInviteCodeMissing ||
                            'This course has no short code in metadata (older tree or not republished).'}
                    </p>
                ) : null}
            </Callout>
        ) : null;

    const courseLinkFoot =
        ui.governanceLinkFootShort ||
        ui.governancePublicLinkNote ||
        ui.governanceNostrForumHint ||
        'Only this browser can take the course offline or clean up the forum (Construction mode).';

    const handleBodyClick = (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.closest('#btn-governance-copy-share-code') && treeShareCode) {
            void copyToClipboard(
                treeShareCode,
                ui.governanceCopyShareCodeOk || 'Copied.',
                ui.governanceCopyShareCodeFail || 'Could not copy.'
            );
        }
        if (t.closest('#btn-governance-copy-open-link') && openCoursePageHref) {
            void copyToClipboard(
                openCoursePageHref,
                ui.governanceCopyOpenLinkOk || 'Copied.',
                ui.governanceCopyOpenLinkFail || 'Could not copy.'
            );
        }
        if (t.closest('#btn-copy-my-nostr-pub') && myUserPub) {
            void copyToClipboard(
                myUserPub,
                ui.governanceCopyPubOk || 'Copied.',
                ui.governanceCopyPubFail || 'Could not copy.'
            );
        }
        if (t.closest('#btn-governance-make-public')) {
            void (async () => {
                try {
                    await publishTreePublicInteractive();
                } finally {
                    dismissModal();
                }
            })();
        }
    };

    return (
        <div
            className="w-full h-full flex flex-col bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
            data-arborito-panel="admin-panel"
            data-embed={embed ? '1' : undefined}
        >
            <ModalHero
                ui={ui}
                mobile={mobile}
                title={title}
                backTagClass="btn-admin-dismiss"
                closeTagClass="btn-admin-dismiss-x"
                extraWrapClassDesktop="border-b border-slate-100 dark:border-slate-800"
                onBack={close}
                onClose={close}
            />
            <div
                className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 text-sm leading-relaxed"
                onClick={handleBodyClick}
            >
                {localUnpublishedCallout}
                <IntroBlock text={introText} />
                {isLocal && localPublishedNetworkUrl ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 m-0">
                        {ui.governanceLocalPublishedNote ||
                            'You are still editing the private copy in this browser; the public tree link is below.'}
                    </p>
                ) : null}
                {ownerInviteCallout}
                {showCourseLink ? (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                        <p className="font-bold text-xs uppercase text-slate-500">
                            {ui.governanceNostrTree || 'Course link'}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug m-0">
                            {ui.governanceCourseLinkBlurb || ''}
                        </p>
                        <p className="font-mono text-[11px] break-all text-slate-600 dark:text-slate-300">
                            {courseUrlRaw}
                        </p>
                        {openCoursePageHref ? (
                            <button
                                type="button"
                                id="btn-governance-copy-open-link"
                                className="w-full py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-bold"
                            >
                                {ui.governanceCopyOpenLinkBtn || 'Copy link'}
                            </button>
                        ) : null}
                        <p className="text-xs text-slate-500 dark:text-slate-400 m-0">{courseLinkFoot}</p>
                    </div>
                ) : null}
                {showYourPubBlock ? (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                        <p className="font-bold text-xs uppercase text-slate-500">
                            {ui.governanceYourPubHeading || 'Your public key'}
                        </p>
                        {ui.governanceYourPubHint ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400 m-0 leading-snug">
                                {ui.governanceYourPubHint}
                            </p>
                        ) : null}
                        <p className="font-mono text-[10px] break-all text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-900 p-2 rounded-lg">
                            {myUserPub}
                        </p>
                        <button
                            type="button"
                            id="btn-copy-my-nostr-pub"
                            className="w-full py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-bold"
                        >
                            {ui.governanceCopyPubBtn || 'Copy'}
                        </button>
                    </div>
                ) : null}
                {treeRef && myRole && !isOwner ? (
                    <p className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/80 dark:bg-violet-950/30 p-3 text-xs text-violet-900 dark:text-violet-100">
                        {myRole === 'editor'
                            ? ui.governanceYourRoleEditor || 'You are an invited editor for this tree.'
                            : ui.governanceYourRoleProposer ||
                              'You are an invited proposer. Approval workflow is not wired yet — ask the owner to grant Editor if you need to edit.'}
                    </p>
                ) : null}
                {treeRef && isOwner ? (
                    <CollaboratorOwnerBlock
                        ui={ui}
                        collabRows={collabRows}
                        onInvite={(pub, inviteRole) => void inviteNostrCollaborator({ inviteePub: pub, role: inviteRole })}
                        onRemove={(pub) => void removeNostrCollaborator(pub)}
                    />
                ) : null}
                {!treeRef && !localPublishedNetworkUrl ? (
                    <p className="text-slate-500 dark:text-slate-400">
                        {ui.governanceNoPublicTree || 'Open a public tree to see publisher tools.'}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
