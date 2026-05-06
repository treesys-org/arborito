/**
 * Tree introduction modal (first open or “Introduction” button).
 *
 * Same source as the “About this tree” card (`universePresentation`). Saving the card syncs
 * the same Markdown to `raw.readme` and `.arborito` export (`INTRO.md` / `README.md`).
 * If the card is empty, root node description (Markdown) or generic copy is used.
 */
import { store } from '../../store.js';
import { fileSystem } from '../../services/filesystem.js';
import { parseContent } from '../../utils/parser.js';
import { ContentRenderer } from '../../utils/renderer.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { escAttr } from '../../utils/html-escape.js';
import {
    getMediaConsentModalMarkup,
    getPendingExternalMediaDetails,
    isMediaSrcBlocked,
    persistMediaOriginsConsent
} from '../../utils/third-party-media.js';
import { bindMobileTap } from '../../utils/mobile-tap.js';
import { readmeIntroSeenKey } from '../../utils/readme-intro.js';
import { hasAboutCourseCard } from '../../utils/course-intro-markdown.js';
import { safeStripeDonationUrl } from '../../utils/stripe-donation-url.js';
import { parseNostrTreeUrl } from '../../services/nostr-refs.js';
import { buildOperatorEscalationMailto } from '../../utils/tree-report-mailto.js';
import { promptTreeLegalReportEvidence } from '../../utils/tree-legal-report-evidence-prompts.js';
import { injectOperatorEmailToken } from '../../config/default-operator-email.js';

class ArboritoModalReadme extends HTMLElement {
    constructor() {
        super();
        this.sourceId = null;
        this.readmeContent = null;
        this.loading = true;
        this.manualOpen = false;
        this._introQuizStates = {};
        /** User declined media consent for this intro view; placeholders + retry until accepted */
        this._mediaDeclinedReadme = false;
    }

    connectedCallback() {
        const m = store.value.modal;
        this.manualOpen = typeof m === 'object' && !!m.manualOpen;
        this.renderSkeleton();
        this.loadContent();
    }

    /** Footer and loading text live outside #readme-body; refresh when UI strings update. */
    syncReadmeChromeStrings() {
        const ui = store.ui;
        const loadingEl = this.querySelector('#readme-loading-text');
        if (loadingEl) loadingEl.textContent = ui.readmeLoadingIntro || 'Loading introduction…';

        const treeCodeTitle = this.querySelector('#readme-tree-code-title');
        if (treeCodeTitle) treeCodeTitle.textContent = ui.readmeIntroTreeCodeTitle || 'Tree code';
        const treeCodeHint = this.querySelector('#readme-tree-code-hint');
        if (treeCodeHint) treeCodeHint.textContent = ui.readmeIntroTreeCodeHint || '';
        const btnCopyTree = this.querySelector('#btn-readme-copy-tree-code');
        if (btnCopyTree) btnCopyTree.textContent = ui.readmeIntroTreeCopy || 'Copy';
        const polT = this.querySelector('#readme-report-policy-title');
        if (polT) polT.textContent = ui.treeReportPolicyTitle || '';
        const polB = this.querySelector('#readme-report-policy-body');
        if (polB) polB.textContent = String(ui.treeReportPolicyBody || '').trim();
        const policyDetailsSync = this.querySelector('#readme-report-policy-details');
        const policyInfoBtnSync = this.querySelector('#btn-readme-report-policy-info');
        if (policyInfoBtnSync && policyDetailsSync) {
            const open = !policyDetailsSync.classList.contains('hidden');
            const showAria = ui.treeReportPolicyInfoShowAria || 'Show full reporting policy';
            const hideAria = ui.treeReportPolicyInfoHideAria || 'Hide reporting policy';
            policyInfoBtnSync.setAttribute('aria-expanded', open ? 'true' : 'false');
            policyInfoBtnSync.setAttribute('aria-label', open ? hideAria : showAria);
            policyInfoBtnSync.setAttribute('title', open ? hideAria : showAria);
        }
        const sheetHint = this.querySelector('#readme-report-sheet-hint');
        if (sheetHint) sheetHint.textContent = ui.treeReportSheetHint || '';
        const footHint = this.querySelector('#readme-report-hint');
        if (footHint) footHint.textContent = ui.treeReportHint || '';
        const btnDontShow = this.querySelector('#btn-readme-dont-show');
        if (btnDontShow) {
            btnDontShow.textContent = ui.readmeDontShowAgain || "Don't show again";
        }
    }

