import { resolveApiBasePath, toRouterBasename } from './lib/paths';

// Runtime configuration derived from build-time environment. No hosts are
// hard-coded: every URL is a path on the page's own origin.
const basePath = import.meta.env.BASE_URL;

export const appConfig = {
  routerBasename: toRouterBasename(basePath),
  apiBasePath: resolveApiBasePath(basePath, import.meta.env.VITE_API_BASE_PATH),
} as const;
