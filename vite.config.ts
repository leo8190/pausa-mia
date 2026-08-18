import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Subruta del sitio publicado. GitHub Pages sirve el repo bajo /pausa-mia/. */
const DEFAULT_BASE_PATH = '/pausa-mia/';

/**
 * Lee VITE_BASE_PATH del entorno sin depender de @types/node y normaliza las
 * barras, porque un base sin barra final rompe las rutas de los assets.
 */
function resolveBasePath(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  const raw = env?.VITE_BASE_PATH?.trim();
  if (!raw) return DEFAULT_BASE_PATH;

  const withLeadingSlash = raw.startsWith('/') || raw.startsWith('.') ? raw : `/${raw}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig({
  base: resolveBasePath(),
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.mjs'],
  },
});
