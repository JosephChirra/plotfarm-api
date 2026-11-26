import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export const ERROR_CODES: Record<string, string> = {
  BadRequestException: 'VALIDATION_FAILED',
  UnauthorizedException: 'UNAUTHORIZED',
  ForbiddenException: 'FORBIDDEN',
  NotFoundException: 'RESOURCE_NOT_FOUND',
  ConflictException: 'CONFLICT',
  UnprocessableEntityException: 'BUSINESS_RULE_VIOLATED',
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_SERVER_ERROR';
    let type = 'Error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        message = (obj.message as string) || exception.message;
        if (Array.isArray(obj.message)) {
          details = obj.message;
          message = 'Validation failed';
        }
      } else {
        message = String(res);
      }
      code = ERROR_CODES[exception.name] || 'APPLICATION_ERROR';
      type = exception.name;
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(exception.message, exception.stack);
    }

    const errorResponse: Record<string, unknown> = {
      error: {
        code,
        message,
        type,
      },
      detail: message,
    };
    if (details !== undefined) {
      (errorResponse.error as Record<string, unknown>).details = details;
    }

    response.status(status).json(errorResponse);
  }
}