    close(skipFuture = false) {
        const as = store.value.activeSource;
        if (as?.id) {
            try {
                localStorage.setItem(readmeIntroSeenKey(as.id), 'true');
            } catch {
                /* ignore */
            }
        }
        if (skipFuture && this.sourceId) {
            localStorage.setItem(`arborito-skip-readme-${this.sourceId}`, 'true');
        }
        store.dismissModal();
    }

    /** Share code (if published) or `nostr://…` URL for this tree — for copy/paste in Trees → Add. */
    getTreeCodeCopyText() {
        const as = store.value.activeSource;
        const raw = store.value.rawGraphData;
        const meta = raw?.meta && typeof raw.meta === 'object' ? raw.meta : {};
        const sc = String((as && as.shareCode) || meta.shareCode || '').trim();
        if (sc) return sc;
        const u = as?.url && String(as.url).trim();
        if (u && parseNostrTreeUrl(u)) return u;
        return '';
    }

    loadContent() {
        const rootNode = store.value.data;
        const activeSource = store.value.activeSource;
        const rawData = store.value.rawGraphData;
        
        if (!activeSource || !rootNode) return;

        // Base ID for preferences (strip version)
        this.sourceId = activeSource.id.split('-')[0];

        if (hasAboutCourseCard(rawData)) {
            this.readmeContent = '';
        } else {
            this.readmeContent =
                rootNode.description || store.ui.readmeFallbackWelcome || 'Welcome to Arborito.';
        }
        this.loading = false;
        this.renderContent();
    }

