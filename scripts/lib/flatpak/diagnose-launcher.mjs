#!/usr/bin/env node
/**
 * Diagnose why Arborito may be missing from GNOME Activities after Flatpak install.
 *
 * Flatpak icon/desktop layout (Freedesktop + Flatpak docs):
 *   In-app:  $FLATPAK/app/.../files/share/icons/hicolor/SIZExSIZE/apps/APPID.png
 *   Export:  $FLATPAK/app/.../active/export/share/icons/hicolor/...  (per-app)
 *   Host:    ~/.local/share/flatpak/exports/share/icons/hicolor/.../APPID.png  (symlinks)
 *
 *   node scripts/diagnose-flatpak-launcher.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { APP_ID, FLATPAK_ICON_SIZES } from '../flatpak.mjs';

const DESKTOP_NAME = `${APP_ID}.desktop`;

function run(cmd, args) {
    return spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe' });
}

function line(title, detail) {
    console.log(`${title}: ${detail}`);
}

function describePath(path) {
    if (!existsSync(path)) return 'MISSING';
    try {
        const st = lstatSync(path);
        if (st.isSymbolicLink()) return `symlink → ${readlinkSync(path)}`;
    } catch {
        /* ignore */
    }
    return 'present';
}

function iconPaths(root, relBase) {
    return FLATPAK_ICON_SIZES.map((size) =>
        join(root, relBase, 'icons', 'hicolor', `${size}x${size}`, 'apps', `${APP_ID}.png`),
    );
}

function perAppExportShare(flatpakRoot) {
    const current = join(flatpakRoot, 'app', APP_ID, 'current', 'active', 'export', 'share');
    if (existsSync(current)) return current;
    const stable = join(flatpakRoot, 'app', APP_ID, 'x86_64', 'stable', 'active', 'export', 'share');
    if (existsSync(stable)) return stable;
    return current;
}

function checkSymlinkChain(flatpakRoot) {
    const globalDesktop = join(flatpakRoot, 'exports/share/applications', DESKTOP_NAME);
    const perAppExport = perAppExportShare(flatpakRoot);
    const perAppDesktop = join(perAppExport, 'applications', DESKTOP_NAME);

    console.log(`\nSymlink chain (same model as org.videolan.VLC):`);
    line('  global export', globalDesktop);
    line('  global → target', describePath(globalDesktop));
    line('  per-app export/share', perAppExport);
    line('  per-app desktop', describePath(perAppDesktop));

    if (existsSync(globalDesktop) && lstatSync(globalDesktop).isSymbolicLink()) {
        const target = readlinkSync(globalDesktop);
        const resolved = target.startsWith('/') ? target : join(globalDesktop, '..', target);
        if (!existsSync(resolved) && !existsSync(join(flatpakRoot, 'exports/share/applications', target))) {
            console.log('  WARNING: global export symlink target does not resolve');
        }
    } else if (!existsSync(globalDesktop) && existsSync(perAppDesktop)) {
        console.log('  WARNING: per-app export exists but global exports/share symlink was not created (reinstall?)');
    } else if (!existsSync(perAppDesktop)) {
        console.log(' MISSING: active/export/share/ : bundle lacked export/ tree at install (needs rebundle-flatpak build)');
    }
}

function checkHostExports(label, flatpakRoot) {
    console.log(`\n${label} (${flatpakRoot}/exports/share/):`);
    const exportDesktop = join(flatpakRoot, 'exports/share/applications', DESKTOP_NAME);
    line('  applications/' + DESKTOP_NAME, describePath(exportDesktop));
    for (const icon of iconPaths(flatpakRoot, 'exports/share')) {
        line(`  ${icon.replace(flatpakRoot + '/exports/share/', '')}`, describePath(icon));
    }
    const iconCache = join(flatpakRoot, 'exports/share/icons/hicolor/icon-theme.cache');
    line('  icons/hicolor/icon-theme.cache', describePath(iconCache));
    return exportDesktop;
}

