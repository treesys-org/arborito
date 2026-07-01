#!/usr/bin/env node
/**
 * Smoke: care-reminders accepts legacy singleton shape and Zustand hook facade.
 */
import { getCareDueNodeIds, countCareDue, getStoreTreeRoot } from '../src/features/garden-progress/api/care-reminders.js';

function assert(cond, msg) {
    if (!cond) {
        console.error(`[test-care-reminders-access] FAIL: ${msg}`);
        process.exit(1);
    }
}

const legacy = {
    state: { data: { id: 'r', type: 'root', children: [] } },
    userStore: { getDueNodes: () => [] },
};

const facade = {
    data: { id: 'r', type: 'root', children: [] },
    userStore: { getDueNodes: () => [] },
};

assert(getStoreTreeRoot(legacy)?.id === 'r', 'legacy store.state.data');
assert(getStoreTreeRoot(facade)?.id === 'r', 'facade flat data');
assert(countCareDue(legacy) === 0, 'legacy countCareDue');
assert(countCareDue(facade) === 0, 'facade countCareDue');
assert(getCareDueNodeIds(null).length === 0, 'null store safe');

console.log('[test-care-reminders-access] All checks passed.');
