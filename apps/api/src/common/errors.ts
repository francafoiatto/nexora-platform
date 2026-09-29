import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  ASSIGNEE_NOT_MEMBER: 'ASSIGNEE_NOT_MEMBER',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorDetail {
  field?: string;
  message: string;
}

export class ErrorDetailDto implements ErrorDetail {
  @ApiPropertyOptional({ example: 'email' }) field?: string;
  @ApiProperty({ example: 'email must be an email' }) message!: string;
}

/** The single error envelope returned by every endpoint. */
export class ErrorResponseDto {
  @ApiProperty({ example: 400 }) statusCode!: number;
  @ApiProperty({ enum: Object.values(ErrorCode), example: ErrorCode.VALIDATION_ERROR }) code!: ErrorCode;
  @ApiProperty({ example: 'Request validation failed' }) message!: string;
  @ApiProperty({ type: [ErrorDetailDto] }) details!: ErrorDetail[];
  @ApiProperty({ example: '6f1c2b1e-4a3d-4c1b-9a51-2f5a3e0c9b7d' }) requestId!: string;
}

/** Domain exception carrying a stable machine-readable code. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: ErrorCode,
    message: string,
    public readonly details: ErrorDetail[] = [],
  ) {
    super({ code, message, details }, status);
  }
}

export const notFound = (entity: string) => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, `${entity} not found`);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppException(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, message);
