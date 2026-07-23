import { closeSourcesModal } from '../sources-actions-support.js';
import { runForestAction } from './forest.js';
import { runBranchesAction } from './branches.js';
import { runPublishAction } from './publish.js';

export { closeSourcesModal };

/** Run a sources modal action (port of sources-action-dispatch-mixin). */
export async function runSourcesAction(ctx, action, fields = {}) {
    if (await runForestAction(ctx, action, fields)) return;
    if (await runBranchesAction(ctx, action, fields)) return;
    await runPublishAction(ctx, action, fields);
}
