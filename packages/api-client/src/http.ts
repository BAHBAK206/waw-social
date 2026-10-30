import type { AuthResult, Me } from '@qubedu/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetwork() {
    return this.status === 0;
  }
}

export interface TokenStore {
  /** Mobile only: persists the refresh token (web uses an httpOnly cookie). */
  getRefreshToken?(): Promise<string | null>;
  setRefreshToken?(token: string | null): Promise<void>;
}

export interface ClientOptions {
  baseUrl: string;
  platform: 'web' | 'mobile';
  tokenStore?: TokenStore;
  language?: () => string;
  onAuthChange?: (user: Me | null) => void;
  fetchImpl?: typeof fetch;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  /** Skip auth header + refresh (used by auth endpoints). */
  anonymous?: boolean;
  raw?: boolean;
}

/** Fetch wrapper: bearer auth, transparent refresh with single-flight, typed errors. */
export class HttpClient {
  private accessToken: string | null = null;
  private accessExpiresAt = 0;
  private refreshing: Promise<boolean> | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(readonly options: ClientOptions) {
    this.fetchImpl = options.fetchImpl ?? ((...a) => fetch(...a));
  }

  get token(): string | null {
    return this.accessToken;
  }

  url(path: string, query?: Query): string {
    const base = this.options.baseUrl.replace(/\/$/, '');
    const qs = query
      ? Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    return `${base}/api/v1${path}${qs ? `?${qs}` : ''}`;
  }

  /** Stores tokens from an auth response. */
  async acceptAuth(result: AuthResult): Promise<Me> {
    this.accessToken = result.accessToken;
    this.accessExpiresAt = result.accessTokenExpiresAt;
    if (this.options.platform === 'mobile' && result.refreshToken) await this.options.tokenStore?.setRefreshToken?.(result.refreshToken);
    this.options.onAuthChange?.(result.user);
    return result.user;
  }

  async clearAuth(): Promise<void> {
    this.accessToken = null;
    this.accessExpiresAt = 0;
    if (this.options.platform === 'mobile') await this.options.tokenStore?.setRefreshToken?.(null);
    this.options.onAuthChange?.(null);
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { 'x-requested-with': 'qubedu', ...extra };
    if (this.options.platform === 'mobile') h['x-client'] = 'mobile';
    const lang = this.options.language?.();
    if (lang) h['accept-language'] = lang;
    return h;
  }

  /** Refreshes the access token once even when many requests need it at the same time. */
  refresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        try {
          let body: string | undefined;
          if (this.options.platform === 'mobile') {
            const rt = await this.options.tokenStore?.getRefreshToken?.();
            if (!rt) return false;
            body = JSON.stringify({ refreshToken: rt });
          }
          const res = await this.fetchImpl(this.url('/auth/refresh'), {
            method: 'POST',
            headers: this.headers(body ? { 'content-type': 'application/json' } : {}),
            body,
            credentials: 'include',
          });
          if (!res.ok) {
            if (res.status === 401 || res.status === 403) await this.clearAuth();
            return false;
          }
          await this.acceptAuth((await res.json()) as AuthResult);
          return true;
        } catch {
          return false;
        } finally {
          setTimeout(() => (this.refreshing = null), 0);
        }
      })();
    }
    return this.refreshing;
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    if (!opts.anonymous && this.accessToken && Date.now() > this.accessExpiresAt - 30_000) await this.refresh();
    const send = async () => {
      const headers = this.headers(opts.body !== undefined ? { 'content-type': 'application/json' } : {});
      if (!opts.anonymous && this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;
      return this.fetchImpl(this.url(path, opts.query), {
        method,
        headers,
        body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
        signal: opts.signal,
        credentials: 'include',
      });
    };
    let res: Response;
    try {
      res = await send();
      if (res.status === 401 && !opts.anonymous && this.accessToken && (await this.refresh())) res = await send();
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') throw err;
      throw new ApiError(0, 'network', 'network');
    }
    if (opts.raw) {
      if (!res.ok) throw await toError(res);
      return res as unknown as T;
    }
    if (!res.ok) throw await toError(res);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  get<T>(path: string, query?: Query, signal?: AbortSignal) {
    return this.request<T>('GET', path, { query, signal });
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, { body: body ?? {} });
  }
  put<T>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, { body: body ?? {} });
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, { body: body ?? {} });
  }
  del<T>(path: string, body?: unknown) {
    return this.request<T>('DELETE', path, body === undefined ? {} : { body });
  }
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } };
    return new ApiError(res.status, body.error?.code ?? `http_${res.status}`, body.error?.message ?? res.statusText, body.error?.details);
  } catch {
    return new ApiError(res.status, `http_${res.status}`, res.statusText);
  }
}
