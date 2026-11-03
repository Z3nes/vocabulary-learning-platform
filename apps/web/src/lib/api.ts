import { appConfig } from '../config';

// The single place where the web app talks to the backend. UI components call
// typed functions from here instead of using fetch directly.

export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    message: string,
    readonly status: number,
    readonly code: string = 'UNKNOWN_ERROR',
  ) {
    super(message);
  }
}

/** Joins the configured API base path with a route path, e.g. "/health". */
export function apiUrl(path: string, basePath: string = appConfig.apiBasePath): string {
  return `${basePath.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function getJson(
  path: string,
  signal?: AbortSignal,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(apiUrl(path), {
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
    ...(signal ? { signal } : {}),
  });
  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
  if (!isJson) throw new ApiError('Beklenmeyen sunucu yanıtı', response.status);
  return { status: response.status, body: await response.json() };
}

export type DatabaseStatus = 'reachable' | 'unreachable' | 'not_configured';

export interface ServiceStatus {
  api: 'ok';
  database: DatabaseStatus;
}

const databaseStatuses: readonly string[] = ['reachable', 'unreachable', 'not_configured'];

function isDatabaseStatus(value: unknown): value is DatabaseStatus {
  return typeof value === 'string' && databaseStatuses.includes(value);
}

/** Reads the development health endpoints. Throws ApiError when the API is unreachable. */
export async function fetchServiceStatus(signal?: AbortSignal): Promise<ServiceStatus> {
  const live = await getJson('/health', signal);
  if (live.status !== 200) throw new ApiError('API yanıt vermiyor', live.status);

  const db = await getJson('/health/db', signal);
  const database = (db.body as { database?: unknown } | null)?.database;
  if (!isDatabaseStatus(database)) throw new ApiError('Beklenmeyen sunucu yanıtı', db.status);
  return { api: 'ok', database };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
export async function request(
  path: string,
  method: string,
  body?: object,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(apiUrl(path), {
    method,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  });
  if (response.status === 204 && response.ok) return undefined;
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new ApiError('Invalid API response', response.status);
  }
  if (!response.ok) {
    const code =
      isRecord(result) && isRecord(result['error']) && typeof result['error']['code'] === 'string'
        ? result['error']['code']
        : 'UNKNOWN_ERROR';
    throw new ApiError('API request failed', response.status, code);
  }
  return result;
}
