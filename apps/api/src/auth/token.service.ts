import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser } from '../common/decorators/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

export const USER_PUBLIC_SELECT = { id: true, name: true, email: true } as const;

interface TokenPayload {
  sub: string;
}

/** Issues and verifies access tokens. Shared by the HTTP guard and the realtime gateway. */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly db: PrismaService,
  ) {}

  issue(userId: string): { accessToken: string; expiresIn: number } {
    const accessToken = this.jwt.sign({ sub: userId } satisfies TokenPayload);
    const { exp, iat } = this.jwt.decode<{ exp: number; iat: number }>(accessToken);
    return { accessToken, expiresIn: exp - iat };
  }

  /** Returns the user for a valid, unexpired token whose subject still exists; otherwise null. */
  async verify(rawToken: string | undefined | null): Promise<AuthUser | null> {
    const token = rawToken?.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync<TokenPayload>(token, { algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string') return null;
      return await this.db.user.findUnique({ where: { id: payload.sub }, select: USER_PUBLIC_SELECT });
    } catch {
      return null;
    }
  }
}
