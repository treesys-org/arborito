/** Published share code, one compact row, tap to copy / share. */
export function SourcesShareCodeField({
    ui,
    shareCode,
    shareOpts,
    loading = false,
    published = false,
    onShare,
    tone = 'emerald',
    className = '',
}) {
    if (!published) return null;

    const label = ui.sourcesShareCodeLabel || 'Code';
    const action = ui.sourcesShareCodeAction || 'Copy';
    const hint = ui.sourcesShareCodeTap || 'Tap to copy or share';
    const loadingLbl = ui.sourcesShareCodeLoading || ui.loading || '…';
    const toneCls = tone === 'violet' ? 'arborito-share-code--violet' : 'arborito-share-code--emerald';
    const code = String(shareCode || shareOpts?.shareCode || '').trim();

    if (loading && !code) {
        return (
            <div
                className={`arborito-share-code ${toneCls} arborito-share-code--loading ${className}`.trim()}
                aria-busy="true"
            >
                <span className="arborito-share-code__label">{label}</span>
                <span className="arborito-share-code__value">{loadingLbl}</span>
            </div>
        );
    }

    if (!code) return null;

    const opts = shareOpts || { shareCode: code, name: '', url: '', ownerPub: '', universeId: '' };

    return (
        <button
            type="button"
            className={`arborito-share-code ${toneCls} ${className}`.trim()}
            title={hint}
            aria-label={`${hint}: ${code}`}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onShare?.({ ...opts, shareCode: code });
            }}
        >
            <span className="arborito-share-code__label">{label}</span>
            <span className="arborito-share-code__value">{code}</span>
            <span className="arborito-share-code__action">{action}</span>
        </button>
    );
}

/** @deprecated Use SourcesShareCodeField */
export function SourcesShareCodeButton(props) {
    return <SourcesShareCodeField {...props} published />;
}
