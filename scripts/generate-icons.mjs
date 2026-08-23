#!/usr/bin/env node
/**
 * Regenerates every raster icon in the repo from the SVG masters.
 *
 *   public/logo.svg                 the bare mark, transparent (in-app UI)
 *   public/icon.svg                 the mark on its badge (favicon, PWA, desktop)
 *   public/icons/icon-maskable.svg  full-bleed badge for Android maskable icons
 *
 * Rasterising is delegated to `tauri icon`, which already ships with this repo,
 * so regenerating icons needs no extra image tooling or dependency.
 *
 * Usage: npm run icons:generate
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

/** Sizes rendered from public/icon.svg for the web/PWA surfaces. */
const WEB_ICONS = [
    { size: 192, out: 'public/icons/icon-192.png' },
    { size: 512, out: 'public/icons/icon-512.png' },
    { size: 180, out: 'public/icons/apple-touch-icon.png' },
];

/**
 * `tauri icon` also emits Android/iOS icon sets and a 64x64 PNG. This project
 * bundles desktop targets only and src-tauri/tauri.conf.json never references
 * them, so they are dropped instead of being left untracked in the tree.
 */
const DESKTOP_EXTRAS = ['android', 'ios', '64x64.png'];

function tauriIcon(args) {
    execFileSync(npx, ['tauri', 'icon', ...args], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
}

function withTempDir(fn) {
    const dir = mkdtempSync(path.join(tmpdir(), 'saledge-icons-'));
    try {
        return fn(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

console.log('Generating desktop icons -> src-tauri/icons');
tauriIcon(['public/icon.svg']);
for (const extra of DESKTOP_EXTRAS) {
    rmSync(path.join(root, 'src-tauri/icons', extra), { recursive: true, force: true });
}

console.log('Generating web/PWA icons -> public/icons');
withTempDir((dir) => {
    tauriIcon(['public/icon.svg', '-o', dir, ...WEB_ICONS.flatMap(({ size }) => ['-p', String(size)])]);
    for (const { size, out } of WEB_ICONS) {
        copyFileSync(path.join(dir, `${size}x${size}.png`), path.join(root, out));
    }
});

console.log('Generating maskable icon -> public/icons/icon-maskable-512.png');
withTempDir((dir) => {
    tauriIcon(['public/icons/icon-maskable.svg', '-o', dir, '-p', '512']);
    copyFileSync(path.join(dir, '512x512.png'), path.join(root, 'public/icons/icon-maskable-512.png'));
});

console.log('Done.');
