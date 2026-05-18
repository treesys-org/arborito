/**
 * Default operator / report address: not stored in plain text in the bundle (Base64 only).
 * Not cryptographic security; reduces trivial harvesting via repo grep.
 * Fork: set `operatorEscalationEmail` and/or `treeReportEmail` in locales to override.
 */
const _OP_EMAIL_B64 = 'c2FsZXNAdHJlZXN5cy5vcmc=';
const _OP_NAME_B64 = 'Q2FybG9zIFZhbGlu';
const _OP_PHONE_B64 = 'MCAyMSA1MSAvIDk3IDE4IDcyNw==';
const _OP_ADDRESS_B64 = 'T2JlcnN0ci4gMywgNDc4MjkgS3JlZmVsZA==';

export function getBuiltInOperatorEmail() {
    try {
        if (typeof atob === 'function') return atob(_OP_EMAIL_B64);
        if (typeof Buffer !== 'undefined') return Buffer.from(_OP_EMAIL_B64, 'base64').toString('utf8');
    } catch {
        /* ignore */
    }
    return '';
}

export function getBuiltInOperatorName() {
    try {
        if (typeof atob === 'function') return atob(_OP_NAME_B64);
        if (typeof Buffer !== 'undefined') return Buffer.from(_OP_NAME_B64, 'base64').toString('utf8');
    } catch {
        /* ignore */
    }
    return '';
}

export function getBuiltInOperatorPhone() {
    try {
        if (typeof atob === 'function') return atob(_OP_PHONE_B64);
        if (typeof Buffer !== 'undefined') return Buffer.from(_OP_PHONE_B64, 'base64').toString('utf8');
    } catch {
        /* ignore */
    }
    return '';
}

export function getBuiltInOperatorAddress() {
    try {
        if (typeof atob === 'function') return atob(_OP_ADDRESS_B64);
        if (typeof Buffer !== 'undefined') return Buffer.from(_OP_ADDRESS_B64, 'base64').toString('utf8');
    } catch {
        /* ignore */
    }
    return '';
}

function _trimMailto(s) {
    return String(s || '')
        .trim()
        .replace(/^mailto:/i, '');
}

/** Override from JSON: must look like an email (no `{…}` placeholder or text without `@`). */
function _validLocaleEmailOverride(raw) {
    const v = _trimMailto(raw);
    if (!v || !v.includes('@') || v.includes('{')) return '';
    return v;
}

/** `ui.operatorEscalationEmail` when set; otherwise decoded built-in value. */
export function resolveOperatorEscalationEmail(ui) {
    const v = _validLocaleEmailOverride(ui?.operatorEscalationEmail);
    return v || getBuiltInOperatorEmail();
}

/** `ui.treeReportEmail` when set; otherwise decoded built-in value. */
export function resolveTreeReportEmail(ui) {
    const v = _validLocaleEmailOverride(ui?.treeReportEmail);
    return v || getBuiltInOperatorEmail();
}

/** UI copy helper: first address defined in locales, or decoded built-in. */
export function resolveAnyOperatorEmailForDisplay(ui) {
    const o = _validLocaleEmailOverride(ui?.operatorEscalationEmail);
    if (o) return o;
    const t = _validLocaleEmailOverride(ui?.treeReportEmail);
    if (t) return t;
    return getBuiltInOperatorEmail();
}

/**
 * Replaces `{operatorEmail}`, `{operatorName}`, `{operatorPhone}` and `{operatorAddress}` in locale strings (impressum, disclaimers).
 * @param {string} text
 * @param {*} ui same `store.ui` object (i18n) so the address resolves consistently.
 */
export function injectOperatorEmailToken(text, ui) {
    const e = resolveAnyOperatorEmailForDisplay(ui);
    const n = ui?.operatorName || getBuiltInOperatorName();
    const p = ui?.operatorPhone || getBuiltInOperatorPhone();
    const a = ui?.operatorAddress || getBuiltInOperatorAddress();
    
    let s = String(text || '');
    s = s.replace(/\{operatorEmail\}/g, e);
    s = s.replace(/\{operatorName\}/g, n);
    s = s.replace(/\{operatorPhone\}/g, p);
    s = s.replace(/\{operatorAddress\}/g, a);
    return s;
}

