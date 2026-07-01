import { useShellChrome } from '../../hooks/useShellChrome.js';
import {
    prefetchConstructionShellOnIntent,
    prefetchModalChunkOnIntent,
} from '../../../../app/modal-open-bridge.js';
import { LanguageIcon } from '../../../../shared/ui/ArboritoIcons.jsx';
import { MmenuDrillRow, MmenuRootHero } from '../../../../shared/ui/MmenuChrome.jsx';

export { ArboritoLogoMark, LanguageIcon, SearchIcon } from '../../../../shared/ui/ArboritoIcons.jsx';
export { DrillChevron, DrillRow } from '../../../../shared/ui/MmenuChrome.jsx';

export function SidebarMobileMoreMenu({
    ui,
    open,
    mmenuPane,
    mmenuFreshEnter,
    mmenuReopenInstant,
    mmenuPaneDir,
    onBackdropClose,
    onBack,
    onPushPane,
    onDownload,
    onConstruct,
    onLegal,
    onPickLanguage,
    constructionMode,
    curLang,
    certsMoreActive,
    hideRootHero = false,
    childrenEmbed,
}) {
    const { availableLanguages, lang } = useShellChrome();
    if (!open) return null;

    const subTitles = {
        language: ui.languageTitle,
        about: ui.navAbout,
        sources: ui.moreMenuRowSources || ui.navSources,
        certs: ui.moreMenuRowCertificates || ui.navCertificates,
        forum: ui.navForum || 'Forum',
        celebration: ui.profileGardenPrefsGroup || 'Sonidos y animaciones',
        a11y: ui.a11yPrefsTitle || 'Accesibilidad',
    };
    const title =
        mmenuPane === 'root' ? ui.navMore || 'More' : subTitles[mmenuPane] || mmenuPane;

    const embedPane = new Set(['about', 'sources', 'certs', 'forum', 'celebration', 'a11y']);
    const scrollExtra = embedPane.has(mmenuPane)
        ? mmenuPane === 'about'
            ? ' arborito-mmenu-scroll--about'
            : ' arborito-mmenu-scroll--embed-pane'
        : '';

    const paneAnim =
        mmenuPaneDir === 'forward'
            ? ' arborito-mmenu-pane--fwd'
            : mmenuPaneDir === 'back'
              ? ' arborito-mmenu-pane--back'
              : '';

    return (
        <>
            <div
                id="mobile-menu-backdrop"
                className={`arborito-sheet-backdrop arborito-sheet-backdrop--mobile-more${mmenuFreshEnter ? ' arborito-dock-modal-scrim-enter' : ''}${mmenuReopenInstant ? ' arborito-sheet-backdrop--instant' : ''}`}
                aria-hidden="true"
                onClick={onBackdropClose}
            />
            <div
                id="mobile-menu"
                className={`arborito-sheet arborito-sheet--mobile-more${mmenuFreshEnter ? ' arborito-dock-modal-enter' : ''}${mmenuReopenInstant ? ' arborito-sheet--instant' : ''} min-h-0`}
                role="dialog"
                aria-modal="true"
                aria-label={ui.ariaMenu || ui.navMore || 'Menu'}
            >
                {hideRootHero ? null : (
                    <MmenuRootHero title={title} onBack={onBack} backAria={ui.navBack || ui.close || 'Back'} />
                )}
                <div
                    className={`arborito-mmenu-scroll arborito-mmenu-pane-host custom-scrollbar${scrollExtra}`}
                    style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 12px))' }}
                >
                    <div className={`arborito-mmenu-pane-body min-h-0 w-full flex flex-col flex-1${paneAnim}`}>
                        {mmenuPane === 'language' ? (
                            <div className="grid grid-cols-1 gap-2 pb-2 px-4 pt-4 w-full">
                                {availableLanguages.map((l) => (
                                    <button
                                        key={l.code}
                                        type="button"
                                        className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 transition-all text-left ${
                                            lang === l.code
                                                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                                : 'border-slate-100 dark:border-slate-700 bg-white/70 dark:bg-slate-800/40'
                                        }`}
                                        onClick={() => onPickLanguage(l.code)}
                                    >
                                        <span className="text-3xl shrink-0 leading-none mt-0.5" aria-hidden="true">
                                            {l.flag}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <span className="font-bold text-slate-800 dark:text-slate-100 block leading-tight">
                                                {l.nativeName}
                                            </span>
                                            <span className="text-xs text-slate-500 leading-tight">{l.name}</span>
                                        </div>
                                        <span
                                            className="w-8 shrink-0 flex items-start justify-center text-xl font-bold text-green-500 leading-none pt-1"
                                            aria-hidden="true"
                                        >
                                            {lang === l.code ? '✓' : ''}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : mmenuPane === 'root' ? (
                            <div className="px-4 pt-4 w-full">
                                <p className="arborito-menu-section">{ui.menuSectionContent || 'Content'}</p>
                                <MmenuDrillRow
                                    icon="💬"
                                    label={ui.navForum || 'Forum'}
                                    onClick={() => onPushPane('forum')}
                                    onPointerEnter={() => prefetchModalChunkOnIntent('forum')}
                                />
                                <MmenuDrillRow icon="ℹ️" label={ui.navAbout} onClick={() => onPushPane('about')} onPointerEnter={() => prefetchModalChunkOnIntent('about')} />
                                <MmenuDrillRow
                                    icon="🌳"
                                    label={ui.moreMenuRowSources || ui.navSources}
                                    onClick={() => onPushPane('sources')}
                                    onPointerEnter={() => prefetchModalChunkOnIntent('sources')}
                                />
                                <MmenuDrillRow
                                    icon="🏆"
                                    label={ui.moreMenuRowCertificates || ui.navCertificates}
                                    onClick={() => onPushPane('certs')}
                                    onPointerEnter={() => prefetchModalChunkOnIntent('certificates')}
                                    className={certsMoreActive ? 'ring-2 ring-amber-400/45 dark:ring-amber-500/35' : ''}
                                />
                                <hr className="arborito-mmenu-divider" aria-hidden="true" />
                                <p className="arborito-menu-section">{ui.menuSectionTools || 'Tools'}</p>
                                <MmenuDrillRow
                                    icon={constructionMode ? '🏗️' : '👷'}
                                    label={
                                        constructionMode
                                            ? ui.navConstructExit || 'Exit construction'
                                            : ui.navConstruct || 'Construction Mode'
                                    }
                                    onClick={onConstruct}
                                    onPointerEnter={() => prefetchConstructionShellOnIntent()}
                                    className={
                                        constructionMode
                                            ? 'ring-2 ring-orange-400/50 dark:ring-orange-500/40'
                                            : ''
                                    }
                                />
                                <hr className="arborito-mmenu-divider" aria-hidden="true" />
                                <p className="arborito-menu-section">{ui.menuSectionApp || 'App'}</p>
                                <MmenuDrillRow
                                    icon={
                                        curLang?.flag ? (
                                            <span>{curLang.flag}</span>
                                        ) : (
                                            <LanguageIcon size={22} className="opacity-90" />
                                        )
                                    }
                                    label={ui.languageTitle}
                                    hint={curLang?.nativeName || ''}
                                    onClick={() => onPushPane('language')}
                                />
                                <MmenuDrillRow
                                    icon="🔊"
                                    label={ui.profileGardenPrefsGroup || 'Sonidos y animaciones'}
                                    onClick={() => onPushPane('celebration')}
                                    onPointerEnter={() => prefetchModalChunkOnIntent('celebration-prefs')}
                                />
                                <MmenuDrillRow
                                    icon="♿"
                                    label={ui.a11yPrefsTitle || 'Accesibilidad'}
                                    onClick={() => onPushPane('a11y')}
                                    onPointerEnter={() => prefetchModalChunkOnIntent('accessibility-prefs')}
                                />
                                {childrenEmbed.showWebDownload ? (
                                    <MmenuDrillRow
                                        icon="📲"
                                        label={ui.downloadAppChip || 'Descargar app'}
                                        hint={ui.moreMenuRowDownloadSub || ui.downloadAppOptionalShort || ''}
                                        onClick={onDownload}
                                    />
                                ) : null}
                                <div className="px-4 pb-4 mt-6 opacity-60 hover:opacity-100 transition-opacity flex justify-center">
                                    <button
                                        type="button"
                                        className="text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 w-full text-center py-2 underline decoration-slate-300 dark:decoration-slate-700 underline-offset-4"
                                        onClick={onLegal}
                                    >
                                        treesys.org · {ui.tabLegal || 'Legal notice'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="arborito-mmenu-embed-host flex flex-col flex-1 min-h-0 w-full min-w-0">
                                {childrenEmbed.node}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
