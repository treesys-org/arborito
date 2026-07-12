#!/usr/bin/env node
/**
 * Regression checks for publish diff state (branch baseline vs draft).
 * Run: node scripts/test-publish-diff-state.mjs
 */
import assert from 'node:assert/strict';
import {
    resolvePublishDiffLocalId,
    computePublishDiffState,
} from '../src/features/publishing/api/publish-diff-state.js';

const userStore = {
    state: {
        branches: [
            {
                id: 'b1',
                data: { id: 'root', children: [{ id: 'a', name: 'A' }] },
                publishedSnapshot: { id: 'root', children: [] },
            },
        ],
    },
};

assert.equal(resolvePublishDiffLocalId({ branchId: 'x' }, null), 'x');
assert.equal(resolvePublishDiffLocalId(null, { url: 'branch://b1' }), 'b1');
assert.equal(resolvePublishDiffLocalId(null, { url: 'nostr:tree' }), '');

const unchanged = computePublishDiffState(
    { branchId: 'b1' },
    { url: 'branch://b1' },
    userStore.state.branches[0].data,
    userStore
);
assert.equal(unchanged.noBaseline, false);
assert.equal(unchanged.noChanges, false);
assert.ok(unchanged.d.counts.added > 0);

const noBaseline = computePublishDiffState({ branchId: 'missing' }, null, { id: 'root' }, userStore);
assert.equal(noBaseline.noBaseline, true);
assert.equal(noBaseline.noChanges, false);

console.log('[test-publish-diff-state] OK');
