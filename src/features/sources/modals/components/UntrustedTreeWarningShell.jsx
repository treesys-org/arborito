import { parseNostrTreeUrl } from '../../../nostr/api/nostr-refs.js';
import { LocaleRichText } from '../../../../shared/ui/LocaleRichText.jsx';
import { urlSummaryForUser } from '../../../../shared/lib/url-display-summary.js';
import { shouldShowMobileUI } from '../../../../shared/ui/breakpoints.js';
import { DockModalShell } from '../../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../../app/components/ModalHero.jsx';
import { modalCtaConfirmFull } from '../../../../shared/ui/modal-action-chrome.js';

export function UrlBlock({ ui, url }) {
    const { summary, full } = urlSummaryForUser(url || '');
    return (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50/80 dark:bg-slate-900/30">
            <p className="arborito-eyebrow arborito-eyebrow--md px-3 pt-2">{ui.secUrlSummaryLabel || 'Link'}</p>
            <p className="px-3 pb-2 text-sm text-slate-800 dark:text-slate-100 break-words">{summary}</p>
            <details className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/50">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-sky-700 dark:text-sky-300 hover:underline">
                    {ui.secUrlDetailsToggle || 'Show full link'}
                </summary>
                <div className="px-3 pb-3 pt-0 text-xs font-mono break-all text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                    {full || 'N/A'}
                </div>
            </details>
        </div>
    );
}

export function ackNostrPublicTree(url) {
    const treeRef = parseNostrTreeUrl(url);
    if (!treeRef) return;
    try {
        localStorage.setItem(`arborito-nostr-public-ack:${treeRef.pub}:${treeRef.universeId}`, '1');
    } catch {
        /* ignore */
    }
}

function resolveNostrWarningCopy(ui, url, variant) {
    const isPublicNostrTree = !!parseNostrTreeUrl(url || '');
    const isLoad = variant === 'load';

    const title = isPublicNostrTree
        ? ui.nostrPublicWarningTitle ||
          (isLoad ? ui.secLoadWarningTitle : ui.secWarningTitle) ||
          (isLoad ? 'Load tree?' : 'Security Warning')
        : isLoad
          ? ui.secLoadWarningTitle || 'Load Unverified Tree?'
          : ui.secWarningTitle || 'Security Warning';

    const body = isPublicNostrTree
        ? ui.nostrPublicWarningBody
        : isLoad
          ? ui.secLoadWarningBody
          : ui.secWarningBody;

    const check = isPublicNostrTree
        ? ui.nostrPublicWarningCheck
        : isLoad
          ? ui.secWarningCheck
          : ui.secWarningCheck;

    const confirmLabel = isPublicNostrTree
        ? ui.nostrPublicWarningConfirm ||
          (isLoad ? ui.secLoadConfirm : ui.secConfirm) ||
          'I understand'
        : isLoad
          ? ui.secLoadConfirm || 'Yes, load this tree'
          : ui.secConfirm || 'I trust this tree';

    return { title, body, check, confirmLabel };
}

/**
 * Shared security warning for untrusted tree URLs.
 * @param {'load' | 'community-add'} variant
 */
export function UntrustedTreeWarningShell({
    ui,
    url,
    variant,
    onCancel,
    onConfirm,
    backTagClass,
    closeTagClass,
}) {
    const mobile = shouldShowMobileUI();
    const { title, body, check, confirmLabel } = resolveNostrWarningCopy(ui, url, variant);
    const isPublicNostrTree = !!parseNostrTreeUrl(url || '');

    return (
        <DockModalShell
            mobile={mobile}
            sizeTier="STANDARD"
            onBackdropClick={onCancel}
            shellOpts={{
                panelTone: 'danger',
                panelRadius: mobile ? 'none' : '3xl',
                panelClass: mobile ? '' : 'transition-all duration-300',
            }}
            hero={
                <ModalHubHero
                    ui={ui}
                    mobile={mobile}
                    tone="danger"
                    title={title}
                    titleTruncate
                    leadingIcon="⚠️"
                    backTagClass={backTagClass}
                    closeTagClass={closeTagClass}
                    extraWrapClass="pb-3 border-b border-slate-100 dark:border-slate-800"
                    onBack={onCancel}
                    onClose={onCancel}
                />
            }
            footer={
                <div className="arborito-modal-footer arborito-modal-footer--bg-flat">
                    <div className="arborito-action-row">
                        <button type="button" className={modalCtaConfirmFull('red')} onClick={onConfirm}>
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            }
        >
            <LocaleRichText
                as="div"
                className="text-slate-600 dark:text-slate-300 mb-4 leading-relaxed"
                html={body}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{check}</p>
            {!isPublicNostrTree ? <UrlBlock ui={ui} url={url} /> : null}
        </DockModalShell>
    );
}
