import { useTreeGraph } from '../hooks/useTreeGraph.js';
import { ModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { folderDisplayIcon } from '../api/node-property-emojis.js';

export function ModalPreview() {
    const tree = useTreeGraph();
    const { ui, previewNode, isCompleted, closePreview, enterLesson } = tree;
    const node = previewNode;
    if (!node) return null;

    const complete = isCompleted(node.id);
    const rawIcon = node.icon || (node.type === 'exam' ? '⚔️' : node.type === 'branch' || node.type === 'root' ? '🗂️' : '📄');
    const btnText = complete ? ui.lessonFinished : ui.lessonEnter;
    const btnClass = complete ? 'arborito-cta-green' : 'arborito-cta-purple';
    const close = () => closePreview();

    return (
        <ModalShell
            layout="centered"
            panelSize="standard auto-h"
            shellOpts={{ enter: 'fade' }}
        >
            <ModalHero
                ui={ui}
                title={ui.lessonPreview || 'Preview'}
                tagClass="btn-cancel"
                onClose={close}
            />
            <div className="p-8 text-center">
                <div className="w-24 h-24 mx-auto bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center text-5xl mb-6 shadow-inner border border-slate-100 dark:border-slate-700/50 transform rotate-3">
                    <ChromeEmoji
                        emoji={folderDisplayIcon(rawIcon)}
                        size={48}
                        className="arborito-emoji-glyph"
                    />
                </div>
                <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-3 leading-tight">{node.name}</h2>
                <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed text-sm max-w-[260px] mx-auto">
                    {node.description || ui.noDescription}
                </p>
                <div className="flex gap-3 justify-center w-full">
                    <button
                        type="button"
                        className={`btn-enter w-full py-4 rounded-2xl font-bold text-white shadow-xl shadow-purple-500/20 transition-transform active:scale-95 flex items-center justify-center gap-2 ${btnClass}`}
                        onClick={() => enterLesson()}
                    >
                        <span>{complete ? '✓' : '🚀'}</span> {btnText}
                    </button>
                </div>
            </div>
        </ModalShell>
    );
}
