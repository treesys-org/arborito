import treesysLogoUrl from '../../../../../build/treesys-logo.png?url';

import { LocaleRichText } from '../../../../shared/ui/LocaleRichText.jsx';
import { openExternalUrl } from '../../../../shared/lib/open-external-url.js';
import { CommunityMenuList } from '../../components/CommunityMenuList.jsx';

export function ManifestoSection({ ui, versionLabel = '' }) {
    return (
        <div className="arborito-about-manifesto">
            <div className="text-center mb-5 md:mb-4">
                <img
                    src={treesysLogoUrl}
                    alt={ui.treesysLogoAlt || 'Treesys'}
                    width={80}
                    height={80}
                    className="mx-auto mb-3 md:mb-2.5 block h-20 w-20 md:h-[4.5rem] md:w-[4.5rem] object-contain brightness-0 dark:invert"
                />
                <p className="text-base font-medium text-slate-600 dark:text-slate-300">{ui.aboutTreesysProductLine}</p>
                {versionLabel ? (
                    <p className="mt-1.5 text-sm font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                        {versionLabel}
                    </p>
                ) : null}
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 md:p-4 rounded-2xl text-left mb-5 md:mb-4 border border-slate-100 dark:border-slate-800">
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4 md:mb-3.5 font-medium text-sm md:text-[0.9rem] select-text">
                    <LocaleRichText html={ui.missionText || ''} />
                </p>

                <button
                    type="button"
                    className="flex items-center justify-center gap-2 w-full py-3 md:py-2.5 bg-slate-900 dark:bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-600 transition-all shadow-lg active:scale-95 group text-sm"
                    onClick={() => openExternalUrl('https://treesys.org')}
                >
                    <span className="text-lg transition-transform group-hover:scale-110" aria-hidden="true">🌐</span>
                    {ui.aboutVisitTreesys}
                </button>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4 md:p-3.5 mb-5 md:mb-4">
                <h3 className="arborito-eyebrow arborito-eyebrow--md mb-3 md:mb-2 text-center">
                    {ui.aboutCommunityHeading || 'Community'}
                </h3>
                <CommunityMenuList ui={ui} className="arborito-community-menu-list--about" />
            </div>

            <div className="pt-4 md:pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                <h3 className="arborito-eyebrow arborito-eyebrow--md mb-2 md:mb-1.5">{ui.metaphorTitle}</h3>
                <blockquote className="text-slate-500 dark:text-slate-400 italic text-sm select-text">
                    &ldquo;{ui.metaphorText}&rdquo;
                </blockquote>
            </div>
        </div>
    );
}
