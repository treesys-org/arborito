import { useCallback, useEffect, useState } from 'react';
import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import {
    loadUserNostrRelays,
    SUGGESTED_NOSTR_RELAYS,
    mergeNostrRelayUrls,
} from '../../nostr/api/nostr-relays-runtime.js';
import {
    hasGdprNetworkConsent,
    onGdprNetworkConsentChanged,
    withdrawGdprNetworkConsent,
} from '../../../shared/lib/connected-services/index.js';
import { getArboritoStore } from '../../../core/store-singleton.js';
import { NostrRelayEditor } from '../../nostr/components/NostrRelayEditor.jsx';
import { NetworkOnlineStatus } from '../components/NetworkOnlineStatus.jsx';

/**
 * @param {{ previewPending?: boolean }} [props]
 *   previewPending — onboarding privacy read-only: show Online ON (frozen) before consent is granted.
 */
export function ProfileNetworkRelays({ previewPending = false } = {}) {
    const { ui, notify, identityActions, acknowledge } = useIdentityAuth();
    const [networkOn, setNetworkOn] = useState(() =>
        previewPending ? true : hasGdprNetworkConsent()
    );
    const [relays, setRelays] = useState(() => loadUserNostrRelays());
    const [editorOpen, setEditorOpen] = useState(false);

    const refresh = useCallback(() => {
        setRelays(loadUserNostrRelays());
        setNetworkOn(previewPending ? true : hasGdprNetworkConsent());
    }, [previewPending]);

    const ensureRelaysWhenOnline = useCallback(() => {
        if (previewPending) return;
        if (!hasGdprNetworkConsent()) return;
        if (loadUserNostrRelays().length) return;
        identityActions?.setNostrRelayUrls?.(mergeNostrRelayUrls(SUGGESTED_NOSTR_RELAYS, []));
        refresh();
    }, [previewPending, identityActions, refresh]);

    useEffect(() => {
        refresh();
        ensureRelaysWhenOnline();
        const offConsent = onGdprNetworkConsentChanged(() => {
            refresh();
            ensureRelaysWhenOnline();
        });
        const onStorage = (e) => {
            if (e.key === 'arborito-nostr-relays-v1' || e.key === 'arborito-gdpr-network-consent') {
                refresh();
                ensureRelaysWhenOnline();
            }
        };
        window.addEventListener('storage', onStorage);
        return () => {
            offConsent();
            window.removeEventListener('storage', onStorage);
        };
    }, [refresh, ensureRelaysWhenOnline]);

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

    const disableNetwork = async () => {
        if (previewPending || !networkOn) return;
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
        try {
            getArboritoStore()?.cancelPendingAccountSyncTimers?.();
        } catch {
            /* ignore */
        }
        setEditorOpen(false);
        setNetworkOn(false);
        refresh();
    };

    const changeLbl = ui.profileNetworkRelaysChange || 'Servers';
    const disableLbl = ui.profileNetworkModeDisableLink || 'Go local-only';
    const acceptHint =
        ui.profileNetworkModeAcceptHint ||
        'Accept the privacy policy below to enable the network.';

    return (
        <div className="profile-network-inline shrink-0">
            <NetworkOnlineStatus
                id="profile-network-status"
                ui={ui}
                online={networkOn}
                previewPending={previewPending}
            />
            {!previewPending ? (
                networkOn ? (
                    <div className="profile-network-inline__meta">
                        <button
                            type="button"
                            className="profile-network-inline__link"
                            aria-expanded={editorOpen}
                            onClick={() => setEditorOpen((v) => !v)}
                        >
                            {editorOpen ? ui.close || 'Close' : changeLbl}
                        </button>
                        <button
                            type="button"
                            className="profile-network-inline__link"
                            onClick={restoreSuggested}
                        >
                            {ui.profileNetworkRelaysRestore || 'Restore bundle'}
                        </button>
                        <button
                            type="button"
                            id="profile-network-disable"
                            className="profile-network-inline__link profile-network-inline__link--warn"
                            onClick={() => void disableNetwork()}
                        >
                            {disableLbl}
                        </button>
                    </div>
                ) : (
                    <p className="profile-network-inline__hint">{acceptHint}</p>
                )
            ) : null}
            {networkOn && !previewPending && editorOpen ? (
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
