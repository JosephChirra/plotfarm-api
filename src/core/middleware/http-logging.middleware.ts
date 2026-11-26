import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class HttpLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') ?? '-';
    const start = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const ms = Date.now() - start;
      const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'log';

      // Mask sensitive paths in logs — never log auth payloads
      const safePath = originalUrl.replace(/\/auth\/.*/i, '/auth/***');

      this.logger[level](
        `${method} ${safePath} ${statusCode} ${ms}ms — ${ip} "${userAgent}"`,
      );
    });

    next();
  }
}
