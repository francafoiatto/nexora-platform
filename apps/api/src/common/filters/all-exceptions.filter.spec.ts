import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { AppException, ErrorCode } from '../errors';
import { toErrorBody } from './all-exceptions.filter';

const prismaError = (code: string) => new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test' });

describe('toErrorBody', () => {
  it('passes AppException codes and details through', () => {
    const body = toErrorBody(new AppException(HttpStatus.BAD_REQUEST, ErrorCode.ASSIGNEE_NOT_MEMBER, 'nope', [{ field: 'assigneeId', message: 'nope' }]));
    expect(body).toEqual({ statusCode: 400, code: 'ASSIGNEE_NOT_MEMBER', message: 'nope', details: [{ field: 'assigneeId', message: 'nope' }] });
  });

  it('maps framework HTTP exceptions to stable codes', () => {
    expect(toErrorBody(new NotFoundException('Cannot GET /x'))).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', message: 'Cannot GET /x' });
    expect(toErrorBody(new BadRequestException(['a', 'b']))).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'a; b' });
    expect(toErrorBody(new ThrottlerException())).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
  });

  it('maps Prisma unique and missing-record errors', () => {
    expect(toErrorBody(prismaError('P2002'))).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    expect(toErrorBody(prismaError('P2025'))).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('hides internal details of unknown errors', () => {
    const body = toErrorBody(new Error('connection string postgresql://secret@db leaked'));
    expect(body).toEqual({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error', details: [] });
  });
});
