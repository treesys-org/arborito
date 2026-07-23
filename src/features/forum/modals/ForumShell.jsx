import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { DockHubShell } from '../../../app/components/DockHubShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { modalCtaConfirmFull } from '../../../shared/ui/modal-action-chrome.js';
import { timeAgo } from '../api/modals/logic/forum-modal-utils.js';
import { ForumDesktopPlaces, ForumMobileNavHero, ForumMobileNavBody, ForumMobileZoneBar, ForumPlainHero } from './ForumPlaces.jsx';
import { ForumThreads, ForumNewTopicOverlay } from './ForumThreads.jsx';

function ForumModBannerControls({
    ui,
    modPolicyMode,
    modPolicyLoading,
    modPendingList,
    modPanelOpen,
    onSetPolicy,
    onTogglePanel,
    onRefreshPending,
    onApprove,
    onReject,
    modPendingLoading,
}) {
    const mode = modPolicyMode === 'strict' ? 'strict' : 'free';
    const pendingCount = Array.isArray(modPendingList) ? modPendingList.length : 0;
    const pendingBtnLabel =
        pendingCount > 0
            ? (ui.forumModPendingCountBtn || 'Pending ({n})').replace('{n}', String(pendingCount))
            : ui.forumModPendingZeroBtn || 'No pending';
    const pendingBtnCls =
        pendingCount > 0
            ? 'arborito-cta-amber border-transparent hover:opacity-90'
            : 'bg-white text-amber-900 border-amber-300 dark:bg-slate-900/60 dark:text-amber-100 dark:border-amber-800';

    return (
        <Callout
            tone="amber"
            layout="stack"
            size="sm"
            extraClass="forum-mod-banner shrink-0 rounded-none border-x-0"
            title={ui.forumModModeBannerTitle || 'You are moderating this forum as the owner'}
            titleClass="arborito-callout__title text-[11px] m-0"
        >
            <p className="arborito-callout__body text-[11px] leading-snug m-0 mt-0.5">
                {ui.forumModModeBannerHint ||
                    'Use the inline buttons to remove messages, delete topics, or ban users (banning also removes every message they posted).'}
            </p>
            <div className="mt-2 pt-2 border-t border-amber-200/70 dark:border-amber-900/60 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-amber-900 dark:text-amber-100 shrink-0">
                    {ui.forumModPolicyLabel || 'Posting policy:'}
                </span>
                <div className="inline-flex items-center gap-1" role="group" aria-label={ui.forumModPolicyLabel || 'Posting policy'}>
                    <button
                        type="button"
                        className={`forum-mod-policy-btn min-h-9 px-3 py-1 rounded-lg border text-[11px] font-bold transition-colors ${mode === 'free' ? 'arborito-cta-amber border-transparent' : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100 dark:bg-slate-900/60 dark:text-amber-100 dark:border-amber-800 dark:hover:bg-amber-950/40'}${modPolicyLoading ? ' opacity-60 cursor-wait' : ' cursor-pointer'}`}
                        disabled={modPolicyLoading}
                        aria-pressed={mode === 'free' ? 'true' : 'false'}
                        onClick={() => onSetPolicy('free')}
                    >
                        {ui.forumModPolicyFree || 'Open'}
                    </button>
                    <button
                        type="button"
                        className={`forum-mod-policy-btn min-h-9 px-3 py-1 rounded-lg border text-[11px] font-bold transition-colors ${mode === 'strict' ? 'arborito-cta-amber border-transparent' : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100 dark:bg-slate-900/60 dark:text-amber-100 dark:border-amber-800 dark:hover:bg-amber-950/40'}${modPolicyLoading ? ' opacity-60 cursor-wait' : ' cursor-pointer'}`}
                        disabled={modPolicyLoading}
                        aria-pressed={mode === 'strict' ? 'true' : 'false'}
                        onClick={() => onSetPolicy('strict')}
                    >
                        {ui.forumModPolicyStrict || 'Strict (review first)'}
                    </button>
                </div>
                <button
                    type="button"
                    className={`forum-mod-toggle-pending ml-auto min-h-9 px-3 py-1 rounded-lg border text-[11px] font-bold transition-colors ${pendingBtnCls}`}
                    aria-expanded={modPanelOpen ? 'true' : 'false'}
                    onClick={onTogglePanel}
                >
                    {pendingBtnLabel}
                </button>
            </div>
            <p className="m-0 mt-1.5 text-[11px] leading-snug text-amber-800 dark:text-amber-200/90">
                {mode === 'strict'
                    ? ui.forumModPolicyStrictHint ||
                      'New messages from learners are held for your approval before they appear in the forum.'
                    : ui.forumModPolicyFreeHint ||
                      'Every signed message publishes immediately. You can still remove messages and ban users after the fact.'}
            </p>
            {modPanelOpen ? (
                <div className="forum-mod-pending-panel mt-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-white/80 dark:bg-slate-900/60">
                    <div className="px-3 py-2 border-b border-amber-200/80 dark:border-amber-900/60 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-amber-900 dark:text-amber-100">
                            {ui.forumModPendingTitle || 'Pending messages awaiting your approval'}
                        </span>
                        <button
                            type="button"
                            className="forum-mod-refresh-pending text-[11px] font-bold text-amber-700 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-50 underline"
                            aria-label={ui.forumModRefreshPending || 'Refresh'}
                            onClick={onRefreshPending}
                        >
                            {ui.forumModRefreshPending || 'Refresh'}
                        </button>
                    </div>
                    {modPendingLoading ? (
                        <p className="px-3 py-3 text-[11px] text-amber-800 dark:text-amber-200/90">
                            {ui.forumModPendingLoading || 'Loading pending messages…'}
                        </p>
                    ) : !modPendingList?.length ? (
                        <p className="px-3 py-3 text-[11px] text-amber-800 dark:text-amber-200/90">
                            {ui.forumModPendingEmpty || 'No pending messages right now.'}
                        </p>
                    ) : (
                        <ul className="m-0 p-0 list-none max-h-72 overflow-y-auto">
                            {modPendingList.map((p) => {
                                const id = String(p.id || '');
                                return (
                                    <li
                                        key={id}
                                        className="px-3 py-2 border-b border-amber-200/70 dark:border-amber-900/60 last:border-b-0 flex items-start gap-2"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="m-0 text-xs text-slate-800 dark:text-slate-100 break-words whitespace-pre-wrap">
                                                {p.bodyPreview || ''}
                                            </p>
                                            <p className="m-0 mt-0.5 text-[10px] text-amber-700 dark:text-amber-300/80 truncate">
                                                {ui.forumModPendingMsgId || 'id:'} {id.slice(0, 12)}…
                                                {p.createdAt ? <span className="ml-2">{timeAgo(p.createdAt)}</span> : null}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                type="button"
                                                className="forum-mod-approve min-h-9 px-2.5 py-1 rounded-md text-[11px] font-bold arborito-cta-emerald"
                                                onClick={() => onApprove(id)}
                                            >
                                                {ui.forumModApprove || 'Approve'}
                                            </button>
                                            <button
                                                type="button"
                                                className="forum-mod-reject min-h-9 px-2.5 py-1 rounded-md text-[11px] font-bold bg-white text-rose-700 border border-rose-300 hover:bg-rose-50 dark:bg-slate-900 dark:text-rose-200 dark:border-rose-800"
                                                onClick={() => onReject(id)}
                                            >
                                                {ui.forumModReject || 'Reject'}
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            ) : null}
        </Callout>
    );
}

function ForumLimitNote({ ui, isPublicForumTree }) {
    if (!isPublicForumTree) return null;
    const limitBody =
        ui.forumLimitNotice ||
        'Note: this forum is community-hosted. Older pages may disappear if nobody keeps seeding them. Search is best-effort and only covers pages that still exist.';
    const limitSummary = ui.forumLimitSummaryShort || 'Forum notice';
    return (
        <>
            <div className="hidden lg:block shrink-0 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
                <p className="m-0 text-[11px] leading-snug text-slate-600 dark:text-slate-300">{limitBody}</p>
            </div>
            <details className="forum-mob-limit-details lg:hidden shrink-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
                <summary className="cursor-pointer select-none list-none flex items-center justify-between gap-2 px-3 py-2.5 min-h-11 text-xs font-bold text-slate-700 dark:text-slate-200">
                    <span>{limitSummary}</span>
                    <span className="forum-mob-limit-chev text-slate-400 shrink-0 text-[10px] leading-none transition-transform" aria-hidden="true">
                        ▼
                    </span>
                </summary>
                <div className="px-3 pb-3 pt-0 border-t border-slate-200/80 dark:border-slate-700/80">
                    <p className="m-0 text-[11px] leading-snug text-slate-600 dark:text-slate-300">{limitBody}</p>
                </div>
            </details>
        </>
    );
}

function forumDefaultHero(ui, mobile, onClose, embedded) {
    return (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            showClose={!embedded}
            title={ui.forumTitle || 'Forum'}
            titleId="forum-modal-title"
            leadingIcon="💬"
            onClose={onClose}
        />
    );
}

function ForumPanelShell({
    panelHost,
    embedded,
    mobile,
    onClose,
    hero,
    footer,
    children,
    onBackdropClick,
    overlay = null,
}) {
    if (embedded) {
        return (
            <div
                data-embed="1"
                className="arborito-forum-embed-root flex flex-col flex-1 min-h-0 w-full min-w-0 overflow-y-auto custom-scrollbar relative"
            >
                {children}
                {footer}
                {overlay}
            </div>
        );
    }
    if (panelHost) {
        return (
            <DockHubShell mobile={mobile} hero={hero} footer={footer} skipBodyWrap overlay={overlay}>
                {children}
            </DockHubShell>
        );
    }
    return (
        <DockModalShell
            mobile={mobile}
            sizeTier="FORUM"
            skipBodyWrap
            shellOpts={{ rootFlags: 'arborito-modal--forum', lift: 'strong' }}
            onBackdropClick={onBackdropClick ?? onClose}
            hero={hero}
            footer={footer}
            overlay={overlay}
        >
            {children}
        </DockModalShell>
    );
}

export function ForumGateNoTree({ ui, embedded, mobile, onClose, onOpenTrees, panelHost = false }) {
    const body = (
        <div className="arborito-dialog-body-block flex flex-col items-center text-center px-4 sm:px-6 pt-2 pb-2">
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed m-0">
                {ui.forumNoTree || 'Load a tree first.'}
            </p>
        </div>
    );

    const footer = (
        <div className="arborito-modal-footer shrink-0 px-4 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
                type="button"
                className={`forum-open-trees ${modalCtaConfirmFull('emerald')}`}
                onClick={onOpenTrees}
            >
                {ui.forumOpenTreesButton || ui.navSources || 'Trees'}
            </button>
        </div>
    );

    if (embedded) {
        return (
            <div data-embed="1" className="arborito-forum-embed-root flex flex-col flex-1 min-h-0 w-full min-w-0 overflow-y-auto custom-scrollbar">
                {body}
                {footer}
            </div>
        );
    }

    return (
        <ForumPanelShell
            panelHost={panelHost}
            embedded={embedded}
            mobile={mobile}
            onClose={onClose}
            hero={forumDefaultHero(ui, mobile, onClose, embedded)}
            footer={footer}
        >
            {body}
        </ForumPanelShell>
    );
}

export function ForumGateDisabled({ ui, embedded, mobile, onClose, panelHost = false }) {
    const body = (
        <div className="arborito-dialog-body-block flex flex-col items-center text-center px-4 sm:px-6 pt-2 pb-2">
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed m-0 max-w-md">
                {ui.forumDisabledForTree || 'This public tree was published without a forum.'}
            </p>
        </div>
    );

    const footer = embedded ? null : (
        <div className="arborito-modal-footer shrink-0 px-4 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button type="button" className={modalCtaConfirmFull('slate')} onClick={onClose}>
                {ui.dialogOkButton || 'OK'}
            </button>
        </div>
    );

    if (embedded) {
        return (
            <div data-embed="1" className="arborito-forum-embed-root flex flex-col flex-1 min-h-0 w-full min-w-0 overflow-y-auto custom-scrollbar">
                {body}
            </div>
        );
    }

    return (
        <ForumPanelShell
            panelHost={panelHost}
            embedded={embedded}
            mobile={mobile}
            onClose={onClose}
            hero={forumDefaultHero(ui, mobile, onClose, embedded)}
            footer={footer}
        >
            {body}
        </ForumPanelShell>
    );
}

function forumLoginGateHero(ui, mobile, onClose, embedded) {
    return (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            showClose={!embedded}
            title={ui.forumParticipationNeedLoginTitle || ui.publishNeedLoginTitle || 'Sign in required'}
            subtitle=""
            titleId="forum-login-gate-title"
            leadingIcon="🪪"
            onClose={onClose}
        />
    );
}

export function ForumGateLogin({ ui, embedded, mobile, onClose, onOpenProfile, panelHost = false }) {
    const body = (
        <div className="arborito-dialog-body-block flex flex-col items-center text-center px-4 sm:px-6 pt-2 pb-2 min-h-0">
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed m-0 max-w-sm">
                {ui.forumParticipationNeedLoginBody ||
                    ui.publishNeedLoginBody ||
                    'Sign in from Profile to use the forum on public courses.'}
            </p>
        </div>
    );

    const footer = (
        <div className="arborito-modal-footer shrink-0 px-4 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
                type="button"
                className={`forum-gate-open-profile ${modalCtaConfirmFull('emerald')}`}
                onClick={onOpenProfile}
            >
                {ui.forumParticipationOpenProfile || ui.navProfile || 'Profile'}
            </button>
        </div>
    );

    if (embedded) {
        return (
            <div data-embed="1" className="arborito-forum-embed-root flex flex-col flex-1 min-h-0 w-full min-w-0 overflow-y-auto custom-scrollbar">
                {body}
                {footer}
            </div>
        );
    }

    return (
        <ForumPanelShell
            panelHost={panelHost}
            embedded={embedded}
            mobile={mobile}
            onClose={onClose}
            hero={forumLoginGateHero(ui, mobile, onClose, embedded)}
            footer={footer}
        >
            {body}
        </ForumPanelShell>
    );
}

export function ForumShell(props) {
    const {
        ui,
        lang,
        mobile,
        embedded,
        panelHost = false,
        shellOpts,
        mod,
        isPublicForumTree,
        isAuthed,
        placeId,
        threadId,
        mobilePanel,
        pLabel,
        placeIsGeneral,
        tTitle,
        places,
        placeById,
        allThreads,
        allMessages,
        here,
        msgs,
        forumPlaceFilterQ,
        mobNavOpen,
        mobNavStack,
        deskNavStack,
        structureHint,
        modPolicyMode,
        modPolicyLoading,
        modPendingList,
        modPendingLoading,
        modPanelOpen,
        searchQ,
        searching,
        searchResults,
        draft,
        posting,
        replyParentId,
        justCreatedThreadId,
        maxThreadMessages,
        myPub,
        newTopicOpen,
        newTopicTitle,
        newTopicBody,
        creatingTopic,
        scrollPostsToEnd,
        scrollThreadsTop,
        focusComposeNext,
        onClose,
        onStackBack,
        onOpenNewTopic,
        onFilterChange,
        onMobNavOpen,
        onMobNavDismiss,
        onMobDrill,
        onPickPlace,
        onDeskPickPlace,
        onDeskBack,
        onDeskDrill,
        onSetModPolicy,
        onToggleModPanel,
        onRefreshPending,
        onApprovePending,
        onRejectPending,
        threadsProps,
    } = props;

    const subtitleRaw = String(ui.forumSubtitle || '').trim();
    const heroSubtitle =
        mobile && mobilePanel === 'posts' && threadId && !placeIsGeneral
            ? pLabel
            : subtitleRaw || undefined;
    const showStackBack = mobilePanel === 'posts' || (!embedded && mobilePanel === 'threads');
    const stackBackAria =
        mobilePanel === 'posts'
            ? ui.forumAriaBackToList || ui.forumBackToTopicsAria || 'Back'
            : ui.forumAriaCloseForum || ui.navBack || 'Close';

    const heroTitle =
        mobilePanel === 'posts' && threadId ? (
            <>
                <span className="lg:hidden">{tTitle}</span>
                <span className="hidden lg:inline">{ui.forumTitle || 'Forum'}</span>
            </>
        ) : (
            ui.forumTitle || 'Forum'
        );

    const structureHintEl = structureHint ? (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">{structureHint}</p>
    ) : null;

    const forumHero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            showClose={!embedded}
            showBack={showStackBack}
            backTagClass="forum-stack-back"
            backAriaLabel={stackBackAria}
            title={heroTitle}
            titleId="forum-modal-title"
            subtitle={heroSubtitle}
            titleTruncate={mobile && mobilePanel === 'posts' && !!threadId}
            leadingIcon="💬"
            trailingHtml={
                newTopicOpen ? null : (
                    <button
                        type="button"
                        className="forum-new-thread arborito-cta-emerald min-h-11 px-4 py-2 rounded-xl text-xs font-bold tracking-wide shadow-sm shadow-emerald-900/15"
                        aria-label={ui.forumNewTopicAria || ui.forumNewThread || 'New topic'}
                        onClick={onOpenNewTopic}
                    >
                        {ui.forumNewTopic || '+ Topic'}
                    </button>
                )
            }
            onBack={onStackBack}
            onClose={
                newTopicOpen
                    ? () => {
                          threadsProps.onCancelNewTopic?.();
                      }
                    : onClose
            }
        />
    );

    const mobNavHero = (
        <ForumMobileNavHero
            ui={ui}
            places={places}
            placeById={placeById}
            mobNavStack={mobNavStack}
            onDismiss={onMobNavDismiss}
            embedded={embedded}
        />
    );

    const mobNavBody = (
        <ForumMobileNavBody
            ui={ui}
            places={places}
            allThreads={allThreads}
            forumPlaceFilterQ={forumPlaceFilterQ}
            mobNavStack={mobNavStack}
            structureHint={structureHintEl}
            onFilterChange={onFilterChange}
            onPickPlace={onPickPlace}
            onDrillPlace={onMobDrill}
        />
    );

    const mainBody = (
        <div className="forum-main-stack flex flex-col flex-1 min-h-0 min-w-0 w-full">
            {mod ? (
                <ForumModBannerControls
                    ui={ui}
                    modPolicyMode={modPolicyMode}
                    modPolicyLoading={modPolicyLoading}
                    modPendingList={modPendingList}
                    modPendingLoading={modPendingLoading}
                    modPanelOpen={modPanelOpen}
                    onSetPolicy={onSetModPolicy}
                    onTogglePanel={onToggleModPanel}
                    onRefreshPending={onRefreshPending}
                    onApprove={onApprovePending}
                    onReject={onRejectPending}
                />
            ) : null}
            <ForumLimitNote ui={ui} isPublicForumTree={isPublicForumTree} />
            {mobilePanel !== 'posts' ? (
                <ForumMobileZoneBar
                    ui={ui}
                    pLabel={pLabel}
                    onOpenNav={onMobNavOpen}
                    onOpenNewTopic={onOpenNewTopic}
                    showNewTopic={embedded}
                />
            ) : null}
            <div className="forum-master-detail-root flex-1 flex flex-col lg:flex-row min-h-0 bg-slate-100 dark:bg-slate-950 forum-body-canvas">
                <ForumDesktopPlaces
                    ui={ui}
                    places={places}
                    allThreads={allThreads}
                    placeById={placeById}
                    forumPlaceFilterQ={forumPlaceFilterQ}
                    deskNavStack={deskNavStack}
                    structureHint={structureHintEl}
                    onFilterChange={onFilterChange}
                    onDeskBack={onDeskBack}
                    onPickPlace={onDeskPickPlace}
                    onDrillPlace={onDeskDrill}
                />
                <ForumThreads
                    ui={ui}
                    lang={lang}
                    mobile={mobile}
                    mod={mod}
                    isAuthed={isAuthed}
                    isPublicForumTree={isPublicForumTree}
                    placeId={placeId}
                    threadId={threadId}
                    mobilePanel={mobilePanel}
                    here={here}
                    msgs={msgs}
                    allMessages={allMessages}
                    pLabel={pLabel}
                    placeIsGeneral={placeIsGeneral}
                    searchQ={searchQ}
                    searching={searching}
                    searchResults={searchResults}
                    draft={draft}
                    posting={posting}
                    replyParentId={replyParentId}
                    justCreatedThreadId={justCreatedThreadId}
                    maxThreadMessages={maxThreadMessages}
                    myPub={myPub}
                    scrollPostsToEnd={scrollPostsToEnd}
                    scrollThreadsTop={scrollThreadsTop}
                    focusComposeNext={focusComposeNext}
                    {...threadsProps}
                />
            </div>
        </div>
    );

    const forumRoot = (
        <div id="forum-root" className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden w-full relative">
            {mobNavOpen ? mobNavBody : mainBody}
        </div>
    );

    const newTopicOverlay = newTopicOpen ? (
        <ForumNewTopicOverlay
            ui={ui}
            pLabel={pLabel}
            newTopicTitle={newTopicTitle}
            newTopicBody={newTopicBody}
            creatingTopic={creatingTopic}
            onTitleChange={threadsProps.onNewTopicTitleChange}
            onBodyChange={threadsProps.onNewTopicBodyChange}
            onCancel={threadsProps.onCancelNewTopic}
            onCreate={threadsProps.onCreateNewTopic}
        />
    ) : null;

    if (embedded) {
        return (
            <div
                data-arborito-panel="modal-forum"
                data-embed="1"
                className="arborito-forum-embed-root flex flex-col flex-1 min-h-0 w-full min-w-0 overflow-hidden relative"
            >
                {mobNavOpen ? (
                    <>
                        {mobNavHero}
                        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">{mobNavBody}</div>
                    </>
                ) : (
                    <>
                        {mobile && mobilePanel === 'posts' && threadId ? (
                            <ForumPlainHero
                                ui={ui}
                                showBack
                                backAriaLabel={stackBackAria}
                                title={heroTitle}
                                titleId="forum-modal-title"
                                subtitle={heroSubtitle}
                                titleTruncate
                                leadingIcon="💬"
                                onBack={onStackBack}
                            />
                        ) : null}
                        {forumRoot}
                    </>
                )}
                {newTopicOverlay}
            </div>
        );
    }

    return (
        <ForumPanelShell
            panelHost={panelHost}
            embedded={embedded}
            mobile={mobile}
            onClose={onClose}
            hero={mobNavOpen ? mobNavHero : forumHero}
            overlay={newTopicOverlay}
            onBackdropClick={() => {
                if (newTopicOpen) {
                    threadsProps.onCancelNewTopic();
                    return;
                }
                onClose();
            }}
        >
            {forumRoot}
        </ForumPanelShell>
    );
}
