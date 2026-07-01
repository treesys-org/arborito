export function safeHttpUrl(raw) {
    const s = String(raw != null ? raw : '').trim();
    if (!s) return '';
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s);
    if (!hasScheme) {
        if (s.startsWith('//')) return '';
        if (/[\u0000-\u001F\u007F]/.test(s)) return '';
        return s;
    }
    try {
        const u = new URL(s);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
        if (u.username || u.password) return '';
        return u.toString();
    } catch {
        return '';
    }
}
