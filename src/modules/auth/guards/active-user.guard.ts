import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class ActiveUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { status?: string; isSuspended?: boolean } | undefined;
    if (user?.isSuspended || user?.status === 'BLOCKED') {
      throw new ForbiddenException('Account suspended');
    }
    return true;
  }
}