    renderSkeleton() {
        const rootNode = store.value.data;
        const activeSource = store.value.activeSource;
        
        if (!activeSource || !rootNode) {
            this.close();
            return;
        }

        const title = activeSource.name;
        const icon = rootNode.icon || "🌳";
        const treeCopyText = this.getTreeCodeCopyText();
        this._treeCopyText = treeCopyText;
        const mobile = shouldShowMobileUI();
        const ui = store.ui;
        const loadIntro = ui.readmeLoadingIntro || 'Loading introduction…';
        const skipLbl = ui.readmeDontShowAgain || "Don't show again";
        const treeCodeTitle = ui.readmeIntroTreeCodeTitle || 'Tree code';
        const treeCodeHint = ui.readmeIntroTreeCodeHint || '';
        const treeCopyBtnLbl = ui.readmeIntroTreeCopy || 'Copy';
        const reportLbl = ui.treeReportButton || 'Report this tree';
        const showReportFooter = !store.value.constructionMode && !fileSystem.isLocal;
        const escPlain = (s) =>
            String(s ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        const readmeDisclaimerWithEmail = injectOperatorEmailToken(ui.treeReportUrgentToOwnerDisclaimer || '', ui);
        const readmeOperatorLeadWithEmail = injectOperatorEmailToken(ui.treeReportOperatorEscalationLead || '', ui);

        const reportPolicyBodyRaw = String(ui.treeReportPolicyBody || '').trim();
        const reportPolicyTitle = ui.treeReportPolicyTitle || 'How Arborito handles reports';
        const policyInfoShowAria = ui.treeReportPolicyInfoShowAria || 'Show full reporting policy';
        const policyInfoHideAria = ui.treeReportPolicyInfoHideAria || 'Hide reporting policy';
        const reportPolicyHtml =
            showReportFooter && reportPolicyBodyRaw
                ? `<div class="${treeCopyText ? 'mt-3' : ''} rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/45 p-3 text-left">
                        <div class="flex items-start justify-between gap-2">
                            <p id="readme-report-policy-title" class="m-0 flex-1 min-w-0 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 leading-tight">${escPlain(reportPolicyTitle)}</p>
                            <button type="button" id="btn-readme-report-policy-info" class="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-base leading-none text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" aria-expanded="false" aria-controls="readme-report-policy-details" title="${escAttr(policyInfoShowAria)}" aria-label="${escAttr(policyInfoShowAria)}"><span aria-hidden="true">ℹ️</span></button>
                        </div>
                        <div id="readme-report-policy-details" class="hidden mt-2 border-t border-slate-200 dark:border-slate-600 pt-2">
                            <p id="readme-report-policy-body" class="m-0 text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">${escPlain(reportPolicyBodyRaw)}</p>
                        </div>
                    </div>`
                : '';

        const topbarCls = mobile
            ? 'readme-intro-topbar arborito-float-modal-head flex px-2 pt-1 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 items-center gap-2'
            : 'readme-intro-topbar arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 flex items-center gap-2';
        const backExtra = mobile
            ? 'arborito-mmenu-back arborito-about-inline-back shrink-0 self-center border-r border-slate-100 dark:border-slate-800 pr-2 mr-1 -ml-1'
            : 'arborito-mmenu-back shrink-0';
        const backdropCls = mobile
            ? 'arborito-readme-intro-full fixed inset-0 z-[80] flex flex-col p-0 m-0 bg-slate-950 h-[100dvh] min-h-[100dvh] animate-in fade-in duration-500'
            : 'fixed inset-0 z-[80] flex items-center justify-center bg-slate-950 p-4 animate-in fade-in duration-500 arborito-modal-root';
        const panelCls = mobile
            ? 'readme-panel readme-panel--mobile bg-white dark:bg-slate-900 w-full flex-1 min-h-0 h-full relative overflow-hidden flex flex-col border-0 shadow-none rounded-none cursor-auto'
            : 'readme-panel arborito-float-modal-card arborito-float-modal-card--readme bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300';
        const panelStyle = mobile ? '' : '';

        this.innerHTML = `
        <div id="readme-backdrop" class="${backdropCls}">
            <div class="${panelCls}" style="${panelStyle}">
                <div class="${topbarCls}">
                    ${modalNavBackHtml(ui, backExtra, { tagClass: 'btn-readme-back' })}
                    <span class="text-2xl shrink-0 leading-none" aria-hidden="true">${icon}</span>
                    <h2 id="readme-intro-title" class="${mobile ? 'flex-1 min-w-0 m-0 text-lg font-black tracking-tight text-slate-800 dark:text-white truncate' : 'arborito-mmenu-subtitle m-0 flex-1 min-w-0 truncate'}">${title}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-readme-back')}
                </div>

                <div id="readme-body" class="${mobile ? 'px-5 py-4' : 'px-8 pb-8 pt-2'} flex-1 overflow-y-auto custom-scrollbar min-h-0">
                    <div class="flex flex-col items-center justify-center min-h-[8rem] space-y-4 py-8">
                        <div class="w-8 h-8 border-4 border-slate-200 dark:border-slate-600 border-t-blue-500 rounded-full animate-spin"></div>
                        <p id="readme-loading-text" class="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">${loadIntro}</p>
                    </div>
                </div>

                <div class="${mobile ? 'p-4' : 'px-8 py-6'} border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-900/80" style="padding-bottom: max(${mobile ? '1rem' : '1.5rem'}, env(safe-area-inset-bottom, 0px));">
                    ${
                        treeCopyText
                            ? `<div id="readme-tree-code-wrap" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/80 p-3 text-left">
                        <p id="readme-tree-code-title" class="m-0 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">${escPlain(treeCodeTitle)}</p>
                        <p id="readme-tree-code-value" class="mt-2 m-0 font-mono text-xs font-bold text-slate-800 dark:text-slate-100 break-all select-text">${escPlain(treeCopyText)}</p>
                        <p id="readme-tree-code-hint" class="mt-1.5 m-0 text-[10px] text-slate-500 dark:text-slate-400 leading-snug">${escPlain(treeCodeHint)}</p>
                        <button type="button" id="btn-readme-copy-tree-code" class="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">${escPlain(treeCopyBtnLbl)}</button>
                    </div>`
                            : ''
                    }

                    ${
                        showReportFooter
                            ? `${reportPolicyHtml}<button type="button" id="readme-report-tree" class="mt-3 w-full py-3 bg-amber-100 dark:bg-amber-950/50 text-amber-950 dark:text-amber-100 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-amber-200/90 dark:hover:bg-amber-900/40 transition-colors border border-amber-300/80 dark:border-amber-700/60">${reportLbl}</button>
                    <div id="readme-report-sheet" class="hidden mt-3 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/25 p-4">
                        <p class="m-0 text-[10px] font-black uppercase tracking-widest text-amber-900 dark:text-amber-100">${escPlain(ui.treeReportSheetTitle || 'Report')}</p>
                        <p id="readme-report-sheet-hint" class="m-0 mt-2 text-xs text-slate-700 dark:text-slate-200 leading-snug">${escPlain(ui.treeReportSheetHint || 'Pick a reason. Reports are signed and rate-limited.')}</p>
                        <div class="mt-3 grid grid-cols-2 gap-2">
                            <button type="button" class="readme-report-reason min-h-11 rounded-xl font-black text-xs bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800" data-reason="spam">${escPlain(ui.treeReportReasonSpam || 'Spam')}</button>
                            <button type="button" class="readme-report-reason min-h-11 rounded-xl font-black text-xs bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800" data-reason="phishing">${escPlain(ui.treeReportReasonPhishing || 'Phishing')}</button>
                            <button type="button" class="readme-report-reason min-h-11 rounded-xl font-black text-xs bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800" data-reason="copyright">${escPlain(ui.treeReportReasonCopyright || 'Copyright')}</button>
                            <button type="button" class="readme-report-reason min-h-11 rounded-xl font-black text-xs bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800" data-reason="other">${escPlain(ui.treeReportReasonOther || 'Other')}</button>
                        </div>
                        <textarea id="readme-report-note" rows="3" class="mt-3 w-full rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 p-3 text-xs text-slate-800 dark:text-slate-100 hidden" placeholder="${escAttr(ui.treeReportOtherPlaceholder || 'Short note (optional)')}"></textarea>
                        <div class="mt-3 flex gap-2">
                            <button type="button" id="readme-report-cancel" class="flex-1 min-h-11 rounded-xl font-black text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">${escPlain(ui.cancel || 'Cancel')}</button>
                            <button type="button" id="readme-report-send" class="flex-1 min-h-11 rounded-xl font-black text-xs bg-amber-600 hover:bg-amber-500 text-white" disabled>${escPlain(ui.treeReportSend || 'Send report')}</button>
                        </div>
                        <p class="m-0 mt-3 text-[10px] text-slate-600 dark:text-slate-400 leading-snug">${escPlain(
                            ui.treeReportAutoProcessNote || 'This is an automatic report that goes through community review.'
                        )}</p>
                    <div class="mt-3 rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/25 p-4">
                        <p class="m-0 text-[10px] font-black uppercase tracking-widest text-sky-900 dark:text-sky-100">${escPlain(
                            ui.treeReportUrgentToOwnerTitle || 'Urgent message to the tree owner'
                        )}</p>
                        <p class="m-0 mt-2 text-[10px] text-sky-950 dark:text-sky-100/90 leading-snug">${escPlain(
                            ui.treeReportUrgentToOwnerLead || ''
                        )}</p>
                        <button type="button" id="readme-urgent-owner-toggle" class="mt-2 min-h-11 w-full rounded-xl font-black text-xs bg-sky-700 hover:bg-sky-600 text-white">${escPlain(
                            ui.treeReportUrgentToOwnerButton || 'Write urgent message to owner'
                        )}</button>
                        <div id="readme-urgent-owner-panel" class="hidden mt-3 space-y-2">
                            <label class="block text-[10px] font-bold uppercase text-sky-900 dark:text-sky-200" for="readme-urgent-owner-msg">${escPlain(
                                ui.treeReportUrgentToOwnerMessageLabel || 'Message'
                            )}</label>
                            <textarea id="readme-urgent-owner-msg" rows="4" class="w-full rounded-xl border border-sky-200 dark:border-sky-700 bg-white dark:bg-slate-900 p-3 text-xs text-slate-800 dark:text-slate-100" placeholder="${escAttr(
                                ui.treeReportUrgentToOwnerMessagePh || ''
                            )}"></textarea>
                            <label class="block text-[10px] font-bold uppercase text-sky-900 dark:text-sky-200" for="readme-urgent-owner-contact">${escPlain(
                                ui.treeReportUrgentToOwnerContactLabel || ''
                            )}</label>
                            <input id="readme-urgent-owner-contact" type="text" class="w-full rounded-xl border border-sky-200 dark:border-sky-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-800 dark:text-slate-100" placeholder="${escAttr(
                                ui.treeReportUrgentToOwnerContactPh || ''
                            )}" />
                            <p class="m-0 text-[10px] text-sky-900/90 dark:text-sky-100/85 leading-snug">${escPlain(readmeDisclaimerWithEmail)}</p>
                            <div class="flex gap-2">
                                <button type="button" id="readme-urgent-owner-cancel" class="flex-1 min-h-11 rounded-xl font-black text-xs bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-700">${escPlain(
                                    ui.cancel || 'Close'
                                )}</button>
                                <button type="button" id="readme-urgent-owner-send" class="flex-1 min-h-11 rounded-xl font-black text-xs bg-sky-900 dark:bg-sky-100 text-white dark:text-slate-900">${escPlain(
                                    ui.treeReportUrgentToOwnerSubmit || 'Send'
                                )}</button>
                            </div>
                        </div>
                    </div>
                    <div class="mt-3 rounded-2xl border border-slate-300 dark:border-slate-600 bg-slate-50/90 dark:bg-slate-900/50 p-4">
                        <p class="m-0 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">${escPlain(
                            ui.treeReportOperatorEscalationTitle || 'Very urgent — operator'
                        )}</p>
                        <p class="m-0 mt-2 text-[10px] text-slate-600 dark:text-slate-400 leading-snug">${escPlain(readmeOperatorLeadWithEmail)}</p>
                        <button type="button" id="readme-operator-escalation-toggle" class="mt-2 min-h-11 w-full rounded-xl font-black text-xs bg-slate-800 hover:bg-slate-700 dark:bg-slate-200 dark:hover:bg-white text-white dark:text-slate-900">${escPlain(
                            ui.treeReportOperatorEscalationButton || 'Advanced form'
                        )}</button>
                        <div id="readme-operator-escalation-panel" class="hidden mt-3 space-y-2">
                            <label class="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400" for="readme-op-esc-subject">${escPlain(
                                ui.treeReportUrgentSubject || 'Subject'
                            )}</label>
                            <input id="readme-op-esc-subject" type="text" class="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-800 dark:text-slate-100" placeholder="${escAttr(
                                ui.treeReportOperatorEscalationSubjectPh || ''
                            )}" />
                            <label class="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400" for="readme-op-esc-body">${escPlain(
                                ui.treeReportUrgentBody || 'Details'
                            )}</label>
                            <textarea id="readme-op-esc-body" rows="4" class="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs text-slate-800 dark:text-slate-100" placeholder="${escAttr(
                                ui.treeReportOperatorEscalationBodyPh || ''
                            )}"></textarea>
                            <div class="flex gap-2">
                                <button type="button" id="readme-op-esc-cancel" class="flex-1 min-h-11 rounded-xl font-black text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">${escPlain(
                                    ui.close || 'Close'
                                )}</button>
                                <button type="button" id="readme-op-esc-build" class="flex-1 min-h-11 rounded-xl font-black text-xs bg-amber-600 hover:bg-amber-500 text-white">${escPlain(
                                    ui.treeReportUrgentBuildEmail || 'Prepare email'
                                )}</button>
                            </div>
                            <div id="readme-op-esc-mailto-wrap" class="hidden mt-2">
                                <a id="readme-op-esc-mailto" href="#" class="block w-full text-center py-3 rounded-xl font-black text-xs bg-amber-600 hover:bg-amber-500 text-white no-underline">${escPlain(
                                    ui.treeReportUrgentOpenEmail || 'Open email draft'
                                )}</a>
                                <p class="m-0 mt-2 text-[10px] text-slate-500 dark:text-slate-400 leading-snug">${escPlain(ui.treeReportOperatorEscalationMailHint || '')}</p>
                            </div>
                        </div>
                    </div>
                    </div>
                    <p id="readme-report-hint" class="mt-2 text-[10px] text-center text-slate-500 dark:text-slate-400 leading-snug px-1">${escPlain(ui.treeReportHint || '')}</p>`
                            : ''
                    }

                    ${this.manualOpen ? '' : `
                    <button type="button" id="btn-readme-dont-show" class="mt-4 w-full py-3 rounded-xl text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors min-h-[44px]">
                        ${skipLbl}
                    </button>
                    `}
                </div>
            </div>
        </div>`;

        this.querySelectorAll('.btn-readme-back').forEach(b => b.onclick = () => this.close(false));
        
        this.querySelector('#readme-backdrop').onclick = (e) => {
            if (e.target === e.currentTarget) this.close(false);
        };
        
        const copyTreeBtn = this.querySelector('#btn-readme-copy-tree-code');
        if (copyTreeBtn) {
            bindMobileTap(copyTreeBtn, async () => {
                const t = String(this._treeCopyText || '').trim();
                if (!t) return;
                try {
                    await navigator.clipboard.writeText(t);
                    store.notify(store.ui.readmeIntroTreeCopied || 'Copied to clipboard.', false);
                } catch {
                    store.notify(store.ui.readmeIntroTreeCopyFail || 'Could not copy.', true);
                }
            });
        }
        const policyInfoBtn = this.querySelector('#btn-readme-report-policy-info');
        const policyDetailsEl = this.querySelector('#readme-report-policy-details');
        if (policyInfoBtn && policyDetailsEl) {
            const showAria = store.ui.treeReportPolicyInfoShowAria || 'Show full reporting policy';
            const hideAria = store.ui.treeReportPolicyInfoHideAria || 'Hide reporting policy';
            bindMobileTap(policyInfoBtn, (e) => {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                policyDetailsEl.classList.toggle('hidden');
                const open = !policyDetailsEl.classList.contains('hidden');
                policyInfoBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
                policyInfoBtn.setAttribute('aria-label', open ? hideAria : showAria);
                policyInfoBtn.setAttribute('title', open ? hideAria : showAria);
            });
        }
        const reportBtn = this.querySelector('#readme-report-tree');
        if (reportBtn) {
            reportBtn.onclick = async (ev) => {
                if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
                if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                const src = store.value.activeSource;
                const net = store.nostr;
                if (!src?.url || !net) return;
                const ref = parseNostrTreeUrl(String(src.url));
                if (!ref) return;
                const sheet = this.querySelector('#readme-report-sheet');
                if (sheet) sheet.classList.toggle('hidden');
            };
        }

        const sheet = this.querySelector('#readme-report-sheet');
        if (sheet) {
            let picked = '';
            const note = this.querySelector('#readme-report-note');
            const send = this.querySelector('#readme-report-send');
            const cancel = this.querySelector('#readme-report-cancel');
            const ownerToggle = sheet.querySelector('#readme-urgent-owner-toggle');
            const ownerPanel = sheet.querySelector('#readme-urgent-owner-panel');
            const ownerCancel = sheet.querySelector('#readme-urgent-owner-cancel');
            const ownerSend = sheet.querySelector('#readme-urgent-owner-send');
            const ownerMsg = sheet.querySelector('#readme-urgent-owner-msg');
            const ownerContact = sheet.querySelector('#readme-urgent-owner-contact');
            const opToggle = sheet.querySelector('#readme-operator-escalation-toggle');
            const opPanel = sheet.querySelector('#readme-operator-escalation-panel');
            const opCancel = sheet.querySelector('#readme-op-esc-cancel');
            const opBuild = sheet.querySelector('#readme-op-esc-build');
            const opMailWrap = sheet.querySelector('#readme-op-esc-mailto-wrap');
            const opMail = sheet.querySelector('#readme-op-esc-mailto');
            const opSubj = sheet.querySelector('#readme-op-esc-subject');
            const opBody = sheet.querySelector('#readme-op-esc-body');
            const syncUi = () => {
                if (send) send.disabled = !picked;
                if (note) note.classList.toggle('hidden', picked !== 'other');
            };
            sheet.querySelectorAll('.readme-report-reason').forEach((b) => {
                b.onclick = () => {
                    picked = String(b.getAttribute('data-reason') || '');
                    sheet.querySelectorAll('.readme-report-reason').forEach((x) => x.classList.remove('ring-2', 'ring-amber-500'));
                    b.classList.add('ring-2', 'ring-amber-500');
                    syncUi();
                };
            });
            if (cancel) cancel.onclick = () => {
                picked = '';
                if (note) note.value = '';
                sheet.classList.add('hidden');
            };
            if (send) {
                send.onclick = async () => {
                    if (!picked) return;
                    const src = store.value.activeSource;
                    const net = store.nostr;
                    if (!src?.url || !net) return;
                    const ref = parseNostrTreeUrl(String(src.url));
                    if (!ref) return;
                    const pair = await store.ensureNetworkUserPair?.();
                    if (!pair?.pub) {
                        store.notify(store.ui.nostrIdentityUnavailable || 'Online identity unavailable.', true);
                        return;
                    }
                    const noteTxt = picked === 'other' && note ? String(note.value || '').trim() : '';
                    const ui = store.ui;
                    store.notify(ui.sourcesGlobalPowWorking || 'Verifying…', false);
                    if (picked === 'copyright' && typeof net.putTreeLegalReport === 'function') {
                        const ev = await promptTreeLegalReportEvidence(store);
                        if (!ev) return;
                        store.notify(ui.sourcesGlobalPowWorking || 'Verifying…', false);
                        await net.putTreeLegalReport({
                            pair,
                            ownerPub: ref.pub,
                            universeId: ref.universeId,
                            entityName: '',
                            euAddress: '',
                            vatId: '',
                            whereInTree: ev.whereInTree,
                            whatWork: ev.whatWork,
                            description: ev.description,
                            declaration: true,
                            links: ev.links
                        });
                        store.notify(ui.legalReportSent || 'Legal report sent.', false);
                    } else {
                        await net.putTreeReport({ pair, ownerPub: ref.pub, universeId: ref.universeId, reason: picked, note: noteTxt });
                        store.notify(ui.sourcesGlobalReportOk || 'Report sent. Thanks.', false);
                    }
                    picked = '';
                    if (note) note.value = '';
                    sheet.querySelectorAll('.readme-report-reason').forEach((x) => x.classList.remove('ring-2', 'ring-amber-500'));
                    syncUi();
                    sheet.classList.add('hidden');
                };
            }
            if (ownerToggle && ownerPanel) {
                ownerToggle.onclick = () => ownerPanel.classList.toggle('hidden');
            }
            if (ownerCancel && ownerPanel) {
                ownerCancel.onclick = () => {
                    ownerPanel.classList.add('hidden');
                    if (ownerMsg) ownerMsg.value = '';
                    if (ownerContact) ownerContact.value = '';
                };
            }
            if (ownerSend) {
                ownerSend.onclick = async () => {
                    const src = store.value.activeSource;
                    const net = store.nostr;
                    if (!src?.url || !net || typeof net.putTreeUrgentUserMessage !== 'function') return;
                    const ref = parseNostrTreeUrl(String(src.url));
                    if (!ref) return;
                    const msg = ownerMsg ? String(ownerMsg.value || '').trim() : '';
                    if (msg.length < 40) {
                        store.notify(store.ui.treeReportUrgentToOwnerTooShort || 'Please write at least 40 characters.', true);
                        return;
                    }
                    const ok = await store.confirm(
                        store.ui.treeReportUrgentToOwnerConfirmBody || '',
                        store.ui.treeReportUrgentToOwnerConfirmTitle || 'Confirm',
                        false
                    );
                    if (!ok) return;
                    const pair = await store.ensureNetworkUserPair?.();
                    if (!pair?.pub) {
                        store.notify(store.ui.nostrIdentityUnavailable || 'Online identity unavailable.', true);
                        return;
                    }
                    let cdOk = true;
                    try {
                        const k = `arborito-tree-urgent-msg-cd:${ref.pub}/${ref.universeId}:${pair.pub}`;
                        const last = Number(localStorage.getItem(k) || 0);
                        if (last && Date.now() - last < 20 * 60 * 60 * 1000) cdOk = false;
                        else localStorage.setItem(k, String(Date.now()));
                    } catch {
                        /* ignore */
                    }
                    if (!cdOk) {
                        store.notify(store.ui.sourcesGlobalReportTooSoon || 'Please wait.', true);
                        return;
                    }
                    store.notify(store.ui.sourcesGlobalPowWorking || 'Verifying…', false);
                    const contactLine = ownerContact ? String(ownerContact.value || '').trim() : '';
                    const rec = await net.putTreeUrgentUserMessage({
                        pair,
                        ownerPub: ref.pub,
                        universeId: ref.universeId,
                        message: msg,
                        contactLine
                    });
                    if (!rec) {
                        store.notify(store.ui.treeReportUrgentSendFailed || 'Could not send.', true);
                        return;
                    }
                    store.notify(store.ui.treeReportUrgentToOwnerSent || 'Sent.', false);
                    if (ownerMsg) ownerMsg.value = '';
                    if (ownerContact) ownerContact.value = '';
                    ownerPanel.classList.add('hidden');
                };
            }
            if (opToggle && opPanel) opToggle.onclick = () => opPanel.classList.toggle('hidden');
            if (opCancel && opPanel) {
                opCancel.onclick = () => {
                    opPanel.classList.add('hidden');
                    if (opSubj) opSubj.value = '';
                    if (opBody) opBody.value = '';
                    if (opMailWrap) opMailWrap.classList.add('hidden');
                };
            }
            if (opBuild && opMail && opMailWrap) {
                opBuild.onclick = () => {
                    const subj = opSubj ? String(opSubj.value || '').trim() : '';
                    const body = opBody ? String(opBody.value || '').trim() : '';
                    if (!subj || !body) {
                        store.notify(store.ui.treeReportUrgentNeedFields || 'Fill subject and details first.', true);
                        return;
                    }
                    opMail.href = buildOperatorEscalationMailto(store, subj, body);
                    opMailWrap.classList.remove('hidden');
                };
            }
            if (opMail) {
                opMail.onclick = (ev) => {
                    const href = String(opMail.getAttribute('href') || '');
                    if (!href || href === '#') {
                        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
                        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                    }
                };
            }
            syncUi();
        }

        const btnDontShow = this.querySelector('#btn-readme-dont-show');
        if (btnDontShow) bindMobileTap(btnDontShow, () => this.close(true));
    }

    renderContent() {
        const bodyEl = this.querySelector('#readme-body');
        if (!bodyEl) return;

        const ui = store.ui;
        const getQuizState = (id) =>
            this._introQuizStates[id] || {
                started: false,
                finished: false,
                currentIdx: 0,
                score: 0,
                results: []
            };
        const blocks = parseContent(this.readmeContent || '');
        const pendingMediaDetails = getPendingExternalMediaDetails(blocks);
        const showMediaConsentModal = pendingMediaDetails.length > 0 && !this._mediaDeclinedReadme;

        const rawGraph = store.value.rawGraphData;
        const pres =
            rawGraph?.universePresentation && typeof rawGraph.universePresentation === 'object'
                ? rawGraph.universePresentation
                : {};
        const escPlain = (s) =>
            String(s ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        const descP = String(pres.description || '').trim();
        const authorN = String(pres.authorName || '').trim();
        const authorA = String(pres.authorAbout || '').trim();
        const donationHref = safeStripeDonationUrl(pres.donationUrl);
        const donateCta = ui.treeDonateCta || 'Support the author';
        const presTitle = ui.treePresentationTitle || 'About this tree';
        const presHtml =
            descP || authorN || authorA || donationHref
                ? `<div class="mb-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-left">
                    <p class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">${escPlain(presTitle)}</p>
                    ${
                        descP
                            ? `<p class="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">${escPlain(descP).replace(/\n/g, '<br>')}</p>`
                            : ''
                    }
                    ${
                        authorN || authorA
                            ? `<div class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                        ${authorN ? `<p class="font-bold text-slate-900 dark:text-white">${escPlain(authorN)}</p>` : ''}
                        ${
                            authorA
                                ? `<p class="text-xs text-slate-600 dark:text-slate-400 mt-1">${escPlain(authorA).replace(/\n/g, '<br>')}</p>`
                                : ''
                        }
                    </div>`
                            : ''
                    }
                    ${
                        donationHref
                            ? `<div class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                        <a href="${escPlain(donationHref)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md">${escPlain(donateCta)}</a>
                    </div>`
                            : ''
                    }
                  </div>`
                : '';

        const htmlContent = blocks
            .map((b) =>
                ContentRenderer.renderBlock(b, ui, {
                    getQuizState,
                    isCompleted: () => false,
                    isExam: false,
                    isMediaSrcBlocked
                })
            )
            .join('');

        bodyEl.innerHTML = `
            <div class="readme-markdown prose prose-slate dark:prose-invert mx-auto w-full max-w-3xl text-left select-text">
                ${presHtml}
                ${htmlContent}
            </div>
        `;

        const backdrop = this.querySelector('#readme-backdrop');
        backdrop?.querySelector('#arborito-media-consent-root')?.remove();
        if (showMediaConsentModal && backdrop) {
            backdrop.insertAdjacentHTML('beforeend', getMediaConsentModalMarkup(ui, pendingMediaDetails));
            const btnAccept = this.querySelector('#btn-media-consent-accept');
            const btnDecline = this.querySelector('#btn-media-consent-decline');
            if (btnAccept) {
                btnAccept.onclick = () => {
                    const rootEl = this.querySelector('#arborito-media-consent-root');
                    let origins = [];
                    const raw = rootEl?.dataset?.pendingOrigins;
                    if (raw) {
                        try {
                            origins = JSON.parse(decodeURIComponent(raw));
                        } catch {
                            origins = [];
                        }
                    }
                    persistMediaOriginsConsent(origins, true);
                    this.renderContent();
                };
            }
            if (btnDecline) {
                btnDecline.onclick = () => {
                    this._mediaDeclinedReadme = true;
                    this.renderContent();
                };
            }
        }

        bodyEl.querySelectorAll('.arborito-media-consent-retry').forEach((btn) => {
            btn.onclick = () => {
                this._mediaDeclinedReadme = false;
                this.renderContent();
            };
        });

        this.syncReadmeChromeStrings();
    }
}

customElements.define('arborito-modal-readme', ArboritoModalReadme);
