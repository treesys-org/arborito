import { useCallback } from 'react';

function b64Encode(s) {
    try {
        if (typeof btoa === 'function') {
            return btoa(unescape(encodeURIComponent(String(s || ''))));
        }
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(String(s || ''), 'utf8').toString('base64');
        }
    } catch {
        /* ignore */
    }
    return '';
}

/** Reversed-source email display with click-to-copy. */
export function ObfuscatedEmail({ email, copyLabel = 'Copy email address', copiedLabel = '✓ Copied', className = 'arb-obf-email' }) {
    const e = String(email || '');
    if (!e || !e.includes('@')) return <span>{e}</span>;

    const reversed = e.split('').reverse().join('');
    const b64 = b64Encode(e);

    const copy = useCallback(async (el) => {
        let decoded = '';
        try {
            if (typeof atob === 'function') {
                decoded = decodeURIComponent(escape(atob(b64)));
            } else if (typeof Buffer !== 'undefined') {
                decoded = Buffer.from(b64, 'base64').toString('utf8');
            }
        } catch {
            return;
        }
        if (!decoded) return;
        let ok = false;
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(decoded);
                ok = true;
            }
        } catch {
            /* fall through */
        }
        if (!ok) {
            try {
                const ta = document.createElement('textarea');
                ta.value = decoded;
                ta.setAttribute('readonly', '');
                ta.style.position = 'absolute';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                ok = true;
            } catch {
                /* ignore */
            }
        }
        if (!ok) {
            try {
                window.open(`mailto:${decoded}`, '_blank', 'noopener');
            } catch {
                /* ignore */
            }
            return;
        }
        const original = el.textContent;
        el.textContent = copiedLabel;
        el.classList.add('is-copied');
        setTimeout(() => {
            if (el.classList.contains('is-copied')) {
                el.textContent = original;
                el.classList.remove('is-copied');
            }
        }, 1400);
    }, [b64, copiedLabel]);

    return (
        <span
            className={className}
            data-eml-b64={b64}
            role="button"
            tabIndex={0}
            aria-label={copyLabel}
            title={copyLabel}
            onClick={(ev) => {
                ev.preventDefault();
                copy(ev.currentTarget);
            }}
            onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    copy(ev.currentTarget);
                }
            }}
        >
            {reversed}
        </span>
    );
}
