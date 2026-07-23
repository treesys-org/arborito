export function SourcesSocialMetrics({ ui, metrics }) {
    const votes = Number.isFinite(Number(metrics?.votes)) ? Number(metrics.votes) : null;
    const used7 = Number.isFinite(Number(metrics?.used7)) ? Number(metrics.used7) : null;
    const forks = Number.isFinite(Number(metrics?.forks)) ? Number(metrics.forks) : null;
    if (votes == null && used7 == null && forks == null) return null;

    const parts = [];
    if (votes != null) {
        parts.push(
            <span key="votes" title={ui.sourcesMetricLikes || 'Likes'}>
                💧 {votes.toLocaleString()} {ui.sourcesMetricLikesShort || 'likes'}
            </span>
        );
    }
    if (used7 != null) {
        parts.push(
            <span key="used7" title={ui.sourcesMetricInstalls || 'Installs'}>
                📥 {used7.toLocaleString()} {ui.sourcesMetricInstallsShort || 'installs'}
            </span>
        );
    }
    if (forks != null && forks > 0) {
        parts.push(
            <span key="forks" title={ui.sourcesMetricForks || 'Community copies'}>
                🔄 {forks.toLocaleString()} {ui.sourcesMetricForksShort || 'forks'}
            </span>
        );
    }
    if (!parts.length) return null;

    return (
        <p className="m-0 mt-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
            {parts}
        </p>
    );
}
