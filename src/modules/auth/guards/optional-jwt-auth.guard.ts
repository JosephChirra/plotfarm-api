import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { requestHasJwtCredential } from '../utils/jwt-extractor';

/** Attaches `req.user` when a valid JWT credential is present; otherwise continues unauthenticated. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      cookies?: Record<string, string>;
      headers?: { authorization?: string };
    }>();
    if (!requestHasJwtCredential(request)) {
      return true;
    }
    try {
      return (await super.canActivate(context)) as boolean;
    } catch {
      return true;
    }
  }

  override handleRequest<TUser>(err: Error | undefined, user: TUser): TUser {
    return user;
  }
}
