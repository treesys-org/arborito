import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { useEffect, useRef, useState } from 'react';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import {
    hasGdprNetworkConsent,
    onGdprNetworkConsentChanged,
} from '../../../shared/lib/connected-services/index.js';

const EMOJI_DATA = {
    Faces: [
        '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥲', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍',
        '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩',
        '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭',
        '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭',
        '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪',
        '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡',
        '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃',
    ],
    People: [
        '👤', '👶', '👧', '🧒', '👦', '👩', '🧑', '👨', '👩‍🦱', '👨‍🦱', '👩‍🦰', '👨‍🦰', '👱‍♀️', '👱‍♂️',
        '👩‍🦳', '👨‍🦳', '👩‍🦲', '👨‍🦲', '🧔', '👵', '🧓', '👴', '👲', '👳‍♀️', '👳‍♂️', '🧕', '👮‍♀️', '👮‍♂️',
        '👷‍♀️', '👷‍♂️', '💂‍♀️', '💂‍♂️', '🕵️‍♀️', '🕵️‍♂️', '👩‍⚕️', '👨‍⚕️', '👩‍🌾', '👨‍🌾', '👩‍🍳', '👨‍🍳',
        '👩‍🎓', '👨‍🎓', '👩‍🎤', '👨‍🎤', '👩‍🏫', '👨‍🏫', '👩‍🏭', '👨‍🏭', '👩‍💻', '👨‍💻', '👩‍💼', '👨‍💼',
        '👩‍🔧', '👨‍🔧', '👩‍🔬', '👨‍🔬', '👩‍🎨', '👨‍🎨', '👩‍🚒', '👨‍🚒', '👩‍✈️', '👨‍✈️', '👩‍🚀', '👨‍🚀',
        '👩‍⚖️', '👨‍⚖️', '👰', '🤵', '👸', '🤴', '🦸‍♀️', '🦸‍♂️', '🦹‍♀️', '🦹‍♂️', '🤶', '🎅', '🧙‍♀️', '🧙‍♂️',
        '🧝‍♀️', '🧝‍♂️', '🧛‍♀️', '🧛‍♂️', '🧟‍♀️', '🧟‍♂️', '🧞‍♀️', '🧞‍♂️', '🧜‍♀️', '🧜‍♂️', '🧚‍♀️', '🧚‍♂️',
        '👼', '🤰', '🤱', '🙇‍♀️', '🙇‍♂️', '💁‍♀️', '💁‍♂️', '🙅‍♀️', '🙅‍♂️', '🙆‍♀️', '🙆‍♂️', '🙋‍♀️', '🙋‍♂️',
        '🧏‍♀️', '🧏‍♂️', '🤦‍♀️', '🤦‍♂️', '🤷‍♀️', '🤷‍♂️',
    ],
    Animals: [
        '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵',
        '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴',
        '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🕸️', '🦂', '🐢', '🐍', '🦎', '🦖',
        '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆',
        '🦓', '🦍', '🦧', '🦣', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎',
        '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🪶', '🐓', '🦃', '🦤',
        '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔',
        '🐾', '🐉', '🐲',
    ],
};

