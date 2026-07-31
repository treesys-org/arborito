import { useCallback, useMemo } from 'react';
import { useHookUi, useShellModalActions } from '../../../app/hooks/useHookShell.js';
import { useShellUiSlice } from '../../../stores/shell-ui-store.js';
import { useTreeGraphSlice } from '../../../stores/tree-graph-store.js';
import { useSourcesSlice } from '../../../stores/sources-store.js';
import { publishingActions } from '../../../stores/publishing-store-actions.js';
import { getArboritoStore } from '../../../core/store-singleton.js';
import {
    buildPublishHubConfirmBody,
    defaultIncludeForumForPublish,
    defaultListInDiscoverForPublish,
    isRepublishForActiveSource,
    liveIncludeForumForPublish,
    liveListInDiscoverForPublish,
} from '../api/publish-hub-confirm.js';

/** Publicar, licencias, diff. */
export function usePublishing() {
    const ui = useHookUi();
    const { publishingTree } = useShellUiSlice((s) => s);
    const { dismissModal, setModal, notify, confirm, alert } = useShellModalActions();
    const rawGraphData = useTreeGraphSlice((s) => s.rawGraphData);
    const activeSource = useSourcesSlice((s) => s.activeSource);

    const publishTreePublicInteractive = useCallback(
        (opts) => publishingActions.publishTreePublicInteractive(opts),
        []
    );
    const revokePublicTreeInteractive = useCallback(
        (opts) => publishingActions.revokePublicTreeInteractive(opts),
        []
    );
    const downloadProgressFile = useCallback(() => publishingActions.downloadProgressFile(), []);

    const republish = useMemo(() => isRepublishForActiveSource(getArboritoStore()), [
        rawGraphData,
        activeSource,
    ]);
    const confirmCopy = useMemo(
        () => buildPublishHubConfirmBody(getArboritoStore() || { ui }, { republish }),
        [republish, ui, rawGraphData, activeSource]
    );
    const defaultIncludeForum = useMemo(
        () => defaultIncludeForumForPublish(getArboritoStore() || {}),
        [rawGraphData?.meta?.forumEnabled, activeSource]
    );
    const defaultListInDiscover = useMemo(
        () => defaultListInDiscoverForPublish(getArboritoStore() || {}),
        [rawGraphData?.meta?.listInDiscover, activeSource]
    );
    const liveIncludeForum = useMemo(
        () => liveIncludeForumForPublish(getArboritoStore() || {}),
        [rawGraphData?.meta?.forumEnabled, activeSource]
    );
    const liveListInDiscover = useMemo(
        () => liveListInDiscoverForPublish(getArboritoStore() || {}),
        [rawGraphData?.meta?.listInDiscover, activeSource]
    );

    return {
        ui,
        publishingTree,
        confirm,
        alert,
        publishTreePublicInteractive,
        revokePublicTreeInteractive,
        downloadProgressFile,
        republish,
        confirmCopy,
        defaultIncludeForum,
        defaultListInDiscover,
        liveIncludeForum,
        liveListInDiscover,
        dismissModal,
        setModal,
        notify,
    };
}
