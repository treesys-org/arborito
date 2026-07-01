/** Delete-tree confirm overlay inside sources modal. */
export function SourcesDeleteOverlay({ ui, onCancel, onConfirm }) {
    return (
        <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 flex items-center justify-center z-[200] rounded-3xl pointer-events-auto animate-in fade-in">
            <div className="w-full max-w-xs text-center px-2">
                <div className="text-4xl mb-4">⚠️</div>
                <h3 className="text-xl font-black mb-2 dark:text-white">{ui.deleteTreeConfirm}</h3>
                <div className="arborito-action-row">
                    <button
                        type="button"
                        className="arborito-cta-slate py-3 min-h-[44px] rounded-xl font-bold text-xs uppercase"
                        onClick={onCancel}
                    >
                        {ui.cancel}
                    </button>
                    <button
                        type="button"
                        className="arborito-cta-rose py-3 min-h-[44px] rounded-xl font-bold text-xs uppercase shadow-lg hover:scale-105 transition-transform active:scale-[0.98]"
                        onClick={onConfirm}
                    >
                        {ui.sourceRemove}
                    </button>
                </div>
            </div>
        </div>
    );
}
