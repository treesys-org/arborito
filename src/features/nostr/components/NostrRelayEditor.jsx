import { useEffect, useMemo, useState } from 'react';
import {
    SUGGESTED_NOSTR_RELAYS,
    SUGGESTED_NOSTR_RELAY_LABELS,
    mergeNostrRelayUrls,
    normalizeNostrRelayUrls,
    nostrRelayDisplayHost,
} from '../api/nostr-relays-runtime.js';

/**
 * Editable relay list: suggested chips, custom URLs, remove, restore bundle.
 * @param {{
 *   ui: Record<string, string>,
 *   initialUrls: string[],
 *   disabled?: boolean,
 *   onSave: (urls: string[]) => void,
 *   onRestoreSuggested: () => void,
 * }} props
 */
export function NostrRelayEditor({ ui, initialUrls, disabled = false, onSave, onRestoreSuggested }) {
    const [draft, setDraft] = useState(() => normalizeNostrRelayUrls(initialUrls));
    const [customUrl, setCustomUrl] = useState('');
    const [customError, setCustomError] = useState('');

    useEffect(() => {
        setDraft(normalizeNostrRelayUrls(initialUrls));
    }, [initialUrls]);

    const suggestedSet = useMemo(() => new Set(SUGGESTED_NOSTR_RELAYS), []);
    const customRelays = useMemo(
        () => draft.filter((u) => !suggestedSet.has(u)),
        [draft, suggestedSet]
    );

    const toggleSuggested = (url) => {
        setDraft((prev) => {
            const has = prev.includes(url);
            if (has) {
                if (prev.length <= 1) return prev;
                return prev.filter((u) => u !== url);
            }
            return mergeNostrRelayUrls(prev, [url]);
        });
    };

    const removeRelay = (url) => {
        setDraft((prev) => {
            if (prev.length <= 1) return prev;
            return prev.filter((u) => u !== url);
        });
    };

    const addCustom = () => {
        const merged = mergeNostrRelayUrls(draft, customUrl);
        if (merged.length === draft.length) {
            setCustomError(ui.profileNetworkRelaysAddInvalid || 'Enter a valid wss:// relay URL.');
            return;
        }
        setCustomError('');
        setDraft(merged);
        setCustomUrl('');
    };

    const save = () => {
        const normalized = normalizeNostrRelayUrls(draft);
        if (!normalized.length) {
            setCustomError(
                ui.onboardingNetworkMinOne || 'Choose at least one relay or turn off the public network.'
            );
            return;
        }
        onSave(normalized);
    };

    return (
        <div className="nostr-relay-editor space-y-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70 mt-2">
            <p className="m-0 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                {ui.profileNetworkRelaysEditorHint ||
                    ui.onboardingNetworkBundleHint ||
                    'Use the recommended bundle so teachers and learners see the same course.'}
            </p>
            <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_NOSTR_RELAYS.map((url) => {
                    const on = draft.includes(url);
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
                            onClick={() => toggleSuggested(url)}
                            title={url}
                        >
                            {nostrRelayDisplayHost(url)}
                            {region ? ` · ${region}` : ''}
                        </button>
                    );
                })}
            </div>
            {customRelays.length ? (
                <ul className="m-0 p-0 list-none space-y-1">
                    {customRelays.map((url) => (
                        <li
                            key={url}
                            className="flex items-center justify-between gap-2 text-[10px] text-slate-600 dark:text-slate-300"
                        >
                            <span className="break-all min-w-0">{url}</span>
                            <button
                                type="button"
                                className="shrink-0 text-[10px] font-bold text-red-700 dark:text-red-300 hover:underline disabled:opacity-40"
                                disabled={disabled || draft.length <= 1}
                                onClick={() => removeRelay(url)}
                            >
                                {ui.profileNetworkRelaysRemove || ui.remove || 'Remove'}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300">
                {ui.onboardingNetworkAddRelay || 'Add relay'}
                <div className="mt-1 flex gap-2">
                    <input
                        type="text"
                        className="arborito-input min-h-9 text-xs flex-1 min-w-0"
                        placeholder={ui.onboardingNetworkAddRelayPlaceholder || 'wss://…'}
                        value={customUrl}
                        disabled={disabled}
                        onChange={(e) => {
                            setCustomUrl(e.target.value);
                            if (customError) setCustomError('');
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addCustom();
                            }
                        }}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <button
                        type="button"
                        className="shrink-0 min-h-9 px-2 rounded-lg text-[10px] font-extrabold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                        disabled={disabled || !String(customUrl || '').trim()}
                        onClick={addCustom}
                    >
                        {ui.add || 'Add'}
                    </button>
                </div>
            </label>
            {customError ? (
                <p className="m-0 text-[11px] font-bold text-amber-800 dark:text-amber-200" role="alert">
                    {customError}
                </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
                <button
                    type="button"
                    className="text-[11px] font-extrabold text-violet-700 dark:text-violet-300 hover:underline"
                    disabled={disabled}
                    onClick={onRestoreSuggested}
                >
                    {ui.profileNetworkRelaysRestore || 'Restore recommended bundle'}
                </button>
                <button
                    type="button"
                    className="arborito-cta-emerald min-h-9 px-3 py-1.5 rounded-xl text-[11px] font-extrabold"
                    disabled={disabled}
                    onClick={save}
                >
                    {ui.profileNetworkRelaysSave || 'Save relays'}
                </button>
            </div>
        </div>
    );
}
