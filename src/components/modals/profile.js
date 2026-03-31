
import { store } from '../../store.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

// Comprehensive Emoji Data
const EMOJI_DATA = {
    "Faces": ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥸", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "☠️", "👽", "👾", "🤖", "🎃"],
    "People": ["👶", "👧", "🧒", "👦", "👩", "🧑", "👨", "👩‍🦱", "👨‍🦱", "👩‍🦰", "👨‍🦰", "👱‍♀️", "👱‍♂️", "👩‍🦳", "👨‍🦳", "👩‍🦲", "👨‍🦲", "🧔", "👵", "🧓", "👴", "👲", "👳‍♀️", "👳‍♂️", "🧕", "👮‍♀️", "👮‍♂️", "👷‍♀️", "👷‍♂️", "💂‍♀️", "💂‍♂️", "🕵️‍♀️", "🕵️‍♂️", "👩‍⚕️", "👨‍⚕️", "👩‍🌾", "👨‍🌾", "👩‍🍳", "👨‍🍳", "👩‍🎓", "👨‍🎓", "👩‍🎤", "👨‍🎤", "👩‍🏫", "👨‍🏫", "👩‍🏭", "👨‍🏭", "👩‍💻", "👨‍💻", "👩‍💼", "👨‍💼", "👩‍🔧", "👨‍🔧", "👩‍🔬", "👨‍🔬", "👩‍🎨", "👨‍🎨", "👩‍🚒", "👨‍🚒", "👩‍✈️", "👨‍✈️", "👩‍🚀", "👨‍🚀", "👩‍⚖️", "👨‍⚖️", "👰", "🤵", "👸", "🤴", "🦸‍♀️", "🦸‍♂️", "🦹‍♀️", "🦹‍♂️", "🤶", "🎅", "🧙‍♀️", "🧙‍♂️", "🧝‍♀️", "🧝‍♂️", "🧛‍♀️", "🧛‍♂️", "🧟‍♀️", "🧟‍♂️", "🧞‍♀️", "🧞‍♂️", "🧜‍♀️", "🧜‍♂️", "🧚‍♀️", "🧚‍♂️", "👼", "🤰", "🤱", "🙇‍♀️", "🙇‍♂️", "💁‍♀️", "💁‍♂️", "🙅‍♀️", "🙅‍♂️", "🙆‍♀️", "🙆‍♂️", "🙋‍♀️", "🙋‍♂️", "🧏‍♀️", "🧏‍♂️", "🤦‍♀️", "🤦‍♂️", "🤷‍♀️", "🤷‍♂️"],
    "Animals": ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞", "🐜", "🦟", "🦗", "🕷️", "🕸️", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🦣", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🦘", "🦬", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🦙", "🐐", "🦌", "🐕", "🐩", "🦮", "🐕‍🦺", "🐈", "🐈‍⬛", "🪶", "🐓", "🦃", "🦤", "🦚", "🦜", "🦢", "🦩", "🕊️", "🐇", "🦝", "🦨", "🦡", "🦫", "🦦", "🦥", "🐁", "🐀", "🐿️", "🦔", "🐾", "🐉", "🐲"]
};

class ArboritoModalProfile extends HTMLElement {
    constructor() {
        super();
        this.state = {
            showEmojiPicker: false,
            showRestoreInput: false,
            tempAvatar: store.value.gamification.avatar || '👤',
            tempUsername: store.value.gamification.username || ''
        };
        this.lastRenderKey = null;
    }

    connectedCallback() {
        this.render();
        this._storeListener = () => this.render();
        store.addEventListener('state-change', this._storeListener);
        
        this.pickerListener = (e) => {
             if (this.state.showEmojiPicker && !e.target.closest('#emoji-picker') && !e.target.closest('#btn-avatar-picker')) {
                 this.state.showEmojiPicker = false;
                 this.updateView();
             }
        };
        document.addEventListener('click', this.pickerListener);
    }
    
