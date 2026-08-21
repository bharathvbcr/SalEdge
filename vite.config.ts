import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { PREFERRED_API_PORT, PREFERRED_FRONTEND_PORT } from './server/portUtils.ts';
import { patchDevRuntime, readDevRuntime } from './server/devRuntime.ts';

const host = process.env.TAURI_DEV_HOST;

function devRuntimePlugin(): Plugin {
    return {
        name: 'bsms-dev-runtime',
        configureServer(server) {
            server.httpServer?.once('listening', () => {
                const addr = server.httpServer?.address();
                const port = typeof addr === 'object' && addr ? addr.port : undefined;
                if (port) {
                    try {
                        patchDevRuntime({ frontendPort: port });
                    } catch { /* non-fatal */ }
                }
            });
        },
    };
}

function resolveApiProxyTarget(): string {
    const fromEnv = process.env.BSMS_API_PORT?.trim();
    if (fromEnv) return `http://127.0.0.1:${fromEnv}`;
    const fromRuntime = readDevRuntime()?.apiPort;
    if (fromRuntime) return `http://127.0.0.1:${fromRuntime}`;
    return `http://127.0.0.1:${PREFERRED_API_PORT}`;
}

export default defineConfig(({ command }) => {
  const testLoginEnabled = command === 'serve' || process.env.VITE_ENABLE_TEST_LOGIN === 'true';
  const preferredFrontendPort = Number(process.env.BSMS_FRONTEND_PORT) || readDevRuntime()?.frontendPort || PREFERRED_FRONTEND_PORT;

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
