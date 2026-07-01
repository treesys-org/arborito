import { useForumModal } from '../hooks/useForumModal.js';
import { ForumGateLogin, ForumGateNoTree, ForumShell } from './ForumShell.jsx';

const EMBED_SHELL = 'flex flex-col flex-1 min-h-0 w-full min-w-0';

export function ModalForum({ embed = false }) {
    const m = useForumModal(embed);
    const embedShell = embed ? EMBED_SHELL : undefined;

    if (!m.src || !m.rawGraphData) {
        return (
            <div data-arborito-panel="modal-forum" data-embed={embed ? '1' : undefined} className={embedShell}>
                <ForumGateNoTree
                    ui={m.ui}
                    embedded={embed || m.embedded}
                    mobile={m.mobile}
                    onClose={m.close}
                    onOpenTrees={() => {
                        if (!m.embedded) m.close();
                        m.setModal('sources');
                    }}
                />
            </div>
        );
    }

    if (m.isPublicForumTree && !m.isAuthed) {
        return (
            <div data-arborito-panel="modal-forum" data-embed={embed ? '1' : undefined} className={embedShell}>
                <ForumGateLogin
                    ui={m.ui}
                    embedded={embed || m.embedded}
                    mobile={m.mobile}
                    onClose={m.close}
                    onOpenProfile={() => {
                        if (!m.embedded) m.close();
                        m.setModal({ type: 'profile' });
                    }}
                />
            </div>
        );
    }

    return (
        <div data-arborito-panel="modal-forum" data-embed={embed ? '1' : undefined} className={embedShell}>
            <ForumShell
                ui={m.ui}
                lang={m.langLower}
                mobile={m.mobile}
                embedded={embed || m.embedded}
                shellOpts={m.shellOpts}
                mod={m.mod}
                isPublicForumTree={m.isPublicForumTree}
                isAuthed={m.isAuthed}
                placeId={m.effPlaceId}
                threadId={m.effThreadId}
                mobilePanel={m.effMobilePanel}
                pLabel={m.pLabel}
                placeIsGeneral={m.placeIsGeneral}
                tTitle={m.tTitle}
                places={m.places}
                placeById={m.placeById}
                allThreads={m.allThreads}
                allMessages={m.allMessages}
                here={m.here}
                msgs={m.msgs}
                forumPlaceFilterQ={m.forumPlaceFilterQ}
                mobNavOpen={m.forumMobNavOpen}
                mobNavStack={m.forumMobNavStack}
                deskNavStack={m.forumDeskNavStack}
                structureHint={m.structureHint}
                modPolicyMode={m.modPolicyMode}
                modPolicyLoading={m.modPolicyLoading}
                modPendingList={m.modPendingList}
                modPendingLoading={m.modPendingLoading}
                modPanelOpen={m.modPanelOpen}
                searchQ={m.searchQ}
                searching={m.searching}
                searchResults={m.searchResults}
                draft={m.draft}
                posting={m.posting}
                replyParentId={m.effReplyParentId}
                justCreatedThreadId={m.justCreatedThreadId}
                maxThreadMessages={220}
                myPub={m.myPub()}
                newTopicOpen={m.newTopicOpen}
                newTopicTitle={m.newTopicTitle}
                newTopicBody={m.newTopicBody}
                creatingTopic={m.creatingTopic}
                scrollPostsToEnd={m.scrollPostsToEnd}
                scrollThreadsTop={m.scrollThreadsTop}
                focusComposeNext={m.focusComposeNext}
                onClose={m.close}
                onStackBack={m.onStackBack}
                onOpenNewTopic={m.openNewTopicSheet}
                onFilterChange={m.onFilterChange}
                onMobNavOpen={() => m.setForumMobNavOpen(true)}
                onMobNavDismiss={m.onMobNavDismiss}
                onMobDrill={(id) => m.setForumMobNavStack((s) => [...s, id])}
                onPickPlace={(id) => m.pickPlace(id, { scrollTop: true, closeMobNav: true })}
                onDeskBack={() => m.setForumDeskNavStack((s) => s.slice(0, -1))}
                onDeskPickPlace={(id) => m.pickPlace(id, { scrollTop: true })}
                onDeskDrill={(id) => m.setForumDeskNavStack((s) => [...s, id])}
                onSetModPolicy={m.setModPolicy}
                onToggleModPanel={m.toggleModPanel}
                onRefreshPending={m.refreshPendingList}
                onApprovePending={m.approvePending}
                onRejectPending={m.rejectPending}
                threadsProps={m.threadsProps}
            />
        </div>
    );
}
