import { useShellChrome } from '../hooks/useShellChrome.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { ArboritoSupportPanel } from '../components/ArboritoSupportPanel.jsx';

export function ModalArboritoSupport() {
    const { ui, dismissModal, modal } = useShellChrome();
    const mobile = shouldShowMobileUI();

    const nested =
        modal &&
        typeof modal === 'object' &&
        (modal.fromAbout || modal.fromMobileMore);

    const close = () => dismissModal();

    const title = ui.arboritoSupportModalTitle || ui.arboritoSupportCta || 'Support Arborito';

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={title}
            titleTruncate
            titleId="arborito-support-title"
            leadingIcon={<ChromeEmoji emoji="💝" size={24} />}
            tagClass="btn-close"
            showBack={nested}
            onBack={nested ? close : undefined}
            onClose={close}
        />
    );

    const body = <ArboritoSupportPanel ui={ui} />;

    if (mobile) {
        return (
            <div data-arborito-panel="modal-arborito-support">
                <DockModalShell
                    mobile
                    sizeTier="COMPACT"
                    layout="dock"
                    shellOpts={{ rootFlags: 'arborito-modal--arborito-support', scrim: 'translucent' }}
                    panelClass="arborito-modal-dock-panel w-full min-h-0 flex-1"
                    onBackdropClick={close}
                    hero={hero}
                >
                    {body}
                </DockModalShell>
            </div>
        );
    }

    return (
        <div data-arborito-panel="modal-arborito-support">
            <ModalCenteredShell
                mobile={false}
                layout="centered"
                sizeTier="COMPACT"
                hero={hero}
                panelRadius="2xl"
                shellOpts={{
                    rootFlags: 'arborito-modal--arborito-support',
                    enter: 'fade-fast',
                    scrim: 'translucent',
                }}
                onBackdropClick={close}
            >
                {body}
            </ModalCenteredShell>
        </div>
    );
}
