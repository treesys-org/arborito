import { useSources } from '../hooks/useSources.js';
import {
    UntrustedTreeWarningShell,
    ackNostrPublicTree,
} from './components/UntrustedTreeWarningShell.jsx';

export function ModalSecurityWarning() {
    const sources = useSources();
    const {
        ui,
        modal,
        dismissModal,
        addCommunitySource,
        notifyCommunityAddResult,
        maybeAutoLoadCommunityAfterAdd,
        loadData,
        activeSource,
    } = sources;

    const url = modal?.url;

    return (
        <UntrustedTreeWarningShell
            ui={ui}
            url={url}
            variant="community-add"
            backTagClass="btn-sec-mob-back"
            closeTagClass="btn-sec-x"
            onCancel={() => dismissModal()}
            onConfirm={() => {
                if (url) {
                    ackNostrPublicTree(url);
                    const res = addCommunitySource(url);
                    notifyCommunityAddResult(res);
                    if (res?.ok) {
                        void maybeAutoLoadCommunityAfterAdd(res).then(() => {
                            if (res.source && activeSource?.id !== res.source.id) {
                                void loadData(res.source);
                            }
                        });
                    }
                }
                dismissModal();
            }}
        />
    );
}
