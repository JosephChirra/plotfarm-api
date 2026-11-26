import type { CookieOptions, Response } from 'express';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './jwt-extractor';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  };
}

export function setAccessTokenCookie(res: Response, token: string) {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    ...baseCookieOptions(),
    path: '/',
    maxAge: THIRTY_MINUTES_MS,
  });
}

export function setRefreshTokenCookie(res: Response, token: string) {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...baseCookieOptions(),
    path: '/auth/token/refresh',
    maxAge: SEVEN_DAYS_MS,
  });
}

export function setAuthCookies(
  res: Response,
  tokens: { access_token: string; refresh_token: string },
) {
  setAccessTokenCookie(res, tokens.access_token);
  setRefreshTokenCookie(res, tokens.refresh_token);
}

export function clearAuthCookies(res: Response) {
  const options = baseCookieOptions();
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...options, path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    ...options,
    path: '/auth/token/refresh',
  });
}
