/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional browser-facing API path override; see apps/web/.env.example. */
  readonly VITE_API_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
