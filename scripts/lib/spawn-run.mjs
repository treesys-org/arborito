import { spawnSync } from 'node:child_process';

const IS_WIN = process.platform === 'win32';

/** npm/npx and .bat/.cmd launchers need shell:true on Windows. */
export function spawnNeedsShell(cmd) {
    if (!IS_WIN) return false;
    const base = String(cmd).replace(/\\/g, '/').split('/').pop() || '';
    if (base === 'npm' || base === 'npx') return true;
    return /\.(bat|cmd)$/i.test(base);
}

export function spawnRun(cmd, args, opts = {}) {
    const shell = opts.shell ?? spawnNeedsShell(cmd);
    return spawnSync(cmd, args, { stdio: 'inherit', shell, ...opts });
}

export function spawnRunOrExit(cmd, args, opts = {}) {
    const r = spawnRun(cmd, args, opts);
    if (r.error) {
        console.error(`\n[spawn-run] ${cmd}: ${r.error.message}`);
        process.exit(1);
    }
    if (r.status !== 0) {
        console.error(`\n[spawn-run] failed: ${cmd} ${args.join(' ')}`);
        process.exit(r.status || 1);
    }
    return r;
}
