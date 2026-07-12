#!/usr/bin/env node
/**
 * Regression checks for unified modal surface routing.
 * Run: node scripts/test-modal-surface-routing.mjs
 */
import assert from 'node:assert/strict';
import {
    resolveModalSurface,
    shouldRenderBrowseDockHubInPanel,
    shouldRenderConstructionDockHubInPanel,
    resolveBrowseDockHubChunkType,
} from '../src/app/modal-surface-routing.js';

function mobState(modal, extra = {}) {
    return { modal, viewMode: extra.viewMode, previewNode: extra.previewNode ?? null };
}

// --- browse dock hub ---

assert.equal(
    shouldRenderBrowseDockHubInPanel(mobState({ type: 'arcade', dockUi: true }), true),
    true
);
assert.equal(
    shouldRenderBrowseDockHubInPanel(mobState({ type: 'arcade' }), true),
    false,
    'arcade string loses dockUi'
);
assert.equal(
    shouldRenderBrowseDockHubInPanel(mobState({ type: 'arcade', dockUi: true, fromMobileMore: true }), true),
    false,
    'fromMobileMore uses ModalHost takeover'
);
assert.equal(
    shouldRenderBrowseDockHubInPanel(mobState({ type: 'forum' }), true),
    true
);
assert.equal(
    shouldRenderBrowseDockHubInPanel(mobState({ type: 'search', dockUi: true }), true),
    true
);
assert.equal(
    resolveBrowseDockHubChunkType(mobState(null, { viewMode: 'certificates' }), true),
    'certificates'
);

// --- construction dock hub (no DOM — returns false without construction-mobile class) ---

assert.equal(
    shouldRenderConstructionDockHubInPanel(mobState({ type: 'construction-history' })),
    false,
    'construction hub needs construction-mobile html class'
);

// --- construction dock hub with mocked DOM class ---

const doc = globalThis.document;
const html = doc?.documentElement;
const hadConstruction = html?.classList.contains('arborito-construction-mobile');
if (html) html.classList.add('arborito-construction-mobile');
try {
    assert.equal(
        shouldRenderConstructionDockHubInPanel(mobState({ type: 'construction-about' })),
        true,
        'construction-about routes to dock panel in construction mode'
    );
    assert.equal(
        shouldRenderConstructionDockHubInPanel(mobState({ type: 'construction-curriculum-lang' })),
        true,
        'curriculum lang routes to dock panel in construction mode'
    );
    assert.equal(
        resolveModalSurface(mobState({ type: 'construction-history' }), false),
        'modal-host',
        'desktop construction hubs use ModalHost (centered shell)'
    );
    assert.equal(
        resolveModalSurface(mobState({ type: 'construction-history' }), true),
        'construction-dock-hub',
        'mobile construction hubs use dock panel'
    );
} finally {
    if (html) {
        if (!hadConstruction) html.classList.remove('arborito-construction-mobile');
    }
}

// --- resolveModalSurface ---

assert.equal(resolveModalSurface(mobState('sage'), true), 'sage');
assert.equal(resolveModalSurface(mobState({ type: 'arcade', dockUi: true }), true), 'browse-dock-hub');
assert.equal(resolveModalSurface(mobState({ type: 'sources' }), true), 'modal-host');
assert.equal(resolveModalSurface(mobState(null), true), 'none');
assert.equal(
    resolveModalSurface(mobState(null, { previewNode: { id: 'n1' } }), false),
    'modal-host'
);

console.log('test-modal-surface-routing: ok');
