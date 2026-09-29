import { HttpStatus, ValidationPipe, type ValidationError } from '@nestjs/common';
import { AppException, ErrorCode, type ErrorDetail } from './errors';

function flatten(errors: ValidationError[], parent = ''): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

export function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, 'Request validation failed', flatten(errors)),
  });
}
