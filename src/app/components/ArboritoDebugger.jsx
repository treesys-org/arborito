import { useEffect, useState, useCallback } from 'react';
import { useShellStore } from '../hooks/useShell.js';

/**
 * Dev-only diagnostics overlay. Toggle with Ctrl/Cmd+Shift+D.
 *
 * Surfaces the things that silently break the shell with zero console errors:
 * the store data/source/path, the live width/height chain from #graph-container
 * up to <body>, and the active <html> layout classes. A 0px-wide ancestor or a
 * missing `arborito-desktop`/`arborito-shell-mobile` class is obvious at a glance.
 */
function measureChain(startId) {
    let el = document.getElementById(startId);
    const rows = [];
    while (el && el !== document.documentElement) {
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const cls = (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '')
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .join('.');
        rows.push({
            label: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}`,
            w: Math.round(b.width),
            h: Math.round(b.height),
            display: cs.display,
            zero: Math.round(b.width) === 0 || Math.round(b.height) === 0,
        });
        el = el.parentElement;
    }
    return rows;
}

function snapshot(shellStore) {
    const s = shellStore;
    const g = document.getElementById('mobile-tree-ui');
    const knots = document.getElementById('mobile-knots-container');
    return {
        data: !!s?.state?.data,
        dataId: s?.state?.data?.id ?? null,
        activeSource: s?.state?.activeSource?.id ?? null,
        treeHydrating: !!s?.state?.treeHydrating,
        error: s?.state?.error ?? null,
        mobilePath: s?.state?.graphUi?.mobilePath ?? null,
        revision: s?.state?.graphUi?.revision ?? null,
        constructionMode: !!s?.state?.constructionMode,
        viewMode: s?.state?.viewMode ?? null,
        uiVisibleClass: g ? g.classList.contains('visible') : false,
        uiDisplay: g ? getComputedStyle(g).display : 'no-element',
        knotCount: knots ? knots.childElementCount : -1,
        htmlClasses: document.documentElement.className,
        bodyClasses: document.body.className,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        chain: measureChain('graph-container'),
    };
}

export function ArboritoDebugger() {
    const shellStore = useShellStore();
    const [open, setOpen] = useState(false);
    const [snap, setSnap] = useState(null);

    const refresh = useCallback(() => setSnap(snapshot(shellStore)), [shellStore]);

    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
                e.preventDefault();
                setOpen((v) => !v);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        refresh();
        const onChange = () => refresh();
        shellStore.addEventListener('state-change', onChange);
        window.addEventListener('arborito-viewport', onChange);
        window.addEventListener('resize', onChange);
        const t = setInterval(refresh, 1000);
        return () => {
            shellStore.removeEventListener('state-change', onChange);
            window.removeEventListener('arborito-viewport', onChange);
            window.removeEventListener('resize', onChange);
            clearInterval(t);
        };
    }, [open, refresh, shellStore]);

    if (!open || !snap) return null;

    const badge = (ok) => (ok ? '#22c55e' : '#ef4444');
    const layoutBroken = snap.chain.some((r) => r.zero);
    const noShellClass =
        !snap.htmlClasses.includes('arborito-desktop') &&
        !snap.htmlClasses.includes('arborito-shell-mobile');

    return (
        <div
            style={{
                position: 'fixed',
                top: 8,
                right: 8,
                zIndex: 2147483647,
                width: 360,
                maxHeight: '92vh',
                overflow: 'auto',
                background: 'rgba(2,6,23,0.94)',
                color: '#e2e8f0',
                font: '11px/1.45 ui-monospace, monospace',
                border: '1px solid #334155',
                borderRadius: 10,
                padding: 12,
                boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ color: '#5eead4' }}>Arborito Debugger</strong>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={refresh} style={btn}>↻</button>
                    <button onClick={() => console.log('[ArboritoDebugger]', snapshot(shellStore))} style={btn}>log</button>
                    <button onClick={() => setOpen(false)} style={btn}>✕</button>
                </div>
            </div>

            {(layoutBroken || noShellClass) && (
                <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '6px 8px', borderRadius: 6, marginBottom: 8 }}>
                    {layoutBroken && <div>⚠ Un ancestro del grafo tiene 0px (layout colapsado).</div>}
                    {noShellClass && <div>⚠ Falta clase de shell (arborito-desktop / arborito-shell-mobile).</div>}
                </div>
            )}

            <Row k="data" v={String(snap.data)} c={badge(snap.data)} />
            <Row k="dataId" v={String(snap.dataId)} />
            <Row k="activeSource" v={String(snap.activeSource)} />
            <Row k="treeHydrating" v={String(snap.treeHydrating)} />
            <Row k="error" v={String(snap.error)} c={snap.error ? badge(false) : undefined} />
            <Row k="mobilePath" v={JSON.stringify(snap.mobilePath)} />
            <Row k="revision" v={String(snap.revision)} />
            <Row k="viewMode" v={String(snap.viewMode)} />
            <Row k="construction" v={String(snap.constructionMode)} />
            <Row k="ui.visible" v={String(snap.uiVisibleClass)} c={badge(snap.uiVisibleClass)} />
            <Row k="ui.display" v={snap.uiDisplay} />
            <Row k="knotCount" v={String(snap.knotCount)} c={badge(snap.knotCount > 0)} />
            <Row k="viewport" v={snap.viewport} />

            <div style={{ marginTop: 8, color: '#94a3b8' }}>html: {snap.htmlClasses}</div>
            <div style={{ color: '#94a3b8', marginBottom: 8 }}>body: {snap.bodyClasses}</div>

            <strong style={{ color: '#5eead4' }}>Layout chain (#graph-container → body)</strong>
            <div style={{ marginTop: 4 }}>
                {snap.chain.map((r, i) => (
                    <div key={i} style={{ color: r.zero ? '#fca5a5' : '#cbd5e1' }}>
                        {r.w}×{r.h} {r.display}, {r.label}
                    </div>
                ))}
            </div>
        </div>
    );
}

const btn = {
    background: '#1e293b',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: 6,
    padding: '2px 8px',
    cursor: 'pointer',
    font: 'inherit',
};

function Row({ k, v, c }) {
    return (
        <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ color: '#64748b', minWidth: 96 }}>{k}</span>
            <span style={{ color: c || '#e2e8f0', wordBreak: 'break-all' }}>{v}</span>
        </div>
    );
}
