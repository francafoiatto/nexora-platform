import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { AppException, type ErrorCode, ErrorCode as Codes, type ErrorDetail } from '../errors';

interface ErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details: ErrorDetail[];
  requestId?: string;
}

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  400: Codes.VALIDATION_ERROR,
  401: Codes.UNAUTHORIZED,
  403: Codes.FORBIDDEN,
  404: Codes.NOT_FOUND,
  409: Codes.CONFLICT,
  429: Codes.RATE_LIMITED,
};

/** Maps any thrown value to the public error envelope. Stack traces are logged, never returned. */
export function toErrorBody(exception: unknown): ErrorBody {
  if (exception instanceof AppException) {
    return { statusCode: exception.getStatus(), code: exception.code, message: exception.message, details: exception.details };
  }
  if (exception instanceof ThrottlerException) {
    return { statusCode: 429, code: Codes.RATE_LIMITED, message: 'Too many requests, please try again later', details: [] };
  }
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    const raw = typeof response === 'object' && response && 'message' in response ? (response as { message: unknown }).message : exception.message;
    const message = Array.isArray(raw) ? raw.join('; ') : String(raw);
    return { statusCode, code: STATUS_CODES[statusCode] ?? (statusCode >= 500 ? Codes.INTERNAL_ERROR : Codes.VALIDATION_ERROR), message, details: [] };
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002') return { statusCode: 409, code: Codes.CONFLICT, message: 'Resource already exists', details: [] };
    if (exception.code === 'P2025') return { statusCode: 404, code: Codes.NOT_FOUND, message: 'Resource not found', details: [] };
  }
  return { statusCode: 500, code: Codes.INTERNAL_ERROR, message: 'Internal server error', details: [] };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    // WebSocket errors are handled by the gateway itself.
    if (host.getType() !== 'http') return;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string }>();
    const response = ctx.getResponse<Response>();
    const body = toErrorBody(exception);
    body.requestId = request.id;

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`${request.method} ${request.path} failed [${request.id}]`, stack);
    }
    response.status(body.statusCode).json(body);
  }
}
