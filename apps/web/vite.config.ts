import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { normalizeBasePath, resolveApiBasePath } from './src/lib/paths.ts';

// Base paths only contain [A-Za-z0-9/_.~-] (validated in paths.ts); "." is the
// only regular-expression metacharacter among them.
const escapeRegExp = (value: string) => value.replaceAll('.', '\\.');

export default defineConfig(({ mode }) => {
  // Loads apps/web/.env* files. Only VITE_* values reach the browser bundle.
  const env = loadEnv(mode, import.meta.dirname, '');

  const base = normalizeBasePath(env['VITE_BASE_PATH']);
  const apiPath = resolveApiBasePath(base, env['VITE_API_BASE_PATH']);

  // Development proxy: browser requests to `${apiPath}/*` are forwarded to the
  // Fastify server and rewritten to its API_PREFIX, so the browser only ever
  // talks to one origin. Not used by production builds.
  const devApiTarget = env['DEV_API_TARGET'] || 'http://127.0.0.1:3000';
  const devApiPrefix = normalizeBasePath(env['DEV_API_PREFIX'] || '/api').replace(/\/$/, '');

  return {
    base,
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        [`^${escapeRegExp(apiPath)}(?=/|$)`]: {
          target: devApiTarget,
          changeOrigin: false,
          rewrite: (path) => devApiPrefix + path.slice(apiPath.length),
        },
      },
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
    },
  };
});
