import path from 'path';
import fs from 'fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { PREFERRED_API_PORT, PREFERRED_FRONTEND_PORT } from './server/portUtils.ts';

const host = process.env.TAURI_DEV_HOST;
const RUNTIME_FILE = path.resolve(__dirname, '.bsms-dev/runtime.json');

function readRuntime(): { apiPort?: number; frontendPort?: number } {
    try {
        return JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function patchRuntimeFrontendPort(port: number): void {
    try {
        const existing = readRuntime();
        fs.mkdirSync(path.dirname(RUNTIME_FILE), { recursive: true });
        fs.writeFileSync(RUNTIME_FILE, JSON.stringify({
            ...existing,
            frontendPort: port,
            updatedAt: new Date().toISOString(),
        }, null, 2));
    } catch { /* non-fatal */ }
}

function devRuntimePlugin(): Plugin {
    return {
        name: 'bsms-dev-runtime',
        configureServer(server) {
            server.httpServer?.once('listening', () => {
                const addr = server.httpServer?.address();
                const port = typeof addr === 'object' && addr ? addr.port : undefined;
                if (port) patchRuntimeFrontendPort(port);
            });
        },
    };
}

function resolveApiProxyTarget(): string {
    const fromEnv = process.env.BSMS_API_PORT?.trim();
    if (fromEnv) return `http://127.0.0.1:${fromEnv}`;
    const fromRuntime = readRuntime().apiPort;
    if (fromRuntime) return `http://127.0.0.1:${fromRuntime}`;
    return `http://127.0.0.1:${PREFERRED_API_PORT}`;
}

export default defineConfig(({ command }) => {
  const testLoginEnabled = command === 'serve' || process.env.VITE_ENABLE_TEST_LOGIN === 'true';
  const preferredFrontendPort = Number(process.env.BSMS_FRONTEND_PORT) || readRuntime().frontendPort || PREFERRED_FRONTEND_PORT;

  return {
      clearScreen: false,
      define: {
        __TEST_LOGIN__: JSON.stringify(testLoginEnabled),
      },
      server: {
        port: preferredFrontendPort,
        strictPort: false,
        host: host || '0.0.0.0',
        proxy: {
          '/api': {
            target: resolveApiProxyTarget(),
            changeOrigin: true,
          },
        },
        hmr: host
          ? { protocol: 'ws', host, port: 1421 }
          : undefined,
        watch: {
          ignored: ['**/src-tauri/**'],
        },
      },
      envPrefix: ['VITE_', 'TAURI_ENV_'],
      plugins: [
        react(),
        ...(host ? [] : [basicSsl(), devRuntimePlugin()]),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        target: process.env.TAURI_ENV_PLATFORM === 'windows'
          ? 'chrome105'
          : 'safari13',
        minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
        sourcemap: !!process.env.TAURI_ENV_DEBUG,
      },
  };
});
