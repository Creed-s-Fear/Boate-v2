/** Game API client (same origin; session cookie is httpOnly). */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 12_000;

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`./api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new ApiError(typeof data.error === 'string' ? data.error : `Error ${res.status}`, res.status, data);
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('No connection to the server.', 0);
  } finally {
    clearTimeout(timer);
  }
}

export interface Me {
  username: string;
  balance: number;
  vip: boolean;
}

export interface WalletInfo {
  address: string;
  cluster: string;
  fichasPerSol: number;
  balance: number;
  deposits: Array<{ signature: string; sol: number; fichas: number; at: string }>;
}

export const api = {
  me: () => call<Me>('GET', '/me'),
  register: (username: string, password: string) => call<{ username: string }>('POST', '/auth/register', { username, password }),
  login: (username: string, password: string) => call<{ username: string }>('POST', '/auth/login', { username, password }),
  logout: () => call<{ ok: true }>('POST', '/auth/logout', {}),
  wallet: () => call<WalletInfo>('GET', '/wallet'),
  refresh: () => call<{ credited: number; balance: number }>('POST', '/wallet/refresh', {}),
  spend: (item: string, requestId: string) => call<{ balance: number }>('POST', '/shop/spend', { item, requestId }),
  danceReward: () => call<{ prize: number; balance: number }>('POST', '/reward/dance', {}),
  health: () => call<{ ok: boolean; cluster: string }>('GET', '/health'),
};
