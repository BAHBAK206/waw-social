import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi } from '../src';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const me = { id: 'u1', displayName: 'Ali' };

describe('http client', () => {
  it('refreshes once for concurrent 401s and retries', async () => {
    let refreshes = 0;
    let token = 'old';
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const auth = (init?.headers as Record<string, string>)?.authorization;
      if (u.endsWith('/auth/login')) return json(200, { accessToken: 'old', accessTokenExpiresAt: Date.now() + 600_000, refreshToken: 'r1', user: me });
      if (u.endsWith('/auth/refresh')) {
        refreshes++;
        token = 'new';
        return json(200, { accessToken: 'new', accessTokenExpiresAt: Date.now() + 600_000, refreshToken: 'r2', user: me });
      }
      return auth === `Bearer ${token}` && token === 'new' ? json(200, { ok: true }) : json(401, { error: { code: 'unauthorized', message: 'x' } });
    });
    let stored: string | null = null;
    const api = createApi({
      baseUrl: 'http://api.test',
      platform: 'mobile',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      tokenStore: { getRefreshToken: async () => stored, setRefreshToken: async (t) => void (stored = t) },
    });
    await api.auth.login({ email: 'a@b.c', password: 'x' });
    expect(stored).toBe('r1');
    const results = await Promise.all([api.http.get('/a'), api.http.get('/b'), api.http.get('/c')]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshes).toBe(1);
    expect(stored).toBe('r2');
  });

  it('maps API errors and network errors', async () => {
    const api = createApi({
      baseUrl: 'http://api.test',
      platform: 'web',
      fetchImpl: (async (url: string) => {
        if (String(url).includes('/boom')) throw new TypeError('fetch failed');
        return json(409, { error: { code: 'email_taken', message: 'email_taken' } });
      }) as unknown as typeof fetch,
    });
    await expect(api.http.get('/x')).rejects.toMatchObject({ status: 409, code: 'email_taken' });
    const err = await api.http.get('/boom').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).isNetwork).toBe(true);
  });

  it('builds query strings without empty values', () => {
    const api = createApi({ baseUrl: 'http://api.test/', platform: 'web' });
    expect(api.http.url('/quizzes', { q: 'كسور', limit: 10, empty: '', none: undefined })).toBe('http://api.test/api/v1/quizzes?q=%D9%83%D8%B3%D9%88%D8%B1&limit=10');
  });
});