export function ProfileIdentity({
    tempAvatar,
    tempUsername,
    showEmojiPicker,
    profileDirty,
    guestMode = false,
    usernameAttention = false,
    onToggleEmojiPicker,
    onPickEmoji,
    onUsernameChange,
    onSaveProfile,
}) {
    const { ui } = useIdentityAuth();
    const pickerRef = useRef(null);
    const [networkConsent, setNetworkConsent] = useState(() => hasGdprNetworkConsent());
    const limitedMode = guestMode && !networkConsent;

    useEffect(() => {
        setNetworkConsent(hasGdprNetworkConsent());
        return onGdprNetworkConsentChanged((granted) => setNetworkConsent(!!granted));
    }, []);

    useEffect(() => {
        if (!showEmojiPicker) return undefined;
        const onDocClick = (e) => {
            if (
                pickerRef.current?.contains(e.target) ||
                e.target.closest?.('#btn-avatar-picker')
            ) {
                return;
            }
            onToggleEmojiPicker(false);
        };
        document.addEventListener('click', onDocClick);
        return () => document.removeEventListener('click', onDocClick);
    }, [showEmojiPicker, onToggleEmojiPicker]);

    if (limitedMode) {
        /* Limited hero is rendered by ProfileModal so it can replace auth tabs too. */
        return null;
    }

    return (
        <>
            <div
                className={`profile-identity-head${guestMode ? ' profile-identity-head--guest' : ''}${usernameAttention ? ' profile-identity-head--attention' : ''}`}
            >
                <div className="profile-identity-head__avatar" ref={pickerRef}>
                    <button
                        type="button"
                        id="btn-avatar-picker"
                        className="profile-avatar-btn bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center relative group transition-transform hover:scale-105 shadow-sm border-2 border-slate-100 dark:border-slate-700"
                        aria-label={ui.profileEmojiPickerAria || 'Choose emoji'}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleEmojiPicker(!showEmojiPicker);
                        }}
                    >
                        <span id="avatar-display">
                            <ChromeEmoji
                                emoji={tempAvatar}
                                size={guestMode ? 22 : 28}
                                className="arborito-emoji-glyph"
                            />
                        </span>
                        {!guestMode ? (
                            <div className="absolute inset-0 bg-black/10 dark:bg-black/40 rounded-full flex items-center justify-center text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
                                ✏️
                            </div>
                        ) : null}
                    </button>
                    <div
                        id="emoji-picker"
                        className={`absolute left-0 top-full z-50 mt-2 max-h-[min(18rem,50vh)] w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 text-left [box-shadow:var(--arborito-theme-float-card-shadow)] animate-in duration-200 zoom-in-95 custom-scrollbar dark:border-slate-700 dark:bg-slate-800 md:h-72 md:max-h-none md:w-80${showEmojiPicker ? '' : ' hidden'}`}
                        role="dialog"
                        aria-label={ui.profileEmojiPickerAria || 'Choose emoji'}
                    >
                        {Object.entries(EMOJI_DATA).map(([cat, emojis]) => (
                            <div key={cat}>
                                <div className="arborito-eyebrow arborito-eyebrow--md sticky top-0 z-10 border-b border-slate-100 bg-white px-3 py-2 text-left dark:border-slate-700 dark:bg-slate-800">
                                    {cat}
                                </div>
                                <div className="grid grid-cols-4 gap-1 p-2 sm:grid-cols-6">
                                    {emojis.map((e) => (
                                        <button
                                            key={e}
                                            type="button"
                                            className="emoji-btn flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-2xl transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
                                            onClick={(ev) => {
                                                ev.stopPropagation();
                                                onPickEmoji(e);
                                            }}
                                        >
                                            <ChromeEmoji emoji={e} size={28} className="arborito-emoji-glyph" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="profile-identity-head__main">
                    {guestMode ? (
                        <label htmlFor="inp-username" className="profile-identity__online-label">
                            {ui.profileSignInUsernameLabel || 'Username'}
                        </label>
                    ) : null}
                    <input
                        id="inp-username"
                        value={tempUsername}
                        placeholder={
                            guestMode
                                ? ui.profileSignInUsernamePlaceholder ||
                                  ui.usernamePlaceholder ||
                                  'your_username'
                                : ui.usernamePlaceholder || ''
                        }
                        aria-label={
                            guestMode
                                ? ui.profileSignInUsernameLabel || 'Username'
                                : ui.profileIdentity || ui.usernamePlaceholder || 'Display name'
                        }
                        autoComplete={guestMode ? 'username' : 'nickname'}
                        spellCheck={false}
                        className={`profile-identity__name${guestMode ? ' profile-identity__name--guest' : ''}`}
                        onChange={(e) => onUsernameChange(e.target.value)}
                        onKeyDown={
                            guestMode
                                ? (e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault();
                                          window.dispatchEvent(
                                              new CustomEvent('arborito-profile-auth-primary')
                                          );
                                      }
                                  }
                                : undefined
                        }
                    />
                </div>
            </div>
            {profileDirty ? (
                <button
                    type="button"
                    id="btn-save-profile"
                    className="profile-save-btn arborito-cta-sky focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    onClick={onSaveProfile}
                >
                    {ui.profileUpdateDisplayButton || ui.saveProfile}
                </button>
            ) : null}
        </>
    );
}
