#!/usr/bin/env node
/**
 * Downloads a pinned Node.js v22 runtime and places it where Tauri's
 * externalBin bundling expects it:
 *
 *   src-tauri/binaries/node-<rust-target-triple>[.exe]
 *
 * The packaged app spawns this runtime instead of whatever Node the end user
 * has installed, which keeps the better-sqlite3 binding ABI valid and removes
 * the "is Node installed?" failure mode entirely.
 *
 * Usage: node scripts/fetch-node-sidecar.mjs <rust-target-triple>
 *
 * NOTE: the major version here MUST stay in lockstep with actions/setup-node
 * (node-version: 22) in the workflows, because `npm rebuild better-sqlite3`
 * compiles the native binding against the setup-node toolchain.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const NODE_MAJOR = '22';

const TARGETS = {
    'aarch64-apple-darwin': { dist: 'darwin-arm64', ext: 'tar.gz' },
    'x86_64-apple-darwin': { dist: 'darwin-x64', ext: 'tar.gz' },
    'x86_64-pc-windows-msvc': { dist: 'win-x64', ext: 'zip' },
    'x86_64-unknown-linux-gnu': { dist: 'linux-x64', ext: 'tar.gz' },
};

const target = process.argv[2];
const spec = TARGETS[target];
if (!spec) {
    console.error(`Unsupported target "${target ?? '(none)'}". Supported: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
}

const index = await (await fetch('https://nodejs.org/dist/index.json')).json();
const version = index.find(entry => entry.version.startsWith(`v${NODE_MAJOR}.`))?.version;
if (!version) {
    console.error(`No Node v${NODE_MAJOR}.x release found upstream.`);
    process.exit(1);
}
console.log(`Fetching Node ${version} (${spec.dist}) for ${target}`);

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'saledge-sidecar-'));
const archive = path.join(stage, `pkg.${spec.ext}`);
const archiveBuf = Buffer.from(
    await (await fetch(`https://nodejs.org/dist/${version}/node-${version}-${spec.dist}.${spec.ext}`)).arrayBuffer()
);
fs.writeFileSync(archive, archiveBuf);

execFileSync('tar', ['-xf', archive, '-C', stage], { stdio: 'inherit' });

const outDir = path.resolve('src-tauri', 'binaries');
fs.mkdirSync(outDir, { recursive: true });
const isWindows = target.includes('windows');
const extractedBinary = path.join(
    stage,
    `node-${version}-${spec.dist}`,
    ...(isWindows ? ['node.exe'] : ['bin', 'node'])
);
const outBinary = path.join(outDir, `saledge-node-${target}${isWindows ? '.exe' : ''}`);
fs.copyFileSync(extractedBinary, outBinary);
fs.chmodSync(outBinary, 0o755);
fs.rmSync(stage, { recursive: true, force: true });
console.log(`Sidecar written to ${outBinary} (${(fs.statSync(outBinary).size / 1e6).toFixed(1)} MB)`);
