import { useCallback, useEffect, useState } from 'react';
import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import {
    loadUserNostrRelays,
    SUGGESTED_NOSTR_RELAYS,
    mergeNostrRelayUrls,
} from '../../nostr/api/nostr-relays-runtime.js';
import {
    grantGdprNetworkConsent,
    hasGdprNetworkConsent,
    withdrawGdprNetworkConsent,
} from '../../../shared/lib/connected-services/index.js';
import { NostrRelayEditor } from '../../nostr/components/NostrRelayEditor.jsx';

export function ProfileNetworkRelays() {
    const { ui, notify, identityActions, acknowledge } = useIdentityAuth();
    const [networkOn, setNetworkOn] = useState(() => hasGdprNetworkConsent());
    const [relays, setRelays] = useState(() => loadUserNostrRelays());
    const [editorOpen, setEditorOpen] = useState(false);

    const refresh = useCallback(() => {
        setRelays(loadUserNostrRelays());
        setNetworkOn(hasGdprNetworkConsent());
    }, []);

    useEffect(() => {
        refresh();
        const onStorage = (e) => {
            if (e.key === 'arborito-nostr-relays-v1' || e.key === 'arborito-gdpr-network-consent') refresh();
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [refresh]);

    const persist = (urls) => {
        identityActions?.setNostrRelayUrls?.(urls);
        notify?.(ui.profileNetworkRelaysSaveOk || 'Servers updated.', false);
        refresh();
        setEditorOpen(false);
    };

    const restoreSuggested = () => {
        const merged = mergeNostrRelayUrls(SUGGESTED_NOSTR_RELAYS, relays);
        identityActions?.setNostrRelayUrls?.(merged);
        notify?.(ui.profileNetworkRelaysRestoreOk || 'Recommended network bundle restored.', false);
        refresh();
    };

    const handleNetworkToggle = async (next) => {
        if (!next && networkOn) {
            const ok = await acknowledge({
                title: ui.onboardingLocalOnlyConfirmTitle || 'Local-only mode?',
                body:
                    ui.onboardingLocalOnlyConfirmBody ||
                    'Arborito will be very limited: no online catalog, share codes, forums, sync, or publishing. Only trees on this device and manual import. You can enable the network later from Privacy & data.',
                confirmText: ui.onboardingLocalOnlyConfirmButton || 'Yes, local only',
                dialogIcon: '❓',
                dialogSpotlight: {
                    emoji: '📴',
                    label: ui.onboardingLocalOnlyConfirmSpotlight || 'No network connection',
                },
            });
            if (!ok) return;
            withdrawGdprNetworkConsent();
            identityActions?.setNostrRelayUrls?.([]);
            setEditorOpen(false);
            setNetworkOn(false);
            refresh();
            return;
        }
        if (next && !networkOn) {
            grantGdprNetworkConsent();
            setNetworkOn(true);
            if (!loadUserNostrRelays().length) restoreSuggested();
            else refresh();
        }
    };

    const changeLbl = ui.profileNetworkRelaysChange || 'Servers';
    const onlineLbl = ui.profileNetworkModeLabel || 'Online';

    return (
        <div className="profile-network-inline shrink-0">
            <label className="profile-network-inline__quiet">
                <span className="profile-network-inline__label">{onlineLbl}</span>
                <button
                    type="button"
                    role="switch"
                    id="profile-network-toggle"
                    className="arborito-switch arborito-switch--compact"
                    aria-checked={networkOn ? 'true' : 'false'}
                    aria-label={
                        networkOn
                            ? ui.profileNetworkModeOnAria || 'Turn on online mode'
                            : ui.profileNetworkModeOffAria || 'Turn off online mode'
                    }
                    onClick={() => void handleNetworkToggle(!networkOn)}
                />
            </label>
            {networkOn ? (
                <div className="profile-network-inline__meta">
                    <button
                        type="button"
                        className="profile-network-inline__link"
                        aria-expanded={editorOpen}
                        onClick={() => setEditorOpen((v) => !v)}
                    >
                        {editorOpen
                            ? ui.close || 'Close'
                            : changeLbl}
                    </button>
                    {relays.length === 0 ? (
                        <button
                            type="button"
                            className="profile-network-inline__link"
                            onClick={restoreSuggested}
                        >
                            {ui.profileNetworkRelaysRestore || 'Restore bundle'}
                        </button>
                    ) : null}
                </div>
            ) : null}
            {networkOn && editorOpen ? (
                <NostrRelayEditor
                    ui={ui}
                    initialUrls={relays}
                    onSave={persist}
                    onRestoreSuggested={restoreSuggested}
                />
            ) : null}
        </div>
    );
}
