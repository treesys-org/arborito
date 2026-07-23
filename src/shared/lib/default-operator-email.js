/**
 * Default operator / report address: not stored in plain text in the bundle (Base64 only).
 * Not cryptographic security; reduces trivial harvesting via repo grep.
 * Fork: set `operatorEscalationEmail` and/or `treeReportEmail` in locales to override.
 * Optional locale overrides for name/phone/address: `operatorName`, `operatorPhone`, `operatorAddress`
 * (must be real pack keys — ShellStore.ui humanizes missing keys into junk like "operator Name").
 */
const _OP_EMAIL_B64 = 'c3VwcG9ydEB0cmVlc3lzLm9yZw==';
const _OP_NAME_B64 = 'Q2FybG9zIFZhbGlu';
const _OP_PHONE_B64 = 'MCAyMSA1MSAvIDk3IDE4IDcyNw==';
const _OP_ADDRESS_B64 = 'T2JlcnN0ci4gMywgNDc4MjkgS3JlZmVsZA==';

function _decodeB64(b64) {
    try {
        if (typeof atob === 'function') return atob(b64);
        if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
    } catch {
        /* ignore */
    }
    return '';
}

function getBuiltInOperatorEmail() {
    return _decodeB64(_OP_EMAIL_B64);
}

export function getBuiltInOperatorName() {
    return _decodeB64(_OP_NAME_B64);
}

export function getBuiltInOperatorPhone() {
    return _decodeB64(_OP_PHONE_B64);
}

export function getBuiltInOperatorAddress() {
    return _decodeB64(_OP_ADDRESS_B64);
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

/**
 * Same humanize as `ShellStore.ui` Proxy for missing keys (`operatorName` → `operator Name`).
 * Those values must never be treated as intentional locale overrides.
 * @param {string} key
 */
function _humanizedMissingUiKey(key) {
    return String(key || '')
        .replace(/^nav/, '')
        .replace(/([A-Z])/g, ' $1')
        .trim();
}

/**
 * Locale text override for Impressum fields. Rejects empty, placeholders, and Proxy junk.
 * @param {unknown} raw
 * @param {string} key e.g. `operatorName`
 */
function _validLocaleTextOverride(raw, key) {
    const v = String(raw ?? '').trim();
    if (!v || v.includes('{')) return '';
    if (v === _humanizedMissingUiKey(key)) return '';
    return v;
}

/** UI copy helper: first address defined in locales, or decoded built-in. */
export function resolveAnyOperatorEmailForDisplay(ui) {
    const o = _validLocaleEmailOverride(ui?.operatorEscalationEmail);
    if (o) return o;
    const t = _validLocaleEmailOverride(ui?.treeReportEmail);
    if (t) return t;
    return getBuiltInOperatorEmail();
}

export function resolveOperatorNameForDisplay(ui) {
    return _validLocaleTextOverride(ui?.operatorName, 'operatorName') || getBuiltInOperatorName();
}

export function resolveOperatorPhoneForDisplay(ui) {
    return _validLocaleTextOverride(ui?.operatorPhone, 'operatorPhone') || getBuiltInOperatorPhone();
}

export function resolveOperatorAddressForDisplay(ui) {
    return _validLocaleTextOverride(ui?.operatorAddress, 'operatorAddress') || getBuiltInOperatorAddress();
}

/**
 * Replaces `{operatorEmail}`, `{operatorName}`, `{operatorPhone}` and `{operatorAddress}` in locale strings (impressum, disclaimers).
 * @param {string} text
 * @param {*} ui same `store.ui` object (i18n) so the address resolves consistently.
 */
export function injectOperatorEmailToken(text, ui) {
    const e = resolveAnyOperatorEmailForDisplay(ui);
    const n = resolveOperatorNameForDisplay(ui);
    const p = resolveOperatorPhoneForDisplay(ui);
    const a = resolveOperatorAddressForDisplay(ui);

    let s = String(text || '');
    s = s.replace(/\{operatorEmail\}/g, e);
    s = s.replace(/\{operatorName\}/g, n);
    s = s.replace(/\{operatorPhone\}/g, p);
    s = s.replace(/\{operatorAddress\}/g, a);
    return s;
}
