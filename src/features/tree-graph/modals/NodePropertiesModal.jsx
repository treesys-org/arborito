import { useTreeGraph } from '../hooks/useTreeGraph.js';
import { useEffect, useState } from 'react';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { getNodeMetaTargetPath, persistNodeMetaProperties } from '../api/node-meta-persist.js';
import { NODE_PROPERTY_EMOJIS, folderDisplayIcon } from '../api/node-property-emojis.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { ModalHero } from '../../../app/components/ModalHero.jsx';
import { LoadingBrand, LoadingButtonContent } from '../../../shared/ui/Loading.jsx';

export function ModalNodeProperties() {
    const tree = useTreeGraph();
    const { ui, dismissModal, notify, alert, lang, modal, activeSource, loadData } = tree;
    const node = modal?.node;
    const [name, setName] = useState(node?.name ?? '');
    const [icon, setIcon] = useState(node?.icon || '📄');
    const [description, setDescription] = useState(node?.description || '');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [originalBody, setOriginalBody] = useState('');
    const [originalMeta, setOriginalMeta] = useState({});

    useEffect(() => {
        document.documentElement.classList.add('arborito-node-properties-modal-open');
        return () => {
            document.documentElement.classList.remove('arborito-node-properties-modal-open');
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function loadData() {
            const targetPath = getNodeMetaTargetPath(node, lang);

            if (!targetPath) {
                if (node.type === 'branch' || node.type === 'root') {
                    if (!cancelled) {
                        setOriginalMeta({});
                        setOriginalBody('');
                        setName(node.name);
                        setIcon(node.icon || '📄');
                        setDescription(node.description || '');
                        setLoading(false);
                    }
                    return;
                }
                const parsed = parseArboritoFile(node.content || '');
                if (!cancelled) {
                    setOriginalBody(parsed.body || '');
                    setOriginalMeta(parsed.meta || {});
                    setName(node.name);
                    setIcon(node.icon || '📄');
                    setDescription(node.description || '');
                    setLoading(false);
                }
                return;
            }

            try {
                const fileData = await fileSystem.getFile(node.id, targetPath);
                if (cancelled) return;
                setOriginalBody(fileData.body || '');
                setOriginalMeta(fileData.meta || {});
                setName(fileData.meta.title || node.name);
                setIcon(fileData.meta.icon || node.icon || '📄');
                setDescription(fileData.meta.description || node.description || '');
            } catch (e) {
                console.warn(`[NodeProperties] Could not load ${targetPath}. Using graph data.`, e);
                const parsed = parseArboritoFile(node.content || '');
                if (!cancelled) {
                    setOriginalBody(
                        node.type === 'branch' || node.type === 'root' ? '' : parsed.body || ''
                    );
                    setOriginalMeta(parsed.meta || {});
                    setName(node.name);
                    setIcon(node.icon || '📄');
                    setDescription(node.description || '');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void loadData();
        return () => {
            cancelled = true;
        };
    }, [node]);

    const close = () => dismissModal();

    const save = async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            notify(
                ui.lessonNameRequired || ui.graphPromptLessonName || 'Name is required.',
                true
            );
            return;
        }

        setSaving(true);
        try {
            await persistNodeMetaProperties(
                { fileSystem, store: { value: { lang, activeSource }, loadData } },
                { node, name: trimmed, icon, description, originalMeta, originalBody }
            );
            setSaving(false);
            setSaved(true);
            setTimeout(() => close(), 800);
        } catch (e) {
            alert(
                (ui.nodePropertiesSaveError || 'Error saving properties: {message}').replace(
                    '{message}',
                    e.message
                )
            );
            setSaving(false);
        }
    };

    if (!node) return null;

    if (loading) {
        return (
            <div data-arborito-panel="modal-node-properties">
            <ModalCenteredShell
                refKey="modal-node-properties"
                layout="centered"
                bareBackdrop
                shellOpts={{ scrim: 'black', enter: 'fade-fast', bareBackdrop: true }}
            >
                <div
                    className="flex flex-1 flex-col items-center justify-center gap-3 min-h-0"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                >
                    <LoadingBrand label="" size="boot" tone="slate" extraClass="arborito-loading-brand--compact" />
                </div>
            </ModalCenteredShell>
            </div>
        );
    }

    const saveBtnContent = saved ? (
        <>
            <span>✅</span> Saved
        </>
    ) : saving ? (
        <LoadingButtonContent label="Saving..." />
    ) : (
        <>
            <span>💾</span> Save Changes
        </>
    );

    const saveBtnClass = saved
        ? 'arborito-cta-emerald opacity-90 cursor-default'
        : saving
          ? 'bg-purple-400 text-white cursor-wait'
          : 'arborito-cta-purple active:scale-95';

    const hero = (
        <ModalHero
            ui={ui}
            title="Node Properties"
            backTagClass="btn-nodep-back"
            closeTagClass="btn-nodep-x"
            onBack={close}
            onClose={close}
        />
    );

    const footer = (
        <div className="arborito-modal-footer arborito-modal-footer--bg-flat">
            <div className="arborito-action-row">
                <button
                    type="button"
                    className="btn-nodep-cancel py-3 text-slate-500 dark:text-slate-400 font-bold text-sm hover:text-slate-800 dark:hover:text-white transition-colors"
                    disabled={saving || saved}
                    onClick={close}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    id="btn-save"
                    className={`py-3 font-bold rounded-xl shadow-lg transition-all text-sm flex items-center justify-center gap-2 ${saveBtnClass}`}
                    disabled={saving || saved}
                    onClick={save}
                >
                    {saveBtnContent}
                </button>
            </div>
        </div>
    );

    return (
        <div data-arborito-panel="modal-node-properties">
        <ModalCenteredShell
            refKey="modal-node-properties"
            layout="centered"
            sizeTier="STANDARD"
            hero={hero}
            footer={footer}
            shellOpts={{ panelClass: 'transition-all duration-300' }}
        >
            <div className="p-6 space-y-4 arborito-mob-scroll-pane custom-scrollbar">
                <div className="flex gap-3">
                    <div className="relative group">
                        <button
                            type="button"
                            className="w-12 h-12 text-2xl bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            title="Change Icon"
                        >
                            <ChromeEmoji emoji={folderDisplayIcon(icon)} className="arborito-emoji-glyph" />
                        </button>
                        <div className="hidden group-hover:flex absolute top-14 left-0 w-64 bg-white dark:bg-slate-800 shadow-xl rounded-xl border border-slate-200 dark:border-slate-700 p-2 flex-wrap gap-1 z-50">
                            {NODE_PROPERTY_EMOJIS.map((e) => (
                                <button
                                    key={e}
                                    type="button"
                                    className="btn-emoji w-8 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-lg"
                                    data-emoji={e}
                                    onClick={() => setIcon(e)}
                                >
                                    <ChromeEmoji emoji={e} className="arborito-emoji-glyph" />
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                            Name
                        </label>
                        <input
                            id="inp-name"
                            type="text"
                            className="arborito-input arborito-input--compact font-bold"
                            value={name}
                            disabled={saving || saved}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                        Description
                    </label>
                    <textarea
                        id="inp-desc"
                        className="arborito-input arborito-textarea h-24 resize-none"
                        disabled={saving || saved}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>
            </div>
        </ModalCenteredShell>
        </div>
    );
}
