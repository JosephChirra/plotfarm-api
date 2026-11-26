import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserRole } from '@prisma/client';

@Injectable()
export class AnonymizeUserInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const userRole = request.user?.role;
    
    // Skip anonymization for admins, they need the real info
    if (userRole === UserRole.ADMIN) {
      return next.handle();
    }

    const anonymize = (obj: any): void => {
      if (!obj || typeof obj !== 'object') return;
      
      // Prevent infinite recursion on Date objects or other native types
      if (obj instanceof Date) return;

      if (Array.isArray(obj)) {
        obj.forEach(anonymize);
      } else {
        // If it looks like a User object that is blocked/suspended
        if (
          (obj.isSuspended === true || obj.status === 'BLOCKED') &&
          ('fullName' in obj || 'email' in obj)
        ) {
          if ('fullName' in obj) obj.fullName = 'PlotFarm User';
          if ('email' in obj) obj.email = null;
          if ('phone' in obj) obj.phone = null;
          if ('profileImageUrl' in obj) obj.profileImageUrl = null;
        }

        // Check nested profile objects if they belong to a suspended user
        // Often Prisma includes UserProfile under 'profile' inside a 'user'
        if (obj.profile && (obj.isSuspended === true || obj.status === 'BLOCKED')) {
          if ('profileImageUrl' in obj.profile) obj.profile.profileImageUrl = null;
          if ('bio' in obj.profile) obj.profile.bio = null;
        }
        
        Object.values(obj).forEach((val) => {
          if (val && typeof val === 'object') {
            anonymize(val);
          }
        });
      }
    };

    return next.handle().pipe(
      map((data) => {
        // Perform deep walk anonymization before it hits JSON serialization
        if (data) {
          anonymize(data);
        }
        return data;
      }),
    );
  }
}
