import { useSources } from '../hooks/useSources.js';
import {
    UntrustedTreeWarningShell,
    ackNostrPublicTree,
} from './components/UntrustedTreeWarningShell.jsx';

export function ModalLoadWarning() {
    const sources = useSources();
    const { ui, pendingUntrustedSource, cancelUntrustedLoad, proceedWithUntrustedLoad } = sources;

    const url = pendingUntrustedSource?.url;

    return (
        <UntrustedTreeWarningShell
            ui={ui}
            url={url}
            variant="load"
            backTagClass="btn-load-mob-back"
            closeTagClass="btn-load-x"
            onCancel={() => cancelUntrustedLoad()}
            onConfirm={() => {
                if (url) ackNostrPublicTree(url);
                proceedWithUntrustedLoad();
            }}
        />
    );
}
