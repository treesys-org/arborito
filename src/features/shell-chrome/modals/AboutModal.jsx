import { useShellChrome } from '../hooks/useShellChrome.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterPanel } from '../../../app/hooks/useRegisterPanel.js';
import { linkPanelDom, unlinkPanelDom } from '../../../app/panel-refs.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { TabBar } from '../../../app/components/TabBar.jsx';
import treesysLogoUrl from '../../../../build/treesys-logo.png?url';
import { formatArboritoVersionLabel } from '../../../core/version.js';
import { ManifestoSection } from './about-sections/ManifestoSection.jsx';
import { RoadmapSection } from './about-sections/RoadmapSection.jsx';
import { PrivacySection } from './about-sections/PrivacySection.jsx';
import { LegalSection } from './about-sections/LegalSection.jsx';

const VALID_TABS = new Set(['manifesto', 'roadmap', 'privacy', 'legal']);

function resolveInitialTab(embed, modal) {
    if (embed) return 'manifesto';
    const tab = modal?.tab;
    return VALID_TABS.has(tab) ? tab : 'manifesto';
}

function aboutVersionLine(ui) {
    return formatArboritoVersionLabel(ui?.aboutAppVersion || 'Version {version}');
}

function AboutTabContent({ activeTab, ui, versionLabel, onOpenLegalTab }) {
    switch (activeTab) {
        case 'roadmap':
            return <RoadmapSection ui={ui} />;
        case 'privacy':
            return <PrivacySection ui={ui} onOpenLegalTab={onOpenLegalTab} />;
        case 'legal':
            return <LegalSection ui={ui} />;
        default:
            return <ManifestoSection ui={ui} versionLabel={versionLabel} />;
    }
}

export function ModalAbout({ embed }) {
    const shell = useShellChrome();
    const { ui, dismissModal, modal } = shell;

    const mobile = shouldShowMobileUI();
    const rootRef = useRef(null);
    const setActiveTabRef = useRef(null);
    const [activeTab, setActiveTab] = useState(() => resolveInitialTab(embed, shell.modal));
    const versionLabel = aboutVersionLine(ui);

    setActiveTabRef.current = setActiveTab;

    const panelApiRef = useRef({
        openTab(tab) {
            setActiveTabRef.current(VALID_TABS.has(tab) ? tab : 'manifesto');
        },
    });

    useRegisterPanel(embed ? 'modal-about' : '', () => panelApiRef.current);

    useEffect(() => {
        if (!embed || !rootRef.current) return undefined;
        linkPanelDom(rootRef.current, panelApiRef.current);
        return () => unlinkPanelDom(rootRef.current);
    }, [embed]);

    useEffect(() => {
        if (embed) return;
        const tab = shell.modal?.tab;
        if (VALID_TABS.has(tab)) {
            setActiveTab(tab);
        }
    }, [embed, shell.modal?.tab]);

    const close = () => {
        if (embed) return;
        dismissModal();
    };

    const setTab = useCallback((tab) => {
        setActiveTab(VALID_TABS.has(tab) ? tab : 'manifesto');
    }, []);

    const tabs = [
        { id: 'manifesto', label: ui.tabManifesto || 'Manifesto' },
        { id: 'roadmap', label: ui.tabRoadmap || 'Roadmap' },
        { id: 'privacy', label: ui.tabPrivacy || 'Privacy' },
        { id: 'legal', label: ui.tabLegal || 'Legal' },
    ];

    const contentPad = embed ? 'p-3 sm:p-4' : 'pb-12';
    const tabRow = (
        <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setTab} className="w-full shrink-0" />
    );

    const scrollContent = (
        <div
            id="about-content-scroll"
            className={`${contentPad}${embed ? ' overflow-y-auto custom-scrollbar flex-1 min-h-0 pb-10' : ''}`}
        >
            <AboutTabContent
                activeTab={activeTab}
                ui={ui}
                versionLabel={versionLabel}
                onOpenLegalTab={() => setTab('legal')}
            />
        </div>
    );

    if (embed) {
        return (
            <div
                ref={rootRef}
                data-arborito-panel="modal-about"
                data-embed="1"
                className="arborito-about-embed-root flex flex-col flex-1 min-h-0 w-full"
            >
                <div className="shrink-0 w-full border-b border-slate-200/50 dark:border-slate-700/45">
                    {tabRow}
                </div>
                {scrollContent}
            </div>
        );
    }

    const productLine = String(ui.aboutTreesysProductLine || '').trim();

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={ui.navAbout || 'About'}
            subtitle={productLine}
            leadingIcon={(
                <img
                    src={treesysLogoUrl}
                    alt=""
                    width={28}
                    height={28}
                    className="block h-7 w-7 object-contain brightness-0 dark:invert"
                />
            )}
            tagClass="btn-close"
            onClose={close}
        />
    );

    const toolbar = mobile ? tabRow : undefined;
    const desktopPad =
        activeTab === 'manifesto' ? 'px-4 sm:px-6 pb-6 pt-1' : 'px-4 sm:px-6 pb-8';
    const contentPadResolved = embed ? 'p-3 sm:p-4' : mobile ? 'pb-12' : desktopPad;

    /* HUB footprint. skipBodyWrap: one scroll host (not DockHub + inner). */
    return (
        <DockModalShell
            mobile={mobile}
            sizeTier="HUB"
            skipBodyWrap
            shellOpts={{ panelClass: 'w-full', rootFlags: 'arborito-modal--about' }}
            onBackdropClick={close}
            hero={hero}
            toolbar={toolbar}
        >
            {mobile ? (
                <div
                    id="about-content-scroll"
                    className={`${contentPadResolved} flex-1 min-h-0 overflow-y-auto custom-scrollbar`}
                >
                    <AboutTabContent
                        activeTab={activeTab}
                        ui={ui}
                        versionLabel={versionLabel}
                        onOpenLegalTab={() => setTab('legal')}
                    />
                </div>
            ) : (
                <div className="flex flex-col flex-1 min-h-0 w-full">
                    <div className="shrink-0 w-full">{tabRow}</div>
                    <div
                        id="about-content-scroll"
                        className={`${contentPadResolved} overflow-y-auto custom-scrollbar flex-1 min-h-0`}
                    >
                        <AboutTabContent
                            activeTab={activeTab}
                            ui={ui}
                            versionLabel={versionLabel}
                            onOpenLegalTab={() => setTab('legal')}
                        />
                    </div>
                </div>
            )}
        </DockModalShell>
    );
}
