import { gateShellBuildOrContinue, installStaleChunkReloadGuard } from './shared/lib/shell-build-refresh.js';

installStaleChunkReloadGuard();

if (!(await gateShellBuildOrContinue())) {
    /* Navigation to the fresh deploy is in flight — do not mount the stale shell. */
    await new Promise(() => {});
}

await import('./app-boot.jsx');
