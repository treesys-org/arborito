import { store } from '../../../core/store.js';
import { bindMobileTap } from '../../../shared/ui/mobile-tap.js';
import { parseNostrTreeUrl } from '../nostr-refs.js';
import { fileSystem } from '../../backup-export/filesystem.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { escHtml as escText, escAttr } from '../../../shared/lib/html-escape.js';

function abbrevPublicKey(pub) {
    const s = String(pub || '');
    if (s.length <= 22) return s;
    return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

/**
 * Governance info for the active tree (Nostr or local).
 */
class ArboritoAdminPanel extends HTMLElement {
    constructor() {
        super();
        this.state = { adminTab: 'info' };
    }

    connectedCallback() {
        if (typeof document !== 'undefined') {
            document.documentElement.classList.add('arborito-contributor-modal-open');
        }
        this._storeListener = () => this.checkState();
        store.addEventListener('state-change', this._storeListener);
        this.checkState();
    }

    disconnectedCallback() {
        if (typeof document !== 'undefined') {
            document.documentElement.classList.remove('arborito-contributor-modal-open');
        }
        if (this._storeListener) {
            store.removeEventListener('state-change', this._storeListener);
        }
    }

    checkState() {
        const modal = store.value.modal;
        if (modal && modal.type === 'contributor') {
            if (modal.tab && this.state.adminTab !== modal.tab) {
                this.state.adminTab = modal.tab;
            }
            this.render();
        } else {
            if (typeof document !== 'undefined') {
                document.documentElement.classList.remove('arborito-contributor-modal-open');
            }
            this.innerHTML = '';
        }
    }

    render() {
        const ui = store.ui;
        const treeRef = parseNostrTreeUrl((store.value.activeSource && store.value.activeSource.url) || '');
        const isLocal = fileSystem.isLocal;
        const activeUrl = (store.value.activeSource && store.value.activeSource.url) || '';
        const localId =
            isLocal && String(activeUrl).startsWith('local://')
                ? String(activeUrl).slice('local://'.length)
                : '';
        const localEntry = localId
            ? store.userStore.state.localTrees.find((t) => t.id === localId)
            : null;
        const localPublishedNetworkUrl =
            localEntry && typeof localEntry.publishedNetworkUrl === 'string'
                ? localEntry.publishedNetworkUrl.trim()
                : '';
        const showLocalUnpublishedHint = isLocal && !localPublishedNetworkUrl;
        const mobile = shouldShowMobileUI();
        /* Short heading: `conGovTooltip` is tuned for tooltips and reads poorly when reused as the modal title. */
        const title = ui.adminGovModalHeading || ui.adminGovTitle || ui.adminConsole || 'Governance';

        const isOwner = !!(treeRef && store.getNostrPublisherPair(treeRef.pub) && store.getNostrPublisherPair(treeRef.pub).priv);
        const publishedNetworkParsed =
            localPublishedNetworkUrl && parseNostrTreeUrl(localPublishedNetworkUrl)
                ? parseNostrTreeUrl(localPublishedNetworkUrl)
                : null;
        const isPublishedLocalOwner = !!(
            publishedNetworkParsed &&
            store.getNostrPublisherPair(publishedNetworkParsed.pub) &&
            store.getNostrPublisherPair(publishedNetworkParsed.pub).priv
        );
        const isTreeOwner = isOwner || isPublishedLocalOwner;
        const activeSrc = store.value.activeSource;
        const treeShareCode = String(
            (activeSrc && activeSrc.shareCode) || store.state.rawGraphData?.meta?.shareCode || ''
        ).trim();

        const myRole = typeof store.getMyTreeNetworkRole === 'function' ? store.getMyTreeNetworkRole() : null;
        const myUserPub =
            typeof store.getNetworkUserPair === 'function' ? (store.getNetworkUserPair() ? store.getNetworkUserPair().pub : undefined) || '' : '';
        const collabMap = store.state.treeCollaboratorRoles && typeof store.state.treeCollaboratorRoles === 'object'
            ? store.state.treeCollaboratorRoles
            : {};
        const collabRows = Object.keys(collabMap).map((k) => ({
            inviteePub: k,
            role: collabMap[k]
        }));

        const courseUrlRaw = treeRef
            ? String((store.value.activeSource && store.value.activeSource.url) || '').trim()
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

        const wrapIntro = (text) =>
            `<div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-900/50 p-3">
                <p class="text-xs text-slate-600 dark:text-slate-300 leading-snug m-0">${escText(text)}</p>
            </div>`;

        let introBlock = '';
        if (treeRef || localPublishedNetworkUrl) {
            if (treeRef && !isTreeOwner && !myRole && ui.governanceReaderNoRoleIntro) {
                introBlock = wrapIntro(ui.governanceReaderNoRoleIntro);
            } else if (isTreeOwner && (ui.governanceModalIntroOwner || ui.governanceModalIntro)) {
                introBlock = wrapIntro(ui.governanceModalIntroOwner || ui.governanceModalIntro);
            } else if (ui.governanceModalIntro) {
                introBlock = wrapIntro(ui.governanceModalIntro);
            }
        }

        let ownerInviteSection = '';
        if (isTreeOwner && (treeRef || localPublishedNetworkUrl)) {
            const copyShareBtn = treeShareCode
                ? `<button type="button" id="btn-governance-copy-share-code" data-copy-text="${escAttr(
                      treeShareCode
                  )}" class="w-full py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 text-sm font-bold text-emerald-900 dark:text-emerald-100 bg-emerald-50 dark:bg-emerald-950/40">${escText(
                      ui.governanceCopyShareCodeBtn || 'Copy course code'
                  )}</button>`
                : '';
            const codeDisplay = treeShareCode
                ? `<p class="font-mono text-base font-black tracking-widest text-center text-emerald-800 dark:text-emerald-200 bg-emerald-50/90 dark:bg-emerald-950/50 py-2 px-3 rounded-lg border border-emerald-200 dark:border-emerald-800">${escText(
                      treeShareCode
                  )}</p>`
                : '';
            const missing = !treeShareCode
                ? `<p class="text-xs text-slate-600 dark:text-slate-400 m-0 leading-snug">${escText(
                      ui.governanceOwnerInviteCodeMissing ||
                          'This course has no short code in metadata (older tree or not republished).'
                  )}</p>`
                : '';
            ownerInviteSection = `
                <div class="rounded-xl border border-emerald-200 dark:border-emerald-800 p-3 space-y-2 bg-emerald-50/50 dark:bg-emerald-950/25">
                    <p class="font-bold text-xs uppercase text-emerald-900 dark:text-emerald-200">${escText(
                        ui.governanceOwnerInviteCodeHeading || 'Course code'
                    )}</p>
                    <p class="text-xs text-slate-700 dark:text-slate-300 leading-snug m-0">${escText(ui.governanceOwnerInviteCodeBlurb || '')}</p>
                    ${codeDisplay}
                    ${copyShareBtn}
                    ${missing}
                </div>`;
        }

        const ownerHidesTechnicalCourseLink = isTreeOwner && !!treeShareCode;
        const hideCourseLinkForAnonymousReader = !!(treeRef && !isTreeOwner && !myRole);
        let courseLinkBlock = '';
        if ((treeRef || localPublishedNetworkUrl) && !ownerHidesTechnicalCourseLink && !hideCourseLinkForAnonymousReader) {
            const foot = escText(
                ui.governanceLinkFootShort ||
                    ui.governancePublicLinkNote ||
                    ui.governanceNostrForumHint ||
                    'Only this browser can take the course offline or clean up the forum (Construction mode).'
            );
            const openLinkBtnHtml =
                openCoursePageHref &&
                `<button type="button" id="btn-governance-copy-open-link" data-copy-href="${escAttr(openCoursePageHref)}" class="w-full py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-bold">${escText(
                    ui.governanceCopyOpenLinkBtn || 'Copy link'
                )}</button>`;
            courseLinkBlock = `
                <div class="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                    <p class="font-bold text-xs uppercase text-slate-500">${escText(ui.governanceNostrTree || 'Course link')}</p>
                    <p class="text-xs text-slate-600 dark:text-slate-300 leading-snug m-0">${escText(ui.governanceCourseLinkBlurb || '')}</p>
                    <p class="font-mono text-[11px] break-all text-slate-600 dark:text-slate-300">${escText(courseUrlRaw)}</p>
                    ${openLinkBtnHtml || ''}
                    <p class="text-xs text-slate-500 dark:text-slate-400 m-0">${foot}</p>
                </div>`;
        }

        const header = modalHeroHtml(ui, {
            mobile,
            title: escText(title),
            backTagClass: 'btn-admin-dismiss',
            closeTagClass: 'btn-admin-dismiss-x',
            extraWrapClassDesktop: 'border-b border-slate-100 dark:border-slate-800',
        });

        let collabOwnerBlock = '';
        if (treeRef && isOwner) {
            const rows =
                collabRows.length === 0
                    ? `<p class="text-xs text-slate-500">${escText(ui.governanceCollabEmpty || 'No invited collaborators yet.')}</p>`
                    : `<div class="space-y-2">
                        <input type="search" id="inp-collab-filter" autocomplete="off" class="arborito-input arborito-input--compact rounded-lg text-xs" placeholder="${escAttr(
                            ui.governanceCollabSearchPlaceholder || ''
                        )}" aria-label="${escAttr(ui.governanceCollabSearchPlaceholder || '')}" />
                        <ul class="space-y-2">${collabRows
                          .map((r) => {
                              const roleLabel =
                                  r.role === 'proposer'
                                      ? ui.governanceRoleProposer || 'Proposer'
                                      : ui.governanceRoleEditor || 'Editor';
                              const searchHay = `${r.inviteePub} ${r.role} ${roleLabel}`.toLowerCase();
                              return `
                        <li class="collab-row flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5" data-collab-search="${escAttr(searchHay)}">
                            <div class="min-w-0">
                                <p class="font-mono text-[10px] text-slate-600 dark:text-slate-300 truncate" title="${escAttr(r.inviteePub)}">${escText(abbrevPublicKey(r.inviteePub))}</p>
                                <p class="arborito-eyebrow">${escText(roleLabel)}</p>
                            </div>
                            <button type="button" class="btn-collab-remove shrink-0 text-xs font-bold text-rose-600 dark:text-rose-400 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-800" data-pub="${escAttr(r.inviteePub)}">${escText(ui.governanceCollabRemove || 'Remove')}</button>
                        </li>`;
                          })
                          .join('')}</ul></div>`;

            collabOwnerBlock = `
                <div class="rounded-xl border border-violet-200 dark:border-violet-800 p-3 space-y-3 bg-violet-50/50 dark:bg-violet-950/20">
                    <p class="font-bold text-xs uppercase text-violet-800 dark:text-violet-200">${escText(ui.governanceCollabHeading || 'Collaborators')}</p>
                    <div class="flex flex-col gap-2">
                        <label class="arborito-eyebrow" for="inp-collab-pub">${escText(ui.governanceCollabPubLabel || 'Public key')}</label>
                        <textarea id="inp-collab-pub" rows="2" class="arborito-input arborito-textarea arborito-input--mono rounded-lg text-xs" placeholder="${escAttr(ui.governanceCollabPubPh || '')}"></textarea>
                        <label class="arborito-eyebrow" for="sel-collab-role">${escText(ui.governanceCollabRoleLabel || 'Role')}</label>
                        <select id="sel-collab-role" class="arborito-select arborito-select--compact rounded-lg">
                            <option value="editor">${escText(ui.governanceRoleEditor || 'Editor')}</option>
                            <option value="proposer">${escText(ui.governanceRoleProposer || 'Proposer')}</option>
                        </select>
                        <button type="button" id="btn-governance-invite" class="w-full py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-black">${escText(ui.governanceCollabInviteBtn || 'Save invitation')}</button>
                    </div>
                    ${rows}
                </div>`;
        }

        let collabSelfBlock = '';
        if (treeRef && myRole && !isOwner) {
            const label =
                myRole === 'editor'
                    ? ui.governanceYourRoleEditor || 'You are an invited editor for this tree.'
                    : ui.governanceYourRoleProposer || 'You are an invited proposer. Approval workflow is not wired yet — ask the owner to grant Editor if you need to edit.';
            collabSelfBlock = `<p class="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/80 dark:bg-violet-950/30 p-3 text-xs text-violet-900 dark:text-violet-100">${escText(label)}</p>`;
        }

        let copyPubBlock = '';
        const showYourPubBlock =
            !!(treeRef && myUserPub) && !isTreeOwner && myRole !== 'editor';
        if (showYourPubBlock) {
            const pubHint = ui.governanceYourPubHint
                ? `<p class="text-xs text-slate-500 dark:text-slate-400 m-0 leading-snug">${escText(ui.governanceYourPubHint)}</p>`
                : '';
            copyPubBlock = `
                <div class="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                    <p class="font-bold text-xs uppercase text-slate-500">${escText(ui.governanceYourPubHeading || 'Your public key')}</p>
                    ${pubHint}
                    <p class="font-mono text-[10px] break-all text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-900 p-2 rounded-lg">${escText(myUserPub)}</p>
                    <button type="button" id="btn-copy-my-nostr-pub" class="w-full py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-bold">${escText(ui.governanceCopyPubBtn || 'Copy')}</button>
                </div>`;
        }

        const localUnpublishedBlock = (() => {
            if (!showLocalUnpublishedHint) return '';
            const titleL = ui.governanceLocalNoActionsTitle || 'Local tree (not public yet)';
            const bodyL =
                ui.governanceLocalNoActionsBody ||
                'Governance only works for public (nostr://) trees: collaborators, moderation and retraction live on the shared network. Your local tree stays on this device.';
            const helpL = ui.governanceLocalNoActionsHelp || '';
            const benefitsL = ui.governanceLocalNoActionsPublishedBenefits || '';
            const ctaL = ui.governanceLocalMakePublicCta || ui.publicTreeDockLabel || 'Make public';
            const canPublish = !!(store.publishTreePublicInteractive && fileSystem.features.canWrite);
            const btn = canPublish
                ? `<button type="button" id="btn-governance-make-public" class="arborito-cta-emerald mt-3 w-full py-2 rounded-xl text-sm font-black">${escText(
                      ctaL
                  )}</button>`
                : '';
            const helpRow = helpL
                ? `<p class="text-[11px] leading-snug m-0 mt-2 opacity-80">${escText(helpL)}</p>`
                : '';
            const benefitsRow = benefitsL
                ? `<p class="text-[11px] leading-snug m-0 mt-1 opacity-80">${escText(benefitsL)}</p>`
                : '';
            return `<div class="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 p-3 text-emerald-900 dark:text-emerald-100">
                <p class="arborito-eyebrow arborito-eyebrow--md m-0 mb-1">${escText(titleL)}</p>
                <p class="text-xs leading-snug m-0">${escText(bodyL)}</p>
                ${helpRow}
                ${benefitsRow}
                ${btn}
            </div>`;
        })();

        const noOnlineCourseBlock =
            !treeRef && !localPublishedNetworkUrl
                ? `<p class="text-slate-500 dark:text-slate-400">${escText(ui.governanceNoPublicTree || 'Open a public tree to see publisher tools.')}</p>`
                : '';

        this.className = 'w-full h-full flex flex-col bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100';
        this.innerHTML = `
            ${header}
            <div class="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 text-sm leading-relaxed">
                ${localUnpublishedBlock}
                ${introBlock}
                ${isLocal && localPublishedNetworkUrl ? `<p class="text-xs text-slate-500 dark:text-slate-400 m-0">${escText(ui.governanceLocalPublishedNote || 'You are still editing the private copy in this browser; the public tree link is below.')}</p>` : ''}
                ${ownerInviteSection}
                ${courseLinkBlock}
                ${copyPubBlock}
                ${collabSelfBlock}
                ${collabOwnerBlock}
                ${noOnlineCourseBlock}
            </div>
        `;
        this.querySelectorAll('.btn-admin-dismiss, .btn-admin-dismiss-x').forEach((b) =>
            bindMobileTap(b, () => store.dismissModal())
        );

        const inviteBtn = this.querySelector('#btn-governance-invite');
        if (inviteBtn) {
            inviteBtn.onclick = () => {
                const ta = this.querySelector('#inp-collab-pub');
                const sel = this.querySelector('#sel-collab-role');
                const pub = ta && 'value' in ta ? String(ta.value || '').trim() : '';
                const role = sel && 'value' in sel ? String(sel.value || 'editor') : 'editor';
                void store.inviteNostrCollaborator({ inviteePub: pub, role });
            };
        }
        this.querySelectorAll('.btn-collab-remove').forEach((b) => {
            b.onclick = () => {
                const p = b.getAttribute('data-pub');
                if (p) void store.removeNostrCollaborator(p);
            };
        });
        const copyBtn = this.querySelector('#btn-copy-my-nostr-pub');
        if (copyBtn && myUserPub) {
            copyBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(myUserPub);
                    store.notify(ui.governanceCopyPubOk || 'Copied.', false);
                } catch {
                    store.notify(ui.governanceCopyPubFail || 'Could not copy.', true);
                }
            };
        }

        const copyOpenLinkBtn = this.querySelector('#btn-governance-copy-open-link');
        if (copyOpenLinkBtn) {
            copyOpenLinkBtn.onclick = async () => {
                const href = copyOpenLinkBtn.getAttribute('data-copy-href') || '';
                if (!href) return;
                try {
                    await navigator.clipboard.writeText(href);
                    store.notify(ui.governanceCopyOpenLinkOk || 'Copied.', false);
                } catch {
                    store.notify(ui.governanceCopyOpenLinkFail || 'Could not copy.', true);
                }
            };
        }

        const copyShareCodeBtn = this.querySelector('#btn-governance-copy-share-code');
        if (copyShareCodeBtn) {
            copyShareCodeBtn.onclick = async () => {
                const code = copyShareCodeBtn.getAttribute('data-copy-text') || '';
                if (!code) return;
                try {
                    await navigator.clipboard.writeText(code);
                    store.notify(ui.governanceCopyShareCodeOk || 'Copied.', false);
                } catch {
                    store.notify(ui.governanceCopyShareCodeFail || 'Could not copy.', true);
                }
            };
        }

        const pubBtn = this.querySelector('#btn-governance-make-public');
        if (pubBtn) {
            pubBtn.onclick = async () => {
                try {
                    await store.publishTreePublicInteractive();
                } finally {
                    // Close governance after publish flow (which shows its own confirmation).
                    store.dismissModal();
                }
            };
        }

        const collabFilter = this.querySelector('#inp-collab-filter');
        if (collabFilter) {
            collabFilter.oninput = () => {
                const q = String(collabFilter.value || '').trim().toLowerCase();
                this.querySelectorAll('.collab-row').forEach((li) => {
                    const hay = String(li.getAttribute('data-collab-search') || '');
                    li.style.display = !q || hay.includes(q) ? '' : 'none';
                });
            };
        }

    }
}

customElements.define('arborito-admin-panel', ArboritoAdminPanel);
