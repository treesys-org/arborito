import { useGardenProgress } from '../hooks/useGardenProgress.js';
import { useMemo, useState } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DOCK_HUB_TOOLBAR } from '../../../shared/ui/dock-sheet-chrome.js';
import { getPanelRef } from '../../../app/panel-refs.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { DockHubPanelEmbed } from '../../../shared/ui/DockHubPanelEmbed.jsx';
import { useDockHubEmbedClose } from '../../../shared/ui/DockHubEmbedContext.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import {
    ACHIEVEMENT_TROPHY_EMOJI,
    achievementTrophyToneClass,
} from '../api/achievement-trophy.js';

function matchesQuery(item, query) {
    return String(item?.name || '')
        .toLowerCase()
        .includes(query);
}

function filterSection(items, query, earnedOnly) {
    let list = items || [];
    if (query) list = list.filter((m) => matchesQuery(m, query));
    if (earnedOnly) list = list.filter((m) => m.isComplete);
    return list;
}

function CompletionRow({ item, ui, onView }) {
    const done = !!item.isComplete;
    const tone = item.scope === 'tree' ? 'emerald' : 'green';
    const borderCls = done
        ? tone === 'emerald'
            ? 'border-emerald-400/40 bg-emerald-50/80 dark:bg-emerald-950/20'
            : 'border-green-400/35 bg-green-50/80 dark:bg-green-950/15'
        : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40';

    return (
        <div
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${borderCls} transition-colors`}
        >
            <span
                className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-xl border bg-white dark:bg-slate-800 ${done ? 'border-yellow-300/70' : 'border-slate-300 dark:border-slate-600'}`}
            >
                <ChromeEmoji
                    emoji={ACHIEVEMENT_TROPHY_EMOJI}
                    className={achievementTrophyToneClass(done)}
                />
            </span>
            <div className="flex-1 min-w-0">
                <p
                    className={`text-sm font-black leading-tight truncate ${done ? 'text-slate-800 dark:text-white' : 'text-slate-500'}`}
                >
                    {item.name}
                </p>
                <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                    {done
                        ? ui.lessonFinished || 'Completed'
                        : (ui.achievementInProgress || '{pct}% · En camino').replace(
                              '{pct}',
                              String(item.progressPct ?? 0)
                          )}
                </p>
            </div>
            {done ? (
                <button
                    type="button"
                    className="shrink-0 text-[11px] font-black px-3 py-2 rounded-lg arborito-cta-blue"
                    onClick={() => onView(item.id)}
                >
                    {ui.viewCompletion || ui.viewCert || 'Ver'}
                </button>
            ) : (
                <span className="arborito-pill arborito-pill--chip arborito-pill--slate shrink-0 text-[10px]">
                    {item.progressPct ?? 0}%
                </span>
            )}
        </div>
    );
}

