import { store } from '../../../../core/store.js';
import { escHtml, escAttr } from '../../../../shared/lib/html-escape.js';

const EMOJI_DATA = {
    "Faces": ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥸", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "☠️", "👽", "👾", "🤖", "🎃"],
    "People": ["👶", "👧", "🧒", "👦", "👩", "🧑", "👨", "👩‍🦱", "👨‍🦱", "👩‍🦰", "👨‍🦰", "👱‍♀️", "👱‍♂️", "👩‍🦳", "👨‍🦳", "👩‍🦲", "👨‍🦲", "🧔", "👵", "🧓", "👴", "👲", "👳‍♀️", "👳‍♂️", "🧕", "👮‍♀️", "👮‍♂️", "👷‍♀️", "👷‍♂️", "💂‍♀️", "💂‍♂️", "🕵️‍♀️", "🕵️‍♂️", "👩‍⚕️", "👨‍⚕️", "👩‍🌾", "👨‍🌾", "👩‍🍳", "👨‍🍳", "👩‍🎓", "👨‍🎓", "👩‍🎤", "👨‍🎤", "👩‍🏫", "👨‍🏫", "👩‍🏭", "👨‍🏭", "👩‍💻", "👨‍💻", "👩‍💼", "👨‍💼", "👩‍🔧", "👨‍🔧", "👩‍🔬", "👨‍🔬", "👩‍🎨", "👨‍🎨", "👩‍🚒", "👨‍🚒", "👩‍✈️", "👨‍✈️", "👩‍🚀", "👨‍🚀", "👩‍⚖️", "👨‍⚖️", "👰", "🤵", "👸", "🤴", "🦸‍♀️", "🦸‍♂️", "🦹‍♀️", "🦹‍♂️", "🤶", "🎅", "🧙‍♀️", "🧙‍♂️", "🧝‍♀️", "🧝‍♂️", "🧛‍♀️", "🧛‍♂️", "🧟‍♀️", "🧟‍♂️", "🧞‍♀️", "🧞‍♂️", "🧜‍♀️", "🧜‍♂️", "🧚‍♀️", "🧚‍♂️", "👼", "🤰", "🤱", "🙇‍♀️", "🙇‍♂️", "💁‍♀️", "💁‍♂️", "🙅‍♀️", "🙅‍♂️", "🙆‍♀️", "🙆‍♂️", "🙋‍♀️", "🙋‍♂️", "🧏‍♀️", "🧏‍♂️", "🤦‍♀️", "🤦‍♂️", "🤷‍♀️", "🤷‍♂️"],
    "Animals": ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞", "🐜", "🦟", "🦗", "🕷️", "🕸️", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🦣", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🦘", "🦬", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🦙", "🐐", "🦌", "🐕", "🐩", "🦮", "🐕‍🦺", "🐈", "🐈‍⬛", "🪶", "🐓", "🦃", "🦤", "🦚", "🦜", "🦢", "🦩", "🕊️", "🐇", "🦝", "🦨", "🦡", "🦫", "🦦", "🦥", "🐁", "🐀", "🐿️", "🦔", "🐾", "🐉", "🐲"]
};

/** Identity panel of the Profile sheet: avatar emoji picker, display-name input,
 * the streak/XP/seeds stat strip, and the "Save profile" button. Keeps the two
 * username inputs (the header field and the in-panel sign-in mirror) in sync
 * via the shared `this.state.tempUsername`. */
