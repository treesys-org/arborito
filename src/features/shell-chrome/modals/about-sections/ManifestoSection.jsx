import treesysLogoUrl from '../../../../../build/treesys-logo.png?url';

import { LocaleRichText } from '../../../../shared/ui/LocaleRichText.jsx';
import { openExternalUrl } from '../../../../shared/lib/open-external-url.js';
import { CommunityMenuList } from '../../components/CommunityMenuList.jsx';

export function ManifestoSection({ ui }) {
    return (
        <div>
            <div className="text-center mb-8">
                <img
                    src={treesysLogoUrl}
                    alt={ui.treesysLogoAlt || 'Treesys'}
                    width={92}
                    height={92}
                    className="mx-auto mb-4 block h-[92px] w-[92px] object-contain brightness-0 dark:invert"
                />
                <p className="text-base font-medium text-slate-600 dark:text-slate-300">{ui.aboutTreesysProductLine}</p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl text-left mb-6 border border-slate-100 dark:border-slate-800">
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-6 font-medium text-sm md:text-base select-text">
                    <LocaleRichText html={ui.missionText || ''} />
                </p>

                <button
                    type="button"
                    className="flex items-center justify-center gap-2 w-full py-3.5 bg-slate-900 dark:bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-600 transition-all shadow-lg active:scale-95 group text-sm"
                    onClick={() => openExternalUrl('https://treesys.org')}
                >
                    <span className="text-lg transition-transform group-hover:scale-110" aria-hidden="true">🌐</span>
                    {ui.aboutVisitTreesys}
                </button>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4 mb-6">
                <h3 className="arborito-eyebrow arborito-eyebrow--md mb-3 text-center">
                    {ui.aboutCommunityHeading || 'Community'}
                </h3>
                <CommunityMenuList ui={ui} className="arborito-community-menu-list--about" />
            </div>

            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 text-center">
                <h3 className="arborito-eyebrow arborito-eyebrow--md mb-2">{ui.metaphorTitle}</h3>
                <blockquote className="text-slate-500 dark:text-slate-400 italic text-sm select-text">
                    &ldquo;{ui.metaphorText}&rdquo;
                </blockquote>
            </div>
        </div>
    );
}
