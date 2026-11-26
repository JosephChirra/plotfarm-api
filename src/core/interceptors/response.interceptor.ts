import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Request } from 'express';

export interface ApiResponse<T> {
  data?: T;
  pagination?: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const isPaginated = request.url?.includes('?') && (
      request.query?.page !== undefined || request.query?.limit !== undefined
    );

    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && 'items' in data && 'pagination' in data) {
          return data as ApiResponse<T>;
        }
        if (data === undefined || data === null) {
          return { data: null };
        }
        return { data };
      }),
    );
  }
}
