// Pure path helpers shared by vite.config.ts (Node) and the browser bundle.
// Keep this file free of browser-only and Node-only APIs.

const SAFE_PATH = /^[A-Za-z0-9/_.~-]*$/;

function assertSafePath(value: string, name: string): void {
  if (!SAFE_PATH.test(value) || value.includes('..')) {
    throw new Error(`${name} must be a URL path using only letters, digits and "/_.~-".`);
  }
}

/**
 * Normalizes a deployment base path to "/segment/.../" form.
 * "" -> "/", "kelime" -> "/kelime/", "/kelime" -> "/kelime/".
 * Only paths are accepted: hosts and protocols are rejected so the app stays same-origin.
 */
export function normalizeBasePath(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  assertSafePath(trimmed, 'Base path');
  const segments = trimmed.split('/').filter(Boolean);
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`;
}

/**
 * Browser-facing API path (no trailing slash). Defaults to "<base>api" so the API
 * shares the app's origin and deployment prefix; an explicit override wins.
 */
export function resolveApiBasePath(basePath: string, override?: string): string {
  const explicit = override?.trim();
  if (explicit) return normalizeBasePath(explicit).replace(/\/$/, '') || '/';
  return `${normalizeBasePath(basePath)}api`;
}

/** React Router basename: the base path without its trailing slash ("/" stays "/"). */
export function toRouterBasename(basePath: string): string {
  const normalized = normalizeBasePath(basePath);
  return normalized === '/' ? '/' : normalized.slice(0, -1);
}