    disconnectedCallback() {
        if (this._storeListener) {
            store.removeEventListener('state-change', this._storeListener);
        }
        document.removeEventListener('click', this.pickerListener);
    }

    close() {
        if (this.hasAttribute('embed')) {
            document.querySelector('arborito-sidebar')?.closeMobileMenuIfOpen?.();
            return;
        }
        store.dismissModal();
    }

    updateView() {
        const picker = this.querySelector('#emoji-picker');
        if (picker) {
             if (this.state.showEmojiPicker) picker.classList.remove('hidden');
             else picker.classList.add('hidden');
        }

        const restoreArea = this.querySelector('#restore-area');
        if (restoreArea) {
             if (this.state.showRestoreInput) restoreArea.classList.remove('hidden');
             else restoreArea.classList.add('hidden');
        }

        const avatarDisplay = this.querySelector('#avatar-display');
        if (avatarDisplay) avatarDisplay.textContent = this.state.tempAvatar;
    }

    render() {
        const ui = store.ui;
        const g = store.value.gamification;
        const collectedItems = g.seeds || g.fruits || [];
        const lang = store.value.lang;
        const theme = store.value.theme;
        const embedded = this.hasAttribute('embed');

        const modal = store.value.modal;
        const profileFocus = embedded
            ? (this.getAttribute('data-focus') || 'seeds')
            : (typeof modal === 'object' && modal?.type === 'profile' ? (modal.focus || '') : '');

        const mob = embedded ? true : shouldShowMobileUI();
        const renderKey = JSON.stringify({
            lang, theme,
            username: g.username,
            avatar: g.avatar,
            xp: g.xp,
            streak: g.streak,
            seeds: collectedItems.length,
            localAvatar: this.state.tempAvatar,
            profileFocus,
            mob,
            embedded,
        });

        if (renderKey === this.lastRenderKey) return;
        this.lastRenderKey = renderKey;

        const focusedId = document.activeElement ? document.activeElement.id : null;
        const selectionStart = document.activeElement ? document.activeElement.selectionStart : null;
        const selectionEnd = document.activeElement ? document.activeElement.selectionEnd : null;

        const mobileChrome = mob
            ? `
                <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-center gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0')}
                    <span class="text-2xl shrink-0" aria-hidden="true">👤</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0 text-left">${ui.navProfile}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>`
            : `
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0')}
                    <span class="text-2xl shrink-0" aria-hidden="true">👤</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0 text-left">${ui.navProfile}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>`;

        const scrollClass = embedded
            ? 'p-4 pt-2 text-center flex-1 min-h-0 overflow-y-auto custom-scrollbar relative flex flex-col'
            : `p-6 md:p-8 ${mob ? 'pt-4' : 'pt-6'} text-center h-full overflow-y-auto custom-scrollbar relative flex flex-col flex-1 min-h-0`;

        const mainScroll = `
                <div class="${scrollClass}">
                    
                    <!-- IDENTITY SECTION -->
                    <div class="mb-8 pb-8 border-b border-slate-100 dark:border-slate-800">
                        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center justify-center gap-2">
                            👤 ${ui.profileIdentity || 'Identity'}
                        </h3>
                        
                        <div class="relative inline-block mb-4">
                            <button id="btn-avatar-picker" class="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-full mx-auto flex items-center justify-center text-5xl relative group transition-transform hover:scale-105 shadow-sm border-2 border-slate-100 dark:border-slate-700">
                                <span id="avatar-display">${this.state.tempAvatar}</span>
                                <div class="absolute inset-0 bg-black/10 dark:bg-black/40 rounded-full flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
                                    ✏️
                                </div>
                            </button>
                            <!-- Picker -->
                            <div id="emoji-picker" class="hidden absolute top-full mt-2 left-1/2 -translate-x-1/2 w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] md:w-80 bg-white dark:bg-slate-800 shadow-2xl rounded-xl border border-slate-200 dark:border-slate-700 z-50 p-0 max-h-[min(18rem,50vh)] md:h-72 md:max-h-none overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200 text-left">
                                ${Object.entries(EMOJI_DATA).map(([cat, emojis]) => `
                                    <div class="text-xs font-bold text-slate-400 px-3 py-2 uppercase tracking-wider text-left sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 z-10">${cat}</div>
                                    <div class="grid grid-cols-6 gap-1 p-2">
                                        ${emojis.map(e => `<button class="emoji-btn hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg p-2 text-xl transition-colors">${e}</button>`).join('')}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        
                        <input id="inp-username" value="${this.state.tempUsername}" placeholder="${ui.usernamePlaceholder}" class="text-2xl font-black text-slate-800 dark:text-white bg-transparent text-center w-full max-w-xs mx-auto outline-none focus:ring-0 border-b-2 border-transparent focus:border-sky-500 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600">
                        
                        <div class="flex items-center justify-center gap-2 mt-3 mb-4">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-bold">
                                💧 ${g.streak} ${ui.days}
                            </span>
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 text-xs font-bold">
                                ☀️ ${g.xp} XP
                            </span>
                        </div>

                        <button id="btn-save-profile" class="px-6 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 transition-colors">
                            ${ui.saveProfile}
                        </button>
                    </div>

                    <!-- DATA MANAGEMENT (Backpack) -->
                    <div id="profile-backpack-section" class="mb-8 scroll-mt-4">
                        <div class="bg-slate-50 dark:bg-slate-800/30 rounded-2xl p-6 border border-slate-100 dark:border-slate-800">
                            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-center gap-2">
                                💾 ${ui.backpackTitle || 'Save & Backup'}
                            </h3>
                            <p class="text-xs text-slate-500 dark:text-slate-400 mb-6 px-2 leading-relaxed">
                                ${ui.backpackDesc || 'Auto-save is active. Create a backup file to secure your progress.'}
                            </p>
                            
                            <div class="grid grid-cols-2 gap-4">
                                <button id="btn-export-progress" class="py-4 px-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 hover:border-green-300 dark:hover:border-green-600 hover:bg-green-100 dark:hover:bg-green-900/20 text-green-700 dark:text-green-400 font-bold rounded-xl active:scale-95 transition-all flex flex-col items-center gap-2 group shadow-sm">
                                    <span class="text-2xl group-hover:-translate-y-1 transition-transform">💾</span> 
                                    <span class="text-xs uppercase tracking-wide">${ui.backupBtn || 'Save to File'}</span>
                                </button>
                                
                                <button id="btn-show-restore" class="py-4 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-300 font-bold rounded-xl active:scale-95 transition-all flex flex-col items-center gap-2 group shadow-sm">
                                    <span class="text-2xl group-hover:-translate-y-1 transition-transform">📥</span> 
                                    <span class="text-xs uppercase tracking-wide">${ui.restoreBtn || 'Load File'}</span>
                                </button>
                            </div>

                            <!-- Hidden Restore Input -->
                            <div id="restore-area" class="hidden mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                <input type="file" id="file-importer" class="hidden" accept=".json,application/json">
                                <button id="btn-select-file" class="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:border-sky-500 hover:text-sky-500 transition-colors text-xs font-bold bg-white dark:bg-slate-900">
                                    <span>📂</span> ${ui.selectFilePrompt || 'Select file...'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- SEEDS GRID -->
                    <div id="profile-seeds-section" class="text-left flex-1 scroll-mt-4">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="font-bold text-xs uppercase text-slate-400 tracking-widest flex items-center gap-2">
                                🌰 ${ui.gardenTitle || 'Seeds'}
                            </h3>
                            <span class="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">${collectedItems.length}</span>
                        </div>
                        
                        ${collectedItems.length === 0 
                            ? `<div class="p-6 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl text-center text-slate-400 text-xs italic">${ui.gardenEmpty}</div>`
                            : `<div class="grid grid-cols-5 sm:grid-cols-6 gap-2">
                                ${collectedItems.map(s => `
                                    <div class="aspect-square bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center justify-center text-xl shadow-sm border border-slate-100 dark:border-slate-700 hover:scale-110 transition-transform cursor-help" title="${s.id}">
                                        ${s.icon}
                                    </div>
                                `).join('')}
                               </div>`
                        }
                    </div>
                    
                    <div class="mt-8 text-center">
                        <button id="btn-open-privacy" class="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline transition-colors">${ui.syncPrivacyNote}</button>
                    </div>
                </div>`;

        if (embedded) {
            this.innerHTML = `
            <div class="arborito-profile-embed-root flex flex-col flex-1 min-h-0 w-full h-full min-w-0 overflow-hidden bg-white dark:bg-slate-900">
                ${mainScroll}
            </div>`;
        } else {
            const deskShell = mob
                ? `bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[min(92dvh,calc(100dvh-var(--arborito-mob-dock-clearance,4.25rem)-1.5rem))] rounded-2xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto`
                : `arborito-float-modal-card bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto`;
            const bodyWrap = mob
                ? `${mobileChrome}${mainScroll}`
                : `${mobileChrome}<div class="arborito-float-modal-card__inner min-h-0">${mainScroll}</div>`;
            this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in fade-in arborito-modal-root">
            <div class="${deskShell}">
                ${bodyWrap}
            </div>
        </div>`;
        }

        this.bindEvents();
        this.updateView();

        if (focusedId) {
            const el = document.getElementById(focusedId);
            if (el) {
                el.focus({ preventScroll: true });
                if (selectionStart !== null && el.setSelectionRange) {
                    el.setSelectionRange(selectionStart, selectionEnd);
                }
            }
        }
    }
    
