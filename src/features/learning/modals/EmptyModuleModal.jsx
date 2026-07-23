import { useLearning } from '../hooks/useLearning.js';
import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { getArboritoStore } from '../../../core/store-singleton.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { MODAL_CTA_CANCEL, modalCtaConfirmFull } from '../../../shared/ui/modal-action-chrome.js';

function canShowCreateLesson(learning) {
    if (!learning.constructionMode || !learning.activeSource) return false;
    if (!fileSystem.features.canWrite) return false;
    const src = learning.activeSource;
    return (
        src.type === 'branch' ||
        src.type === 'composed-tree' ||
        (src.url && src.url.startsWith('branch://')) ||
        (src.url && src.url.startsWith('tree://')) ||
        !!parseNostrTreeUrl(src.url || '') ||
        !!fileSystem.isLocalComposedTree?.()
    );
}

export function ModalEmptyModule() {
    const learning = useLearning();
    const { ui, dismissModal, setModal, modal } = learning;
    const mobile = shouldShowMobileUI();

    const node = modal?.node;
    const close = () => dismissModal();
    const showCreate = node ? canShowCreateLesson(learning) : false;

    const openSources = () => {
        close();
        setModal('sources');
    };

    const createLesson = async () => {
        if (!node?.id) return;
        close();
        const store = getArboritoStore();
        store.selectMobileNode?.(node.id);
        try {
            await store.handleGraphDockAction?.('new-file', { skipPrompt: true });
        } catch (e) {
            store.alert?.(
                (ui.graphErrorWithMessage || 'Error: {message}').replace(
                    '{message}',
                    e?.message || 'Could not create lesson.'
                )
            );
        }
    };

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={ui.emptyModuleTitle}
            subtitle={
                ui.emptyModuleConstructHint ||
                'In construction mode this is an empty folder: create a lesson so learners can open something.'
            }
            titleTruncate
            leadingIcon="🍂"
            tagClass="btn-close"
            onClose={close}
        />
    );

    const body = (
        <div className="arborito-dialog-body-block flex flex-col items-center text-center px-4 sm:px-6 pt-2 pb-2">
            <ChromeEmoji emoji="🍂" size={48} className="mb-3 opacity-90" />
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed m-0 mb-2">{ui.emptyModuleDesc}</p>
        </div>
    );

    const footer = (
        <div className="arborito-modal-footer shrink-0 px-4 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className={`arborito-action-row w-full ${mobile ? 'arborito-action-row--stack-mobile' : ''}`}>
                <button type="button" className={MODAL_CTA_CANCEL} onClick={close}>
                    {ui.cancel || 'Cancel'}
                </button>
                <button type="button" className={modalCtaConfirmFull('slate')} onClick={openSources}>
                    {ui.emptyModuleOpenSources || ui.noTreesBtnSources || 'Trees & libraries'}
                </button>
                {showCreate ? (
                    <button type="button" className={modalCtaConfirmFull('emerald')} onClick={() => void createLesson()}>
                        {ui.emptyModuleCreateLesson || ui.adminNewFile || 'Create first lesson'}
                    </button>
                ) : null}
            </div>
        </div>
    );

    const shellOpts = {
        rootFlags: 'arborito-modal--empty-module',
        enter: 'fade',
    };

    if (mobile) {
        return (
            <DockModalShell mobile hero={hero} footer={footer} shellOpts={shellOpts} onBackdropClick={close}>
                {body}
            </DockModalShell>
        );
    }

    return (
        <ModalCenteredShell hero={hero} footer={footer} sizeTier="COMPACT" shellOpts={shellOpts} onBackdropClick={close}>
            {body}
        </ModalCenteredShell>
    );
}
