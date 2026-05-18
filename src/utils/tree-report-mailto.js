import { parseNostrTreeUrl } from '../services/nostr-refs.js';
import { resolveOperatorEscalationEmail } from '../config/default-operator-email.js';

/**
 * Mailto for **operator escalation** (very urgent; owner path did not suffice).
 * Intentionally separate from `getTreeReportMailtoHref` so it always targets the distributor inbox.
 */
export function buildOperatorEscalationMailto(store, subject, body) {
    const ui = store?.ui || {};
    const to = resolveOperatorEscalationEmail(ui);
    const src = store?.value?.activeSource;
    const treeUrl = src?.url ? String(src.url) : '';
    const shareCode = src?.shareCode ? String(src.shareCode) : '';
    const ref = src?.url ? parseNostrTreeUrl(String(src.url)) : null;
    const contextLines = [
        '--- Arborito operator escalation ---',
        treeUrl ? `nostrTreeUrl: ${treeUrl}` : '',
        shareCode ? `shareCode: ${shareCode}` : '',
        ref?.pub ? `ownerPub: ${ref.pub}` : '',
        ref?.universeId ? `universeId: ${ref.universeId}` : '',
        '-------------------------------------',
        ''
    ].filter(Boolean);
    const composedBody = `${contextLines.join('\n')}${String(body || '')}`;
    return `mailto:${to}?subject=${encodeURIComponent(String(subject || ''))}&body=${encodeURIComponent(composedBody)}`;
}