    bindEvents() {
        this.querySelectorAll('.btn-close').forEach((b) => {
            b.onclick = () => this.close();
        });

        const btnPrivacy = this.querySelector('#btn-open-privacy');
        if (btnPrivacy) {
            btnPrivacy.onclick = () => {
                const cur = store.value.modal;
                const fromSheet =
                    this.hasAttribute('embed') || !!(cur && typeof cur === 'object' && cur.fromMobileMore);
                store.setModal(fromSheet ? { type: 'privacy', fromMobileMore: true } : 'privacy');
            };
        }

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
                this.render(); 
            };
        });
        
        const inpUsername = this.querySelector('#inp-username');
        if (inpUsername) {
            inpUsername.oninput = (e) => {
                this.state.tempUsername = e.target.value;
            };
        }

        const btnSave = this.querySelector('#btn-save-profile');
        if (btnSave) {
            btnSave.onclick = () => {
                const username = this.state.tempUsername.trim();
                const avatar = this.state.tempAvatar;
                store.updateUserProfile(username, avatar);
            };
        }

        const btnExport = this.querySelector('#btn-export-progress');
        if (btnExport) btnExport.onclick = () => store.downloadProgressFile();

        const btnShowRestore = this.querySelector('#btn-show-restore');
        if (btnShowRestore) {
            btnShowRestore.onclick = () => {
                this.state.showRestoreInput = !this.state.showRestoreInput;
                this.updateView();
            };
        }

        const btnSelectFile = this.querySelector('#btn-select-file');
        const fileInput = this.querySelector('#file-importer');
        if (btnSelectFile && fileInput) {
            btnSelectFile.onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (store.importProgress(event.target.result)) {
                        store.alert(store.ui.importSuccess);
                        this.close();
                    } else {
                        store.alert(store.ui.importError);
                    }
                };
                reader.readAsText(file);
            };
        }
    }
}
customElements.define('arborito-modal-profile', ArboritoModalProfile);
