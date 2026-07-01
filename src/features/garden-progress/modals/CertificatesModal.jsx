import { useGardenProgress } from '../hooks/useGardenProgress.js';
import { useMemo, useState } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DOCK_HUB_TOOLBAR } from '../../../shared/ui/dock-sheet-chrome.js';
import { getPanelRef } from '../../../app/panel-refs.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

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
                    className={`${iconBox} ${isLocked ? 'bg-slate-200 dark:bg-slate-800 grayscale opacity-50' : 'bg-white dark:bg-slate-800'} rounded-2xl flex items-center justify-center shadow-sm border ${isLocked ? 'border-slate-300 dark:border-slate-600' : 'border-yellow-200 dark:border-yellow-700/50'} shrink-0`}
                >
                    {isLocked ? '🔒' : m.icon || '🎓'}
                </div>
                <div className={`flex-1 min-w-0 ${mob ? 'flex flex-col gap-1' : ''}`}>
                    <span
                        className={`arborito-pill arborito-pill--chip ${isLocked ? 'arborito-pill--slate' : 'arborito-pill--yellow'} w-fit`}
                    >
                        {isLocked
                            ? ui.lockedCert || 'Aún no desbloqueado'
                            : ui.lessonFinished || 'Completado'}
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

export function ModalCertificates({ embed = false }) {
    const { ui, setModal, gardenProgressActions } = useGardenProgress();
    const { getAvailableCertificates, leaveCertificatesView } = gardenProgressActions;
    const mob = embed ? true : shouldShowMobileUI();
    const [searchQuery, setSearchQuery] = useState('');
    const [showAll, setShowAll] = useState(true);

    const allCertifiable = getAvailableCertificates();
    const query = searchQuery.toLowerCase();
    const filtered = useMemo(
        () => allCertifiable.filter((m) => m.name.toLowerCase().includes(query)),
        [allCertifiable, query]
    );
    const visibleModules = showAll ? filtered : filtered.filter((m) => m.isComplete);

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

    const onView = (id) => setModal({ type: 'certificate', moduleId: String(id) });

    const listContent =
        visibleModules.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 min-h-[12rem] py-12 text-center opacity-50">
                <div className="text-8xl mb-6 grayscale">🎓</div>
                <h2 className="text-2xl font-bold mb-2 text-slate-800 dark:text-white">
                    {ui.noResults || 'Sin resultados'}
                </h2>
            </div>
        ) : (
            <div
                className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${mob ? 'gap-3' : 'gap-4'} overflow-y-auto custom-scrollbar ${mob ? 'p-0' : 'p-1'}`}
            >
                {visibleModules.map((m) => (
                    <CertCard key={m.id} module={m} mob={mob} ui={ui} onView={onView} />
                ))}
            </div>
        );

    const toolbar = (
        <div className={`${DOCK_HUB_TOOLBAR} flex flex-col sm:flex-row gap-2`}>
            <div className="arborito-field-wrap flex-1 min-w-0 min-h-[2.75rem] flex items-center">
                <span className="arborito-search-icon" aria-hidden="true">
                    🔍
                </span>
                <input
                    id="inp-cert-search"
                    type="text"
                    placeholder={ui.searchCert || 'Buscar certificado…'}
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
            tone="hub"
            title={ui.navCertificates || 'Logros'}
            titleId="modal-title-text"
            subtitle={ui.certificatesTagline || 'Logros y diplomas'}
            leadingIcon={<ChromeEmoji emoji="🏆" size={mob ? 24 : 28} />}
            backTagClass="btn-close-certs-mob"
            closeTagClass="btn-close-certs"
            onClose={close}
        />
    );

    return (
        <div data-arborito-panel="modal-certificates">
        <DockModalShell
            mobile={mob}
            sizeTier="HUB"
            hero={hero}
            toolbar={toolbar}
            skipBodyWrap
            shellOpts={{ rootFlags: 'arborito-modal--certificates-hub', z: 200 }}
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