function CertCard({ module: m, mob, ui, onView }) {
    const isLocked = !m.isComplete;
    const cardPad = mob ? 'p-4' : 'p-5';
    const cardGap = mob ? 'gap-3' : 'gap-4';
    const iconBox = mob ? 'w-14 h-14 text-3xl' : 'w-16 h-16 text-4xl';
    const titleCls = mob ? 'text-base' : 'text-lg';

    return (
        <div
            className={`border-2 ${isLocked ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50' : 'border-yellow-400/30 bg-yellow-50 dark:bg-yellow-900/10'} ${cardPad} rounded-2xl flex ${mob ? 'flex-row items-center' : 'flex-col'} ${cardGap} relative overflow-hidden group transition-all ${mob ? '' : 'hover:scale-[1.02] hover:shadow-lg'} h-full`}
        >
            <div
                className={`absolute -right-6 -bottom-6 text-9xl opacity-5 rotate-12 pointer-events-none select-none ${isLocked ? 'grayscale' : ''}`}
            >
                📜
            </div>
            <div
                className={`flex ${mob ? 'flex-row items-center gap-3 flex-1 min-w-0' : 'items-start justify-between'} relative z-10 w-full`}
            >
                <div
                    className={`${iconBox} bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm border shrink-0 ${isLocked ? 'border-slate-300 dark:border-slate-600' : 'border-yellow-200 dark:border-yellow-700/50'}`}
                >
                    <ChromeEmoji
                        emoji={ACHIEVEMENT_TROPHY_EMOJI}
                        className={`text-3xl ${achievementTrophyToneClass(!isLocked)}`}
                    />
                </div>
                <div className={`flex-1 min-w-0 ${mob ? 'flex flex-col gap-1' : ''}`}>
                    <span
                        className={`arborito-pill arborito-pill--chip ${isLocked ? 'arborito-pill--slate' : 'arborito-pill--yellow'} w-fit`}
                    >
                        {isLocked
                            ? ui.lockedCert || 'Not unlocked yet'
                            : ui.lessonFinished || 'Completed'}
                    </span>
                    <h3
                        className={`font-black ${isLocked ? 'text-slate-500 dark:text-slate-500' : 'text-slate-800 dark:text-white'} ${titleCls} leading-tight line-clamp-2 ${mob ? '' : 'mb-2'}`}
                    >
                        {m.name}
                    </h3>
                    {mob && (
                        <div className="w-full pt-1">
                            {isLocked ? (
                                <button
                                    type="button"
                                    className="w-full text-xs font-bold text-slate-400 bg-slate-200 dark:bg-slate-800 py-2.5 rounded-xl cursor-not-allowed opacity-70"
                                >
                                    {ui.viewCert || 'Ver'}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="btn-view-cert w-full text-xs font-bold arborito-cta-blue py-2.5 rounded-xl transition-colors shadow-md"
                                    onClick={() => onView(m.id)}
                                >
                                    {ui.viewCert || 'Ver diploma'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {!mob && (
                <div className="flex-1 relative z-10 min-w-0 flex flex-col">
                    <div className="mt-auto pt-2">
                        {isLocked ? (
                            <button
                                type="button"
                                className="w-full text-xs font-bold text-slate-400 bg-slate-200 dark:bg-slate-800 py-2 rounded-xl cursor-not-allowed opacity-70"
                            >
                                {ui.viewCert || 'Ver'}
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="btn-view-cert w-full text-xs font-bold arborito-cta-blue py-2 rounded-xl transition-colors active:scale-[0.98] shadow-md"
                                onClick={() => onView(m.id)}
                            >
                                {ui.viewCert || 'Ver diploma'}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function SectionHeading({ children }) {
    return (
        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 px-1 pt-1 pb-2">
            {children}
        </h3>
    );
}

function AchievementsBody({ tab, sections, earnedOnly, query, mob, ui, onView }) {
    const trees = filterSection(sections.trees, query, earnedOnly);
    const branches = filterSection(sections.branches, query, earnedOnly);
    const diplomas = filterSection(sections.diplomas, query, earnedOnly);
    const completions = [...trees, ...branches];
    const showCompletions = tab === 'all' || tab === 'completions';
    const showDiplomas = tab === 'all' || tab === 'diplomas';
    const isEmpty =
        (showCompletions ? completions.length === 0 : true) &&
        (showDiplomas ? diplomas.length === 0 : true);

    if (isEmpty) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 min-h-[12rem] py-12 text-center opacity-50">
                <div className="text-8xl mb-6 grayscale">🎓</div>
                <h2 className="text-2xl font-bold mb-2 text-slate-800 dark:text-white">
                    {ui.noResults || 'Sin resultados'}
                </h2>
            </div>
        );
    }

    return (
        <div className={`flex flex-col ${mob ? 'gap-4' : 'gap-6'} ${mob ? 'p-0' : 'p-1'}`}>
            {showCompletions && trees.length > 0 && (
                <section>
                    {tab === 'all' && (
                        <SectionHeading>{ui.achievementsSectionTrees || 'Árboles completados'}</SectionHeading>
                    )}
                    <div className="flex flex-col gap-2">
                        {trees.map((item) => (
                            <CompletionRow key={item.id} item={item} ui={ui} onView={onView} />
                        ))}
                    </div>
                </section>
            )}

            {showCompletions && branches.length > 0 && (
                <section>
                    {tab === 'all' && (
                        <SectionHeading>
                            {ui.achievementsSectionBranches || 'Ramas completadas'}
                        </SectionHeading>
                    )}
                    <div className="flex flex-col gap-2">
                        {branches.map((item) => (
                            <CompletionRow key={item.id} item={item} ui={ui} onView={onView} />
                        ))}
                    </div>
                </section>
            )}

            {showDiplomas && diplomas.length > 0 && (
                <section>
                    {tab === 'all' && completions.length > 0 && (
                        <SectionHeading>{ui.achievementsSectionDiplomas || 'Diplomas'}</SectionHeading>
                    )}
                    <div
                        className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${mob ? 'gap-3' : 'gap-4'}`}
                    >
                        {diplomas.map((m) => (
                            <CertCard key={m.id} module={m} mob={mob} ui={ui} onView={onView} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}


export function ModalCertificates({ embed = false, dockEmbed = false, dockEmbedActive = false }) {
    const { ui, setModal, gardenProgressActions } = useGardenProgress();
    const { getAchievementSections, leaveCertificatesView } = gardenProgressActions;
    const mob = embed ? true : shouldShowMobileUI();
    const [searchQuery, setSearchQuery] = useState('');
    const [showAll, setShowAll] = useState(true);
    const [tab, setTab] = useState('all');

    const sections = getAchievementSections();
    const query = searchQuery.toLowerCase().trim();
    const earnedOnly = !showAll;

    const tabCounts = useMemo(() => {
        const trees = filterSection(sections.trees, query, earnedOnly).length;
        const branches = filterSection(sections.branches, query, earnedOnly).length;
        const diplomas = filterSection(sections.diplomas, query, earnedOnly).length;
        return {
            all: trees + branches + diplomas,
            completions: trees + branches,
            diplomas,
        };
    }, [sections, query, earnedOnly]);

    const toggleBtnLabel = showAll ? ui.showEarned || 'Mis logros' : ui.showAll || 'Ver todos';
    const toggleBtnClass = showAll
        ? 'bg-yellow-500 hover:bg-yellow-600 text-white shadow-yellow-500/20'
        : 'bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-700 dark:hover:bg-slate-600';

    const close = () => {
        if (embed) {
            getPanelRef('sidebar')?.closeMobileMenuIfOpen?.();
            return;
        }
        leaveCertificatesView();
    };

    useDockHubEmbedClose(close, dockEmbedActive);

    const onView = (id) => setModal({ type: 'certificate', moduleId: String(id) });

    const listContent = (
        <AchievementsBody
            tab={tab}
            sections={sections}
            earnedOnly={earnedOnly}
            query={query}
            mob={mob}
            ui={ui}
            onView={onView}
        />
    );

    const toolbar = (
        <div className={`${DOCK_HUB_TOOLBAR} flex flex-col gap-2`}>
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="arborito-field-wrap flex-1 min-w-0 min-h-[2.75rem] flex items-center">
                    <span className="arborito-search-icon" aria-hidden="true">
                        🔍
                    </span>
                    <input
                        id="inp-cert-search"
                        type="text"
                        placeholder={ui.searchAchievements || ui.searchCert || 'Buscar logro…'}
                        className="arborito-input arborito-input--search font-bold shadow-sm leading-normal"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <button
                    id="btn-toggle-certs"
                    type="button"
                    className={`arborito-dock-hub-toolbar__btn px-4 py-2.5 rounded-xl ${toggleBtnClass} font-bold text-xs whitespace-nowrap transition-colors shadow-sm shrink-0`}
                    onClick={() => setShowAll((v) => !v)}
                >
                    {toggleBtnLabel}
                </button>
            </div>
            <div id="certs-tabs" className="arborito-tab-strip" role="tablist">
                <button
                    type="button"
                    className={`arborito-tab-strip__btn${tab === 'all' ? ' is-active' : ''}`}
                    onClick={() => setTab('all')}
                >
                    {ui.achievementsTabAll || 'All'}
                    {tabCounts.all > 0 ? ` (${tabCounts.all})` : ''}
                </button>
                <button
                    type="button"
                    className={`arborito-tab-strip__btn${tab === 'completions' ? ' is-active' : ''}`}
                    onClick={() => setTab('completions')}
                >
                    {ui.achievementsTabCompletions || 'Completions'}
                    {tabCounts.completions > 0 ? ` (${tabCounts.completions})` : ''}
                </button>
                <div className="arborito-tab-strip__divider" aria-hidden="true" />
                <button
                    type="button"
                    className={`arborito-tab-strip__btn${tab === 'diplomas' ? ' is-active' : ''}`}
                    onClick={() => setTab('diplomas')}
                >
                    {ui.achievementsTabDiplomas || 'Diplomas'}
                    {tabCounts.diplomas > 0 ? ` (${tabCounts.diplomas})` : ''}
                </button>
            </div>
        </div>
    );

    if (embed) {
        return (
            <div
                data-arborito-panel="modal-certificates"
                data-embed="1"
                className="arborito-certs-embed-root flex flex-col flex-1 min-h-0 w-full h-full min-w-0 overflow-hidden bg-white dark:bg-slate-900"
            >
                <div className="shrink-0 flex flex-col">
                    <h2 id="modal-title-text" className="hidden">
                        {ui.navCertificates || 'Logros'}
                    </h2>
                    {toolbar}
                </div>
                <div
                    id="certs-list-container"
                    className="px-4 pb-4 pt-2 flex-1 overflow-y-auto min-h-0"
                >
                    {listContent}
                </div>
            </div>
        );
    }

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mob}
            title={ui.navCertificates || 'Logros'}
            titleId="modal-title-text"
            subtitle={ui.certificatesTagline || 'Logros y diplomas'}
            leadingIcon="🏆"
            backTagClass="btn-close-certs-mob"
            closeTagClass="btn-close-certs"
            onClose={close}
        />
    );

    if (dockEmbed) {
        return (
            <DockHubPanelEmbed
                panelId="modal-certificates"
                hero={hero}
                toolbar={toolbar}
                skipBodyWrap
            >
                <div
                    id="certs-list-container"
                    className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar"
                >
                    {listContent}
                </div>
            </DockHubPanelEmbed>
        );
    }

    return (
        <div data-arborito-panel="modal-certificates">
            <DockModalShell
                mobile={mob}
                sizeTier="HUB"
                hero={hero}
                toolbar={toolbar}
                skipBodyWrap
                shellOpts={{ rootFlags: 'arborito-modal--certificates-hub' }}
                onBackdropClick={close}
            >
                <div
                    id="certs-list-container"
                    className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar"
                >
                    {listContent}
                </div>
            </DockModalShell>
        </div>
    );
}
