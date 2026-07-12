/** Consolidated modal footer CTAs, same tokens as DialogModal / MediaConsentModal. */

export const MODAL_CTA_CANCEL =
    'btn-cancel arborito-cta-slate py-3 min-h-[44px] rounded-xl font-bold text-xs uppercase tracking-wider';

export const MODAL_CTA_CONFIRM_BASE =
    'btn-confirm py-3 min-h-[44px] font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-xs uppercase tracking-wider';

export const MODAL_CTA_CONFIRM_FULL = `${MODAL_CTA_CONFIRM_BASE} w-full`;

export function modalCtaConfirm(tone = 'emerald') {
    const map = {
        emerald: 'arborito-cta-emerald',
        purple: 'arborito-cta-purple',
        sky: 'arborito-cta-sky',
        amber: 'arborito-cta-amber',
        rose: 'arborito-cta-rose',
        red: 'arborito-cta-red',
        slate: 'arborito-cta-slate',
    };
    return `${MODAL_CTA_CONFIRM_BASE} ${map[tone] || map.emerald}`;
}

export function modalCtaConfirmFull(tone = 'emerald') {
    return `${modalCtaConfirm(tone)} w-full`;
}
