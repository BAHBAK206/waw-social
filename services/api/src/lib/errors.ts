import type { Context } from 'hono';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code);
  }
}

export const badRequest = (code = 'bad_request', details?: unknown) => new AppError(400, code, code, details);
export const unauthorized = (code = 'unauthorized') => new AppError(401, code);
export const forbidden = (code = 'forbidden') => new AppError(403, code);
export const notFound = (code = 'not_found') => new AppError(404, code);
export const conflict = (code = 'conflict', details?: unknown) => new AppError(409, code, code, details);
export const gone = (code = 'gone') => new AppError(410, code);
export const tooMany = (retryAfterSec: number) => new AppError(429, 'rate_limited', 'rate_limited', { retryAfterSec });
export const unavailable = (code = 'unavailable') => new AppError(503, code);

export function errorResponse(c: Context, err: unknown) {
  if (err instanceof AppError) {
    if (err.status === 429 && err.details && typeof err.details === 'object' && 'retryAfterSec' in err.details) {
      c.header('Retry-After', String((err.details as { retryAfterSec: number }).retryAfterSec));
    }
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status as 400);
  }
  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: 'invalid_input',
          message: 'invalid_input',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
      400,
    );
  }
  const e = err as { code?: string; message?: string };
  if (e?.code === '23505') return c.json({ error: { code: 'conflict', message: 'conflict' } }, 409);
  if (e?.code === '22P02') return c.json({ error: { code: 'invalid_input', message: 'invalid_input' } }, 400);
  return null;
}
