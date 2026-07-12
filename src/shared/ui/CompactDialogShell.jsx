import { useEffect, useRef } from 'react';
import { DockModalShell, ModalCenteredShell } from '../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../app/components/ModalHero.jsx';
import { DockHubShell } from '../../app/components/DockHubShell.jsx';
import { shouldShowMobileUI } from './breakpoints.js';
import { bindMobileInputKeepVisible } from './mobile-form-viewport.js';

const DIALOG_SHELL_OPTS_MOBILE = {
    rootFlags: 'arborito-modal--dialog',
    z: 200,
    enter: 'dock',
    scrim: 'translucent',
};

const DIALOG_SHELL_OPTS_DESKTOP = {
    rootFlags: 'arborito-modal--dialog',
    z: 200,
    enter: 'fade-fast',
    panelClass: 'animate-in zoom-in-95 duration-200 max-h-[min(90vh,640px)]',
};

/**
 * Compact dialog chrome, same shell as `DialogModal` (confirm / prompt / alert).
 * `embedded`: fills a profile-stack overlay (`absolute inset-0`) without a second viewport backdrop.
 */
export function CompactDialogShell({
    ui,
    mobile: mobileProp,
    title,
    subtitle,
    leadingIcon = 'ℹ️',
    onClose,
    backTagClass = 'btn-dialog-mob-back',
    closeTagClass = 'btn-dialog-dismiss',
    embedded = false,
    onBackdropClick,
    panelDataAttr,
    footer,
    children,
}) {
    const mobile = mobileProp == null ? shouldShowMobileUI() : !!mobileProp;
    const rootRef = useRef(null);

    useEffect(() => {
        if (!mobile) return undefined;
        return bindMobileInputKeepVisible(rootRef.current);
    }, [mobile, title]);

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={title}
            subtitle={subtitle}
            leadingIcon={leadingIcon}
            backTagClass={backTagClass}
            closeTagClass={closeTagClass}
            onBack={onClose}
            onClose={onClose}
        />
    );

    const body = (
        <div
            className={`flex flex-col min-h-0 flex-1 overflow-hidden arborito-dialog-sheet-body ${mobile ? 'px-4 sm:px-6 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]' : 'p-6 pt-2'}`}
        >
            {children}
        </div>
    );

    if (embedded) {
        return (
            <div
                ref={rootRef}
                className="arborito-profile-stack-dialog absolute inset-0 z-10 flex flex-col min-h-0"
                data-arborito-panel={panelDataAttr || undefined}
            >
                <DockHubShell mobile={mobile} hero={hero} footer={footer} skipBodyWrap>
                    {body}
                </DockHubShell>
            </div>
        );
    }

    if (mobile) {
        return (
            <div ref={rootRef} data-arborito-panel={panelDataAttr || undefined}>
                <DockModalShell
                    mobile={mobile}
                    sizeTier="COMPACT"
                    skipBodyWrap
                    hero={hero}
                    footer={footer}
                    shellOpts={DIALOG_SHELL_OPTS_MOBILE}
                    onBackdropClick={onBackdropClick}
                >
                    {body}
                </DockModalShell>
            </div>
        );
    }

    return (
        <div ref={rootRef} data-arborito-panel={panelDataAttr || undefined}>
            <ModalCenteredShell
                mobile={mobile}
                layout="centered"
                sizeTier="COMPACT"
                hero={hero}
                footer={footer}
                panelRadius="2xl"
                shellOpts={DIALOG_SHELL_OPTS_DESKTOP}
                onBackdropClick={onBackdropClick}
            >
                {body}
            </ModalCenteredShell>
        </div>
    );
}
