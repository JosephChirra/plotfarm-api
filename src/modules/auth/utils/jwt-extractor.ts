import { Request } from 'express';
import { ExtractJwt } from 'passport-jwt';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** Read JWT from HttpOnly cookie first, then Authorization Bearer header. */
export function extractJwtFromRequest(req: Request): string | null {
  const fromCookie = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

export function requestHasJwtCredential(req: {
  cookies?: Record<string, string>;
  headers?: { authorization?: string };
}): boolean {
  const cookie = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (typeof cookie === 'string' && cookie.length > 0) return true;
  const auth = req.headers?.authorization;
  return Boolean(auth?.startsWith('Bearer '));
}
