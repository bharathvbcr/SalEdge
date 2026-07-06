import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ command }) => {
  // Compile-time gate for the dev/testing login helpers. On during `vite dev`
  // (command === 'serve') and for `npm run build:test` (which sets the env var
  // inline). A plain production `npm run build` leaves it false, so every
  // `__TEST_LOGIN__` guard folds to `if (false)` and esbuild tree-shakes the
  // entire testLogin module — seeded credentials and all — out of the bundle.
  const testLoginEnabled = command === 'serve' || process.env.VITE_ENABLE_TEST_LOGIN === 'true';

  return {
      clearScreen: false,
      define: {
        __TEST_LOGIN__: JSON.stringify(testLoginEnabled),
      },
      server: {
        port: 3000,
        strictPort: true,
        host: host || '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:3001',
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
      plugins: [react()],
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
