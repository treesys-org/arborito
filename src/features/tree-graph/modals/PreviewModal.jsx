import { useTreeGraph } from '../hooks/useTreeGraph.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { folderDisplayIcon } from '../api/node-property-emojis.js';
import { modalCtaConfirmFull } from '../../../shared/ui/modal-action-chrome.js';

export function ModalPreview() {
    const tree = useTreeGraph();
    const { ui, previewNode, isCompleted, closePreview, enterLesson } = tree;
    const node = previewNode;
    const mobile = shouldShowMobileUI();
    if (!node) return null;

    const complete = isCompleted(node.id);
    const rawIcon = node.icon || (node.type === 'exam' ? '⚔️' : node.type === 'branch' || node.type === 'root' ? '🗂️' : '📄');
    const btnText = complete ? ui.lessonFinished : ui.lessonEnter;
    const close = () => closePreview();

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={ui.lessonPreview || 'Preview'}
            leadingIcon="👁️"
            tagClass="btn-cancel"
            onClose={close}
        />
    );

    const body = (
        <div className="arborito-dialog-body-block p-6 sm:p-8 text-center">
            <div className="w-24 h-24 mx-auto bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center text-5xl mb-6 shadow-inner border border-slate-100 dark:border-slate-700/50 transform rotate-3">
                <ChromeEmoji
                    emoji={folderDisplayIcon(rawIcon)}
                    size={48}
                    className="arborito-emoji-glyph"
                />
            </div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-3 leading-tight">{node.name}</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-0 leading-relaxed text-sm max-w-[260px] mx-auto">
                {node.description || ui.noDescription}
            </p>
        </div>
    );

    const footer = (
        <div className="arborito-modal-footer shrink-0 px-4 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
                type="button"
                className={`btn-enter w-full ${modalCtaConfirmFull(complete ? 'emerald' : 'purple')}`}
                onClick={() => enterLesson()}
            >
                <span className="inline-flex items-center justify-center gap-2">
                    {complete ? (
                        <span aria-hidden="true">✓</span>
                    ) : (
                        <ChromeEmoji emoji="🚀" size={18} />
                    )}
                    {btnText}
                </span>
            </button>
        </div>
    );

    if (mobile) {
        return (
            <DockModalShell
                mobile
                layout="dock-bottom"
                hero={hero}
                footer={footer}
                shellOpts={{ rootFlags: 'arborito-modal--preview', enter: 'fade' }}
                panelClass="arborito-modal-dock-panel w-full max-h-[85vh]"
                onBackdropClick={close}
            >
                {body}
            </DockModalShell>
        );
    }

    return (
        <ModalCenteredShell
            hero={hero}
            footer={footer}
            sizeTier="STANDARD"
            shellOpts={{ rootFlags: 'arborito-modal--preview', enter: 'fade' }}
            onBackdropClick={close}
        >
            {body}
        </ModalCenteredShell>
    );
}
