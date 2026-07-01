#!/usr/bin/env node
/**
 * Regression checks for Sage settings, chat routing, and context-strict mode.
 * Run: node scripts/test-sage-settings-logic.mjs
 */
import assert from 'node:assert/strict';
import {
    resolveSageContextStrict,
    writeSageContextStrict,
    resetSageContextStrictPref,
} from '../src/features/learning/api/sage-ai-prefs.js';
import { composeSageSystemContext } from '../src/features/learning/api/sage-prompts.js';

function shouldPartialUpdateChat({ chatArea, mode }) {
    return !!(chatArea && mode !== 'settings');
}

function renderRoute({ mode, sageAiMode, aiStatus, hasConsent }) {
    if (mode === 'settings') return 'settings';
    if (sageAiMode !== 'dynamic') return 'context';
    if (!hasConsent) return 'consent';
    if (aiStatus === 'loading') return 'loading';
    return 'chat';
}

function earlyReturnOverlay({ mode, sageAiMode, aiStatus, stateKey, lastRenderKey }) {
    if (stateKey !== lastRenderKey) return null;
    if (mode === 'settings') return 'settings-rerender';
    if (sageAiMode === 'dynamic' && aiStatus === 'loading') return 'loading-screen';
    return 'noop';
}

function normalizeSageModal(modal, patch = {}) {
    const base =
        modal == null
            ? {}
            : typeof modal === 'string'
              ? { type: modal }
              : { ...modal };
    return { ...base, type: 'sage', ...patch };
}

function isTrivialGreeting(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 40) return false;
    return /^(hola|hello|hi|hey|buenas|buenos días|buenas tardes|buenas noches|qué tal|que tal|saludos|howdy)[\s!.?,:;-]*$/iu.test(t);
}

assert.equal(shouldPartialUpdateChat({ chatArea: true, mode: 'settings' }), false);
assert.equal(shouldPartialUpdateChat({ chatArea: true, mode: 'context' }), true);

assert.equal(renderRoute({ mode: 'settings', sageAiMode: 'dynamic', aiStatus: 'ready', hasConsent: true }), 'settings');
assert.equal(
    earlyReturnOverlay({ mode: 'settings', sageAiMode: 'dynamic', aiStatus: 'loading', stateKey: 'x', lastRenderKey: 'x' }),
    'settings-rerender'
);
assert.equal(
    earlyReturnOverlay({ mode: 'context', sageAiMode: 'dynamic', aiStatus: 'loading', stateKey: 'x', lastRenderKey: 'x' }),
    'loading-screen'
);

const fromString = normalizeSageModal('sage', { mode: 'settings' });
assert.equal(fromString.type, 'sage');
assert.equal(fromString.mode, 'settings');
assert.equal(fromString[0], undefined);

assert.equal(isTrivialGreeting('hola'), true);
assert.equal(isTrivialGreeting('Hola!'), true);
assert.equal(isTrivialGreeting('Explain GNU/Linux'), false);

console.log('OK — sage settings routing checks passed');

const storage = new Map();
globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: (k) => { storage.delete(k); },
};

storage.clear();
assert.equal(resolveSageContextStrict(), true);
writeSageContextStrict(false);
assert.equal(resolveSageContextStrict(), false);
writeSageContextStrict(true);
assert.equal(resolveSageContextStrict(), true);
resetSageContextStrictPref();
assert.equal(resolveSageContextStrict(), true);

const noCtx = composeSageSystemContext({
    lang: 'ES',
    contextStrict: true,
    mode: 'sage-tree',
    contextBlock: '',
    lastMsg: '¿Qué es Docker?',
    modelLabel: 'Test',
    preset: 'minimal',
    isTrivialGreeting,
});
assert.match(noCtx, /no puedes responder sin contexto/i);
assert.match(noCtx, /NUNCA inventes/i);

const withCtx = composeSageSystemContext({
    lang: 'ES',
    contextStrict: true,
    mode: 'sage-tree',
    contextBlock: 'Lección: man --help',
    lastMsg: '¿Qué es Docker?',
    modelLabel: 'Test',
    preset: 'minimal',
    isTrivialGreeting,
});
assert.match(withCtx, /CONTEXTO:\nLección: man --help/);
assert.match(withCtx, /no lo sabes según el material cargado/i);

const relaxedCtx = composeSageSystemContext({
    lang: 'ES',
    contextStrict: false,
    mode: 'sage-tree',
    contextBlock: 'Lección: ls',
    lastMsg: '¿Qué es Docker?',
    modelLabel: 'Test',
    preset: 'minimal',
    isTrivialGreeting,
});
assert.doesNotMatch(relaxedCtx, /no lo sabes según el material cargado/i);
assert.match(relaxedCtx, /conocimiento general/i);

const hola = composeSageSystemContext({
    lang: 'ES',
    contextStrict: true,
    mode: 'sage-tree',
    contextBlock: '',
    lastMsg: 'hola',
    modelLabel: 'Test',
    preset: 'minimal',
    isTrivialGreeting,
});
assert.match(hola, /1-2 frases/i);

console.log('OK — sage context-strict checks passed');
