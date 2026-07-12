import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    SUGGESTED_NOSTR_RELAYS,
    SUGGESTED_NOSTR_RELAY_LABELS,
    mergeNostrRelayUrls,
    normalizeNostrRelayUrls,
    nostrRelayDisplayHost,
} from '../../nostr/api/nostr-relays-runtime.js';

/**
 * Inline network + relay picker for onboarding step 1 (collapsed by default).
 * @param {{ ui: Record<string, string>, disabled?: boolean, onConfigChange: (cfg: { networkOn: boolean, relayUrls: string[] }) => void, onNetworkOffIntent?: () => Promise<boolean> }} props
 */
export function OnboardingNetworkSection({ ui, disabled = false, onConfigChange, onNetworkOffIntent }) {
    const [networkOn, setNetworkOn] = useState(true);
    const [customizeOpen, setCustomizeOpen] = useState(false);
    const [selected, setSelected] = useState(() => new Set(SUGGESTED_NOSTR_RELAYS));
    const [customUrl, setCustomUrl] = useState('');

    const relayUrls = useMemo(() => {
        if (!networkOn) return [];
        const fromChecks = SUGGESTED_NOSTR_RELAYS.filter((u) => selected.has(u));
        return mergeNostrRelayUrls(fromChecks, customUrl);
    }, [networkOn, selected, customUrl]);

    const emit = useCallback(() => {
        onConfigChange?.({ networkOn, relayUrls });
    }, [networkOn, relayUrls, onConfigChange]);

    useEffect(() => {
        emit();
    }, [emit]);

    const toggleRelay = (url) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(url)) {
                if (next.size <= 1) return prev;
                next.delete(url);
            } else {
                next.add(url);
            }
            return next;
        });
    };

    const customizeLbl = customizeOpen
        ? ui.onboardingNetworkCustomizeHide || 'Hide servers'
        : ui.onboardingNetworkCustomizeShow || 'Customize servers';

    const handleNetworkToggle = async (next) => {
        if (!next && networkOn && typeof onNetworkOffIntent === 'function') {
            const ok = await onNetworkOffIntent();
            if (!ok) return;
        }
        setNetworkOn(next);
    };

    return (
        <div className="arborito-onboarding-network rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-950/30 px-3 py-2 mt-3">
            <label className="profile-network-inline__quiet arborito-onboarding-network__toggle">
                <span className="profile-network-inline__label">
                    {ui.profileNetworkModeLabel || ui.onboardingNetworkHeading || 'Online'}
                </span>
                <button
                    type="button"
                    role="switch"
                    id="onboarding-network-toggle"
                    className="arborito-switch arborito-switch--compact"
                    aria-checked={networkOn ? 'true' : 'false'}
                    disabled={disabled}
                    onClick={() => void handleNetworkToggle(!networkOn)}
                />
            </label>
            {networkOn ? (
                <>
                    <p className="m-0 text-[11px] leading-snug text-slate-500 dark:text-slate-400 px-0.5">
                        {ui.onboardingNetworkBundleHint ||
                            'Use the recommended bundle so teachers and learners see the same course.'}
                    </p>
                    <button
                        type="button"
                        className="mt-1 mb-1 text-[11px] font-bold text-violet-700 dark:text-violet-300 hover:underline"
                        disabled={disabled}
                        onClick={() => setCustomizeOpen((v) => !v)}
                    >
                        {customizeLbl}
                    </button>
                    {customizeOpen ? (
                        <div className="space-y-2 pb-1">
                            <div className="flex flex-wrap gap-1.5">
                                {SUGGESTED_NOSTR_RELAYS.map((url) => {
                                    const on = selected.has(url);
                                    const region = SUGGESTED_NOSTR_RELAY_LABELS[url] || '';
                                    return (
                                        <button
                                            key={url}
                                            type="button"
                                            disabled={disabled}
                                            className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${
                                                on
                                                    ? 'bg-violet-100 dark:bg-violet-950/50 border-violet-300 dark:border-violet-700 text-violet-900 dark:text-violet-100'
                                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'
                                            }`}
                                            onClick={() => toggleRelay(url)}
                                            title={url}
                                        >
                                            {nostrRelayDisplayHost(url)}
                                            {region ? ` · ${region}` : ''}
                                        </button>
                                    );
                                })}
                            </div>
                            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                {ui.onboardingNetworkAddRelay || 'Add server'}
                                <input
                                    type="text"
                                    className="arborito-input mt-1 min-h-9 text-xs w-full"
                                    placeholder={ui.onboardingNetworkAddRelayPlaceholder || 'wss://…'}
                                    value={customUrl}
                                    disabled={disabled}
                                    onChange={(e) => setCustomUrl(e.target.value)}
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                            </label>
                        </div>
                    ) : null}
                    {!relayUrls.length ? (
                        <p className="m-0 text-[11px] font-bold text-amber-800 dark:text-amber-200" role="alert">
                            {ui.onboardingNetworkMinOne ||
                                'Choose at least one server or turn off the public network.'}
                        </p>
                    ) : null}
                </>
            ) : (
                <p className="m-0 text-[11px] leading-snug text-slate-500 dark:text-slate-400" role="note">
                    {ui.onboardingNetworkOffWarn ||
                        'Without a network connection there are no share codes, sync, or online catalog. You can enable the network later in Profile.'}
                </p>
            )}
        </div>
    );
}

/** @returns {boolean} whether accept can proceed */
export function isOnboardingNetworkConfigValid({ networkOn, relayUrls }) {
    if (!networkOn) return true;
    return normalizeNostrRelayUrls(relayUrls).length > 0;
}