function main() {
    console.log(`[diagnose-flatpak-launcher] ${APP_ID}\n`);

    if (run('which', ['flatpak']).status !== 0) {
        console.log('flatpak CLI not found.');
        process.exit(1);
    }

    const info = run('flatpak', ['info', APP_ID]);
    if (info.status !== 0) {
        console.log('App not installed. Install with:');
        console.log('  flatpak install --user ./Arborito-*-x86_64.flatpak');
        process.exit(1);
    }
    line('installed', 'yes');

    const scopeUser = run('flatpak', ['info', '--user', APP_ID]).status === 0;
    const userRoot = join(homedir(), '.local/share/flatpak');
    const systemRoot = '/var/lib/flatpak';
    const flatpakRoot = scopeUser ? userRoot : systemRoot;
    line('scope', scopeUser ? 'user (~/.local/share/flatpak)' : 'system (/var/lib/flatpak)');

    const userDesktop = checkHostExports('User exports (flatpak install --user)', userRoot);
    const systemDesktop = checkHostExports('System exports (flatpak install without --user)', systemRoot);
    const exportDesktop = scopeUser ? userDesktop : systemDesktop;

    if (existsSync(exportDesktop)) {
        const text = readFileSync(exportDesktop, 'utf8');
        line('\nactive export Exec', (text.match(/^Exec=(.*)$/m) || [])[1] || '(missing)');
        line('active export Icon', (text.match(/^Icon=(.*)$/m) || [])[1] || '(missing)');
        if (run('which', ['desktop-file-validate']).status === 0) {
            const v = run('desktop-file-validate', [exportDesktop]);
            line('desktop-file-validate', v.status === 0 ? 'OK' : v.stderr || v.stdout);
        }
    } else {
        console.log('\n  GNOME Activities only sees apps with a .desktop under flatpak/exports/share/applications/.');
        console.log('  That symlink is created at install time from the bundle export/ tree (rebundle-flatpak.mjs).');
        if (scopeUser && !existsSync(userDesktop) && existsSync(systemDesktop)) {
            console.log(' Hint: app is user-scoped but only system exports exist : try flatpak install --user.');
        }
        if (!scopeUser && !existsSync(systemDesktop) && existsSync(userDesktop)) {
            console.log('  Hint: app is system-scoped but only user exports exist.');
        }
    }

    if (scopeUser) {
        checkSymlinkChain(userRoot);
    } else {
        checkSymlinkChain(systemRoot);
    }

    const loc = run('flatpak', ['info', '--show-location', APP_ID]);
    if (loc.status === 0) {
        const filesDir = loc.stdout.trim();
        const appRoot = join(filesDir, '..');
        line('\ninternal files dir', filesDir);

        const internalDesktop = join(filesDir, 'share/applications', DESKTOP_NAME);
        line('internal desktop', describePath(internalDesktop));

        console.log('\nIn-app icons (files/share/icons/hicolor/… = /app/share/icons/… in sandbox):');
        for (const icon of iconPaths(filesDir, 'share')) {
            line(`  ${icon.replace(filesDir + '/', '')}`, describePath(icon));
        }

        const perAppExport = join(appRoot, 'export/share');
        console.log('\nPer-app export tree (active/export/share/…):');
        line('  applications/' + DESKTOP_NAME, describePath(join(perAppExport, 'applications', DESKTOP_NAME)));
        for (const icon of iconPaths(appRoot, 'export/share')) {
            line(`  ${icon.replace(appRoot + '/export/share/', '')}`, describePath(icon));
        }
    }

    console.log('\nExpected XDG_DATA_DIRS entries (gnome-shell must include flatpak exports):');
    console.log(`  ${userRoot}/exports/share/`);
    console.log(`  ${systemRoot}/exports/share/`);

    const localDevDesktop = join(homedir(), '.local/share/applications', `${APP_ID}.desktop`);
    if (existsSync(localDevDesktop)) {
        try {
            const text = readFileSync(localDevDesktop, 'utf8');
            if (/^NoDisplay=true/m.test(text)) {
                console.log('\nWARNING: ~/.local/share/applications/org.treesys.arborito.desktop has NoDisplay=true');
                console.log('  This hides Flatpak from Activities This NoDisplay desktop entry hides Flatpak from Activities. Remove it:');
                console.log(`  rm ${localDevDesktop}`);
            }
        } catch {
            /* ignore */
        }
    }

    const xdg = process.env.XDG_DATA_DIRS || '(unset in this shell)';
    line('XDG_DATA_DIRS (shell)', xdg);

    const gs = run('bash', ['-lc', "pidof gnome-shell 2>/dev/null | awk '{print $1}'"]);
    const pid = gs.stdout.trim();
    if (pid) {
        const env = run('bash', ['-lc', `tr '\\0' '\\n' < /proc/${pid}/environ | grep ^XDG_DATA_DIRS= || true`]);
        line('XDG_DATA_DIRS (gnome-shell)', env.stdout.trim() || '(missing : Activities will not list Flatpaks)');
        if (env.stdout && !env.stdout.includes('flatpak/exports/share')) {
            console.log('\nLikely cause: gnome-shell is not seeing Flatpak export paths.');
            console.log('Fix: log out/in, or ensure /etc/profile.d/flatpak.sh runs in your session.');
            console.log('Silverblue: prefer  flatpak install --user  and reboot once after first install.');
        }
    } else {
        console.log('gnome-shell: not running in this environment (check XDG_DATA_DIRS on your desktop session).');
    }

    console.log('\nIf exported desktop/icons exist but Activities is stale:');
    console.log(`  update-desktop-database ${flatpakRoot}/exports/share/applications 2>/dev/null || true`);
    console.log(`  gtk-update-icon-cache -f -t ${flatpakRoot}/exports/share/icons/hicolor 2>/dev/null || true`);
    console.log('  flatpak trigger --user gtk-icon-cache 2>/dev/null || true');
    console.log('  Then log out and back in.');
}

main();