export const identityMixin = {
    updateView() {
        const picker = this.querySelector('#emoji-picker');
        if (picker) {
             if (this.state.showEmojiPicker) picker.classList.remove('hidden');
             else picker.classList.add('hidden');
        }

        const avatarDisplay = this.querySelector('#avatar-display');
        if (avatarDisplay) avatarDisplay.textContent = this.state.tempAvatar;
    },

    /** Update save button without rebuilding the whole modal (typing name). */
    updateProfileDirtyUi() {
        const g = store.value.gamification;
        const hasSavedProfile = !!String((g && g.username) || '').trim();
        const dirty =
            hasSavedProfile && (
                String(this.state.tempUsername || '').trim() !== String((g && g.username) || '').trim() ||
                String(this.state.tempAvatar || '') !== String((g && g.avatar) || '')
            );
        if (dirty !== this._lastProfileDirty) {
            this._lastProfileDirty = dirty;
            this.render();
            return;
        }
        const btn = this.querySelector('#btn-save-profile');
        if (!btn) return;
        btn.disabled = false;
    },

    _renderAvatarPickerHtml(ui) {
        return `
            <div class="profile-identity-head__avatar">
                <button type="button" id="btn-avatar-picker" class="profile-avatar-btn bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center relative group transition-transform hover:scale-105 shadow-sm border-2 border-slate-100 dark:border-slate-700">
                    <span id="avatar-display">${this.state.tempAvatar}</span>
                    <div class="absolute inset-0 bg-black/10 dark:bg-black/40 rounded-full flex items-center justify-center text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">✏️</div>
                </button>
                <div id="emoji-picker" class="absolute left-0 top-full z-50 mt-2 hidden max-h-[min(18rem,50vh)] w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 text-left shadow-2xl animate-in duration-200 zoom-in-95 custom-scrollbar dark:border-slate-700 dark:bg-slate-800 md:h-72 md:max-h-none md:w-80" role="dialog" aria-label="${escAttr(ui.profileEmojiPickerAria || 'Choose emoji')}">
                    ${Object.entries(EMOJI_DATA).map(([cat, emojis]) => `
                        <div class="arborito-eyebrow arborito-eyebrow--md sticky top-0 z-10 border-b border-slate-100 bg-white px-3 py-2 text-left dark:border-slate-700 dark:bg-slate-800">${cat}</div>
                        <div class="grid grid-cols-4 gap-1 p-2 sm:grid-cols-6">
                            ${emojis.map(e => `<button type="button" class="emoji-btn flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-2xl transition-colors hover:bg-slate-100 dark:hover:bg-slate-700">${e}</button>`).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>`;
    },

    _renderIdentityWhoHtml(ui, g, profileDirty, seedsCount, seedsBadgeTitle, seedsBadgeAria) {
        const avatarPickerHtml = this._renderAvatarPickerHtml(ui);
        return `
                                <div class="profile-identity-head">
                                    ${avatarPickerHtml}
                                    <div class="profile-identity-head__main">
                                        <input id="inp-username" value="${escAttr(this.state.tempUsername)}" placeholder="${escAttr(ui.usernamePlaceholder || '')}" aria-label="${escAttr(ui.profileIdentity || ui.usernamePlaceholder || 'Display name')}" class="profile-identity__name">
                                        <div class="profile-identity__stats">
                                            <span class="profile-identity__stat">💧 ${g.streak} ${ui.days}</span>
                                            <span class="profile-identity__stat">☀️ ${g.xp} XP</span>
                                            <span id="profile-seeds-badge" class="profile-identity__stat" title="${escAttr(seedsBadgeTitle)}" aria-label="${escAttr(seedsBadgeAria)}">🌰 ${seedsCount}</span>
                                        </div>
                                    </div>
                                </div>
                                ${
                                    profileDirty
                                        ? `<button type="button" id="btn-save-profile" class="profile-save-btn border-2 border-sky-600 bg-sky-600 text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">${escHtml(ui.profileUpdateDisplayButton || ui.saveProfile)}</button>`
                                        : ''
                                }`;
    },

    _bindIdentityEvents() {
        this.querySelector('#btn-avatar-picker').onclick = (e) => {
            e.stopPropagation();
            this.state.showEmojiPicker = !this.state.showEmojiPicker;
            this.updateView();
        };

        this.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.state.tempAvatar = e.currentTarget.textContent;
                this.state.showEmojiPicker = false;
                this.updateView();
                this.updateProfileDirtyUi();
            };
        });

        const inpUsername = this.querySelector('#inp-username');
        if (inpUsername) {
            inpUsername.oninput = (e) => {
                this.state.tempUsername = e.target.value;
                /* Reverse sync: keep the in-panel sign-in username field updated
                   when the user types into the display-name header instead. */
                const mirror = this.querySelector('#profile-sync-username');
                if (mirror && mirror.value !== e.target.value) {
                    mirror.value = e.target.value;
                }
                if (this.state.authError) this.state.authError = '';
                this.updateProfileDirtyUi();
                const signedInNow = !!(store.isSignedIn && store.isSignedIn());
                if (!signedInNow && this._profileSyncMode === 'create') {
                    this._scheduleUsernameCheck();
                }
            };
        }

        const btnSave = this.querySelector('#btn-save-profile');
        if (btnSave) {
            btnSave.onclick = () => {
                if (btnSave.disabled) return;
                const username = this.state.tempUsername.trim();
                const avatar = this.state.tempAvatar;
                store.updateUserProfile(username, avatar);
                this.state.tempUsername = ((store.value.gamification && store.value.gamification.username) != null ? store.value.gamification.username : username);
                this.state.tempAvatar = ((store.value.gamification && store.value.gamification.avatar) != null ? store.value.gamification.avatar : avatar);
                this.lastRenderKey = null;
                this.render();
            };
        }
    }
};
