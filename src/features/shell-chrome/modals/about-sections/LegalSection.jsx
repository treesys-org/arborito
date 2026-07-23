import { Fragment } from 'react';
import { ObfuscatedEmail } from '../../../../app/components/ObfuscatedEmail.jsx';
import {
    resolveAnyOperatorEmailForDisplay,
    resolveOperatorAddressForDisplay,
    resolveOperatorNameForDisplay,
    resolveOperatorPhoneForDisplay,
} from '../../../../shared/lib/default-operator-email.js';
import { LocaleRichText } from '../../../../shared/ui/LocaleRichText.jsx';
import { AttributionsSection } from './AttributionsSection.jsx';

function ImpressumDetailsPre({ text, ui }) {
    // Do not use ui.operatorName/etc. raw: ShellStore.ui Proxy humanizes missing
    // keys into "operator Name" and would clobber the built-in Impressum data.
    const processed = String(text || '')
        .replace(/\{operatorName\}/g, resolveOperatorNameForDisplay(ui))
        .replace(/\{operatorPhone\}/g, resolveOperatorPhoneForDisplay(ui))
        .replace(/\{operatorAddress\}/g, resolveOperatorAddressForDisplay(ui));
    const parts = processed.split('{operatorEmail}');
    const email = resolveAnyOperatorEmailForDisplay(ui);
    const copyLabel = ui.copyEmailLabel || 'Copy email address';
    const copiedLabel = ui.copyEmailCopied || '✓ Copied';
    const preCls =
        'whitespace-pre-wrap font-mono text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800 select-text';

    if (parts.length === 1) {
        return <pre className={preCls}>{processed}</pre>;
    }

    return (
        <pre className={preCls}>
            {parts.map((piece, i) => (
                <Fragment key={i}>
                    {piece}
                    {i < parts.length - 1 ? (
                        <ObfuscatedEmail email={email} copyLabel={copyLabel} copiedLabel={copiedLabel} />
                    ) : null}
                </Fragment>
            ))}
        </pre>
    );
}

export function LegalSection({ ui }) {
    return (
        <div>
            <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl">⚖️</span>
                <h2 className="text-xl font-black text-slate-800 dark:text-white">{ui.impressumTitle}</h2>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 mb-6">
                <LocaleRichText
                    as="p"
                    className="text-slate-600 dark:text-slate-300 mb-4 leading-relaxed text-sm select-text"
                    html={ui.impressumText || ''}
                />

                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex flex-row flex-nowrap items-center justify-start gap-2.5 mb-4 w-full pl-0.5">
                        <div className="w-11 h-11 shrink-0 bg-white dark:bg-slate-900 rounded-xl shadow-sm flex items-center justify-center text-lg border border-slate-100 dark:border-slate-800">
                            🌲
                        </div>
                        <p className="font-black text-slate-800 dark:text-white text-sm m-0 leading-none whitespace-nowrap">treesys.org</p>
                    </div>
                    {ui.impressumIntro ? (
                        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 mb-3 italic">{ui.impressumIntro}</p>
                    ) : null}
                    <ImpressumDetailsPre text={ui.impressumDetails || ''} ui={ui} />
                </div>
            </div>

            {ui.supportContributionsTitle ? (
                <div className="bg-slate-50 dark:bg-slate-950/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 mb-6">
                    <h3 className="font-black text-slate-800 dark:text-white text-sm mb-3">{ui.supportContributionsTitle}</h3>
                    <p className="text-[12px] leading-relaxed text-slate-600 dark:text-slate-300 select-text">{ui.supportContributionsBody}</p>
                </div>
            ) : null}

            {ui.dsaSectionTitle ? (
                <div className="bg-slate-50 dark:bg-slate-950/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 mb-6">
                    <h3 className="font-black text-slate-800 dark:text-white text-sm mb-3">{ui.dsaSectionTitle}</h3>
                    <div className="space-y-3">
                        {[ui.dsaContactBody, ui.discoverIndexPolicyBody, ui.dsaModerationBody, ui.dsaNoticeBody].filter(Boolean).map((body, i) => (
                            <p key={i} className="text-[12px] leading-relaxed text-slate-600 dark:text-slate-300 select-text">
                                {body}
                            </p>
                        ))}
                    </div>
                </div>
            ) : null}

            <AttributionsSection ui={ui} />
        </div>
    );
}
