import { store } from '../../store.js';
import { parseNostrTreeUrl } from '../../services/nostr-refs.js';
import { buildOperatorEscalationMailto } from '../../utils/tree-report-mailto.js';
import { promptTreeLegalReportEvidence } from '../../utils/tree-legal-report-evidence-prompts.js';
import { injectOperatorEmailToken } from '../../config/default-operator-email.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { bindMobileTap } from '../../utils/mobile-tap.js';

function esc(s) {
    return String(s != null ? s : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escAttr(s) {
    return esc(s).replace(/"/g, '&quot;');
}

class ArboritoModalTreeReport extends HTMLElement {
    connectedCallback() {
        this._picked = '';
        // <arborito-modals> host has pointer-events:none; only #modal-backdrop is interactive.
        // Also ArboritoModals focuses/binds the backdrop via this id.
        this.style.display = 'block';
        this.render();
    }

    close() { store.dismissModal(); }

    render() {
        const ui = store.ui;
        const mobile = shouldShowMobileUI();
        const title = ui.treeReportModalTitle || ui.treeReportButton || 'Report this tree';
        const src = store.value.activeSource;
        const net = store.nostr;
        const ref = (src && src.url) ? parseNostrTreeUrl(String(src.url)) : null;
        const isPublicTreeReport = !!ref;

        const topbarCls = mobile
            ? 'arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0'
            : 'arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 flex items-center gap-2';
        const backExtra = 'arborito-mmenu-back shrink-0';
        const backdropCls = mobile
            ? 'fixed inset-0 z-[80] flex flex-col p-0 m-0 bg-slate-950 h-[100dvh] min-h-[100dvh] animate-in fade-in duration-300'
            : 'fixed inset-0 z-[80] flex items-center justify-center bg-slate-950 p-4 animate-in fade-in duration-500 arborito-modal-root';
        const panelCls = mobile
            ? 'bg-white dark:bg-slate-900 w-full flex-1 min-h-0 h-full relative overflow-hidden flex flex-col border-0 shadow-none rounded-none cursor-auto'
            : 'arborito-float-modal-card bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-lg relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto max-h-[90dvh]';

        const canAutoReport = !!(isPublicTreeReport && net && typeof net.putTreeReport === 'function');
        const disclaimerWithEmail = injectOperatorEmailToken(ui.treeReportUrgentToOwnerDisclaimer || '', ui);
        const operatorLeadWithEmail = injectOperatorEmailToken(ui.treeReportOperatorEscalationLead || '', ui);
        const hint = canAutoReport
            ? (ui.treeReportSheetHint || 'Pick a reason. Reports are signed and rate-limited.')
            : (ui.treeReportNeedPublishHint ||
                  'Automatic reports apply to online shared courses. If yours is only on this device, publish it first or use the email section below.');

        const policyTitle = ui.treeReportPolicyTitle || 'How Arborito handles reports';
        const policyBodyRaw = String(ui.treeReportPolicyBody || '').trim();
        const policyInfoShowAria = ui.treeReportPolicyInfoShowAria || 'Show full reporting policy';
        const policyInfoHideAria = ui.treeReportPolicyInfoHideAria || 'Hide reporting policy';
        const policyBlock =
            policyBodyRaw.length > 0
                ? `<div class="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/45 p-3 text-left" role="region" aria-labelledby="tree-report-policy-h">
                        <div class="flex items-start justify-between gap-2">
                            <p id="tree-report-policy-h" class="m-0 flex-1 min-w-0 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 leading-tight">${esc(policyTitle)}</p>
                            <button type="button" id="btn-tree-report-policy-info" class="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-base leading-none text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" aria-expanded="false" aria-controls="tree-report-policy-details" title="${escAttr(policyInfoShowAria)}" aria-label="${escAttr(policyInfoShowAria)}"><span aria-hidden="true">ℹ️</span></button>
                        </div>
                        <div id="tree-report-policy-details" class="hidden mt-2 border-t border-slate-200 dark:border-slate-600 pt-2">
                            <p id="tree-report-policy-body" class="m-0 text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">${esc(policyBodyRaw)}</p>
                        </div>
                    </div>`
                : '';

        this.innerHTML = `
        <div id="modal-backdrop" class="${backdropCls} arborito-modal-root">
            <div class="${panelCls}">
                <div class="${topbarCls}">
                    ${
                        mobile
                            ? `<div class="arborito-mmenu-toolbar">
                                ${modalNavBackHtml(ui, backExtra, { tagClass: 'btn-tree-report-close' })}
                                <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0 truncate">${esc(title)}</h2>
                                <span class="w-10 shrink-0" aria-hidden="true"></span>
                            </div>`
                            : `${modalNavBackHtml(ui, backExtra, { tagClass: 'btn-tree-report-close' })}
                                <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0 truncate">${esc(title)}</h2>
                                ${modalWindowCloseXHtml(ui, 'btn-tree-report-close')}`
                    }
                </div>

                <div class="flex-1 overflow-y-auto custom-scrollbar min-h-0 px-4 py-4">
                    <p class="m-0 text-xs text-slate-700 dark:text-slate-200 leading-snug">${esc(hint)}</p>
                    ${policyBlock}

                    <div class="mt-4 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/25 p-4">
                        <p class="m-0 text-[10px] font-black uppercase tracking-widest text-amber-900 dark:text-amber-100">${esc(ui.treeReportSheetTitle || 'Report')}</p>
                        <div class="mt-3 grid grid-cols-2 gap-2">
                            <button type="button" class="tree-report-reason min-h-11 rounded-xl font-black text-xs bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800" data-reason="spam"${canAutoReport ? '' : ' disabled'}>${esc(ui.treeReportReasonSpam || 'Spam')}</button>
                            <button type="button" class="tree-report-reason min-h-11 rounded-xl font-black text-xs bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800" data-reason="phishing"${canAutoReport ? '' : ' disabled'}>${esc(ui.treeReportReasonPhishing || 'Phishing')}</button>
                            <button type="button" class="tree-report-reason min-h-11 rounded-xl font-black text-xs bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800" data-reason="copyright"${canAutoReport ? '' : ' disabled'}>${esc(ui.treeReportReasonCopyright || 'Copyright')}</button>
                            <button type="button" class="tree-report-reason min-h-11 rounded-xl font-black text-xs bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800" data-reason="other"${canAutoReport ? '' : ' disabled'}>${esc(ui.treeReportReasonOther || 'Other')}</button>
                        </div>
                        <textarea id="tree-report-note" rows="3" class="mt-3 w-full rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 p-3 text-xs text-slate-800 dark:text-slate-100 hidden" placeholder="${escAttr(ui.treeReportOtherPlaceholder || 'Short note (optional)')}"></textarea>
                        <div class="mt-3 flex gap-2">
                            <button type="button" id="tree-report-cancel" class="flex-1 min-h-11 rounded-xl font-black text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">${esc(ui.cancel || 'Cancel')}</button>
                            <button type="button" id="tree-report-send" class="flex-1 min-h-11 rounded-xl font-black text-xs bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40 disabled:pointer-events-none"${this._picked ? '' : ' disabled'}>${esc(ui.treeReportSend || 'Send report')}</button>
                        </div>
                        <p class="m-0 mt-3 text-[10px] text-slate-600 dark:text-slate-400 leading-snug">${esc(
                            ui.treeReportAutoProcessNote || 'This is an automatic report that goes through community review.'
                        )}</p>
                    </div>

                    ${
                        canAutoReport
                            ? `<div class="mt-4 rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/25 p-4">
                        <p class="m-0 text-[10px] font-black uppercase tracking-widest text-sky-900 dark:text-sky-100">${esc(
                            ui.treeReportUrgentToOwnerTitle || 'Urgent message to the tree owner'
                        )}</p>
                        <p class="m-0 mt-2 text-[10px] text-sky-950 dark:text-sky-100/90 leading-snug">${esc(
                            ui.treeReportUrgentToOwnerLead ||
                                'Use this before contacting the app operator. Stored as a signed record for this tree; the publisher sees a notice when they open the tree.'
                        )}</p>
                        <button type="button" id="tree-urgent-owner-toggle" class="mt-2 min-h-11 w-full rounded-xl font-black text-xs bg-sky-700 hover:bg-sky-600 text-white">${esc(
                            ui.treeReportUrgentToOwnerButton || 'Write urgent message to owner'
                        )}</button>
                        <div id="tree-urgent-owner-panel" class="hidden mt-3 space-y-2">
                            <label class="block text-[10px] font-bold uppercase text-sky-900 dark:text-sky-200" for="tree-urgent-owner-msg">${esc(
                                ui.treeReportUrgentToOwnerMessageLabel || 'Message'
                            )}</label>
                            <textarea id="tree-urgent-owner-msg" rows="4" class="w-full rounded-xl border border-sky-200 dark:border-sky-700 bg-white dark:bg-slate-900 p-3 text-xs text-slate-800 dark:text-slate-100" placeholder="${escAttr(
                                ui.treeReportUrgentToOwnerMessagePh || ''
                            )}"></textarea>
                            <label class="block text-[10px] font-bold uppercase text-sky-900 dark:text-sky-200" for="tree-urgent-owner-contact">${esc(
                                ui.treeReportUrgentToOwnerContactLabel || 'Your contact (optional)'
                            )}</label>
                            <input id="tree-urgent-owner-contact" type="text" class="w-full rounded-xl border border-sky-200 dark:border-sky-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-800 dark:text-slate-100" placeholder="${escAttr(
                                ui.treeReportUrgentToOwnerContactPh || ''
                            )}" />
                            <p class="m-0 text-[10px] text-sky-900/90 dark:text-sky-100/85 leading-snug">${esc(
                                disclaimerWithEmail
                            )}</p>
                            <div class="flex gap-2">
                                <button type="button" id="tree-urgent-owner-cancel" class="flex-1 min-h-11 rounded-xl font-black text-xs bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-700">${esc(
                                    ui.cancel || 'Close'
                                )}</button>
                                <button type="button" id="tree-urgent-owner-send" class="flex-1 min-h-11 rounded-xl font-black text-xs bg-sky-900 dark:bg-sky-100 text-white dark:text-slate-900">${esc(
                                    ui.treeReportUrgentToOwnerSubmit || 'Send'
                                )}</button>
                            </div>
                        </div>
                    </div>
                    <div class="mt-3 rounded-2xl border border-slate-300 dark:border-slate-600 bg-slate-50/90 dark:bg-slate-900/50 p-4">
                        <p class="m-0 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">${esc(
                            ui.treeReportOperatorEscalationTitle || 'Very urgent — operator'
                        )}</p>
                        <p class="m-0 mt-2 text-[10px] text-slate-600 dark:text-slate-400 leading-snug">${esc(
                            operatorLeadWithEmail
                        )}</p>
                        <button type="button" id="tree-operator-escalation-toggle" class="mt-2 min-h-11 w-full rounded-xl font-black text-xs bg-slate-800 hover:bg-slate-700 dark:bg-slate-200 dark:hover:bg-white text-white dark:text-slate-900">${esc(
                            ui.treeReportOperatorEscalationButton || 'Advanced form'
                        )}</button>
                        <div id="tree-operator-escalation-panel" class="hidden mt-3 space-y-2">
                            <label class="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400" for="tree-op-esc-subject">${esc(
                                ui.treeReportUrgentSubject || 'Subject'
                            )}</label>
                            <input id="tree-op-esc-subject" type="text" class="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-800 dark:text-slate-100" placeholder="${escAttr(
                                ui.treeReportOperatorEscalationSubjectPh || ''
                            )}" />
                            <label class="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400" for="tree-op-esc-body">${esc(
                                ui.treeReportUrgentBody || 'Details'
                            )}</label>
                            <textarea id="tree-op-esc-body" rows="4" class="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs text-slate-800 dark:text-slate-100" placeholder="${escAttr(
                                ui.treeReportOperatorEscalationBodyPh || ''
                            )}"></textarea>
                            <div class="flex gap-2">
                                <button type="button" id="tree-op-esc-cancel" class="flex-1 min-h-11 rounded-xl font-black text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">${esc(
                                    ui.close || 'Close'
                                )}</button>
                                <button type="button" id="tree-op-esc-build" class="flex-1 min-h-11 rounded-xl font-black text-xs bg-amber-600 hover:bg-amber-500 text-white">${esc(
                                    ui.treeReportUrgentBuildEmail || 'Prepare email'
                                )}</button>
                            </div>
                            <div id="tree-op-esc-mailto-wrap" class="hidden mt-2">
                                <a id="tree-op-esc-mailto" href="#" class="block w-full text-center py-3 rounded-xl font-black text-xs bg-amber-600 hover:bg-amber-500 text-white no-underline">${esc(
                                    ui.treeReportUrgentOpenEmail || 'Open email draft'
                                )}</a>
                                <p class="m-0 mt-2 text-[10px] text-slate-500 dark:text-slate-400 leading-snug">${esc(
                                    ui.treeReportOperatorEscalationMailHint || ''
                                )}</p>
                            </div>
                        </div>
                    </div>`
                            : `<div class="mt-4 rounded-2xl border border-slate-300 dark:border-slate-600 bg-slate-50/90 dark:bg-slate-900/50 p-4">
                        <p class="m-0 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">${esc(
                            ui.treeReportOperatorEscalationTitle || 'Very urgent — operator'
                        )}</p>
                        <p class="m-0 mt-2 text-[10px] text-slate-600 dark:text-slate-400 leading-snug">${esc(
                            operatorLeadWithEmail
                        )}</p>
                        <button type="button" id="tree-operator-escalation-toggle" class="mt-2 min-h-11 w-full rounded-xl font-black text-xs bg-slate-800 hover:bg-slate-700 dark:bg-slate-200 dark:hover:bg-white text-white dark:text-slate-900">${esc(
                            ui.treeReportOperatorEscalationButton || 'Advanced form'
                        )}</button>
                        <div id="tree-operator-escalation-panel" class="hidden mt-3 space-y-2">
                            <label class="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400" for="tree-op-esc-subject">${esc(
                                ui.treeReportUrgentSubject || 'Subject'
                            )}</label>
                            <input id="tree-op-esc-subject" type="text" class="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-800 dark:text-slate-100" placeholder="${escAttr(
                                ui.treeReportOperatorEscalationSubjectPh || ''
                            )}" />
                            <label class="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400" for="tree-op-esc-body">${esc(
                                ui.treeReportUrgentBody || 'Details'
                            )}</label>
                            <textarea id="tree-op-esc-body" rows="4" class="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs text-slate-800 dark:text-slate-100" placeholder="${escAttr(
                                ui.treeReportOperatorEscalationBodyPh || ''
                            )}"></textarea>
                            <div class="flex gap-2">
                                <button type="button" id="tree-op-esc-cancel" class="flex-1 min-h-11 rounded-xl font-black text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">${esc(
                                    ui.close || 'Close'
                                )}</button>
                                <button type="button" id="tree-op-esc-build" class="flex-1 min-h-11 rounded-xl font-black text-xs bg-amber-600 hover:bg-amber-500 text-white">${esc(
                                    ui.treeReportUrgentBuildEmail || 'Prepare email'
                                )}</button>
                            </div>
                            <div id="tree-op-esc-mailto-wrap" class="hidden mt-2">
                                <a id="tree-op-esc-mailto" href="#" class="block w-full text-center py-3 rounded-xl font-black text-xs bg-amber-600 hover:bg-amber-500 text-white no-underline">${esc(
                                    ui.treeReportUrgentOpenEmail || 'Open email draft'
                                )}</a>
                                <p class="m-0 mt-2 text-[10px] text-slate-500 dark:text-slate-400 leading-snug">${esc(
                                    ui.treeReportOperatorEscalationMailHint || ''
                                )}</p>
                            </div>
                        </div>
                    </div>`
                    }

                    <p class="mt-3 text-[10px] text-center text-slate-500 dark:text-slate-400 leading-snug px-1">${esc(ui.treeReportHint || 'Reports help keep the global directory clean. Reports do not remove content from the network.')}</p>
                </div>
            </div>
        </div>`;

        this.querySelectorAll('.btn-tree-report-close').forEach((b) => bindMobileTap(b, () => this.close()));
        const bd = this.querySelector('#modal-backdrop');
        if (bd) bd.addEventListener('click', (e) => { if (e.target === bd) this.close(); });

        const treePolicyInfoBtn = this.querySelector('#btn-tree-report-policy-info');
        const treePolicyDetails = this.querySelector('#tree-report-policy-details');
        if (treePolicyInfoBtn && treePolicyDetails) {
            const showAria = ui.treeReportPolicyInfoShowAria || 'Show full reporting policy';
            const hideAria = ui.treeReportPolicyInfoHideAria || 'Hide reporting policy';
            bindMobileTap(treePolicyInfoBtn, (e) => {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                treePolicyDetails.classList.toggle('hidden');
                const open = !treePolicyDetails.classList.contains('hidden');
                treePolicyInfoBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
                treePolicyInfoBtn.setAttribute('aria-label', open ? hideAria : showAria);
                treePolicyInfoBtn.setAttribute('title', open ? hideAria : showAria);
            });
        }

        const note = this.querySelector('#tree-report-note');
        const send = this.querySelector('#tree-report-send');
        const cancel = this.querySelector('#tree-report-cancel');
        const syncUi = () => {
            if (send) send.disabled = !this._picked;
            if (note) note.classList.toggle('hidden', this._picked !== 'other');
        };

        this.querySelectorAll('.tree-report-reason').forEach((b) => {
            b.onclick = () => {
                if (b.disabled) return;
                this._picked = String(b.getAttribute('data-reason') || '');
                this.querySelectorAll('.tree-report-reason').forEach((x) => x.classList.remove('ring-2', 'ring-amber-500'));
                b.classList.add('ring-2', 'ring-amber-500');
                syncUi();
            };
        });

        if (cancel) cancel.onclick = () => {
            this._picked = '';
            if (note) note.value = '';
            this.querySelectorAll('.tree-report-reason').forEach((x) => x.classList.remove('ring-2', 'ring-amber-500'));
            syncUi();
        };

        if (send) {
            send.onclick = async () => {
                if (!canAutoReport || !this._picked || !ref) return;
                const pair = await (store.ensureNetworkUserPair && store.ensureNetworkUserPair());
                if (!(pair && pair.pub)) {
                    store.notify(store.ui.nostrIdentityUnavailable || 'Online identity unavailable.', true);
                    return;
                }
                const noteTxt = this._picked === 'other' && note ? String(note.value || '').trim() : '';
                store.notify(store.ui.sourcesGlobalPowWorking || 'Verifying…', false);
                if (this._picked === 'copyright' && typeof net.putTreeLegalReport === 'function') {
                    const ui = store.ui;
                    const ev = await promptTreeLegalReportEvidence(store);
                    if (!ev) return;
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
                    await net.putTreeReport({ pair, ownerPub: ref.pub, universeId: ref.universeId, reason: this._picked, note: noteTxt });
                    store.notify(store.ui.sourcesGlobalReportOk || 'Report sent. Thanks.', false);
                }
                this._picked = '';
                if (note) note.value = '';
                this.querySelectorAll('.tree-report-reason').forEach((x) => x.classList.remove('ring-2', 'ring-amber-500'));
                syncUi();
            };
        }

        const ownerToggle = this.querySelector('#tree-urgent-owner-toggle');
        const ownerPanel = this.querySelector('#tree-urgent-owner-panel');
        const ownerCancel = this.querySelector('#tree-urgent-owner-cancel');
        const ownerSend = this.querySelector('#tree-urgent-owner-send');
        const ownerMsg = this.querySelector('#tree-urgent-owner-msg');
        const ownerContact = this.querySelector('#tree-urgent-owner-contact');
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
        if (canAutoReport && ownerSend && ref && net && typeof net.putTreeUrgentUserMessage === 'function') {
            ownerSend.onclick = async () => {
                const msg = ownerMsg ? String(ownerMsg.value || '').trim() : '';
                if (msg.length < 40) {
                    store.notify(store.ui.treeReportUrgentToOwnerTooShort || 'Please write at least 40 characters.', true);
                    return;
                }
                const ok = await store.confirm(
                    store.ui.treeReportUrgentToOwnerConfirmBody ||
                        'This publishes a signed message for the tree owner. It does not email the app operator. Continue?',
                    store.ui.treeReportUrgentToOwnerConfirmTitle || 'Confirm',
                    false
                );
                if (!ok) return;
                const pair = await (store.ensureNetworkUserPair && store.ensureNetworkUserPair());
                if (!(pair && pair.pub)) {
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
                    store.notify(store.ui.sourcesGlobalReportTooSoon || 'Please wait before sending another message.', true);
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
                    store.notify(store.ui.treeReportUrgentSendFailed || 'Could not publish urgent message.', true);
                    return;
                }
                store.notify(store.ui.treeReportUrgentToOwnerSent || 'Sent.', false);
                if (ownerMsg) ownerMsg.value = '';
                if (ownerContact) ownerContact.value = '';
                ownerPanel.classList.add('hidden');
            };
        }

        const opToggle = this.querySelector('#tree-operator-escalation-toggle');
        const opPanel = this.querySelector('#tree-operator-escalation-panel');
        const opCancel = this.querySelector('#tree-op-esc-cancel');
        const opBuild = this.querySelector('#tree-op-esc-build');
        const opMailWrap = this.querySelector('#tree-op-esc-mailto-wrap');
        const opMail = this.querySelector('#tree-op-esc-mailto');
        const opSubj = this.querySelector('#tree-op-esc-subject');
        const opBody = this.querySelector('#tree-op-esc-body');
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
                    if (ev && ev.preventDefault) ev.preventDefault();
                    if (ev && ev.stopPropagation) ev.stopPropagation();
                }
            };
        }

        syncUi();
    }
}

customElements.define('arborito-modal-tree-report', ArboritoModalTreeReport);

