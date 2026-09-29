import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { AuthUser } from '../common/decorators/auth.decorators';
import { AppException, ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthResponseDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { TokenService, USER_PUBLIC_SELECT } from './token.service';

export const BCRYPT_ROUNDS = 12;
/** Compared against when the email is unknown so response timing does not reveal registered emails. */
const DUMMY_HASH = bcrypt.hashSync('nexora-timing-equalizer', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      const user = await this.db.user.create({
        data: { name: dto.name, email: dto.email, passwordHash },
        select: USER_PUBLIC_SELECT,
      });
      this.logger.log(`User registered ${user.id}`);
      return this.session(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(HttpStatus.CONFLICT, ErrorCode.EMAIL_TAKEN, 'An account with this email already exists', [
          { field: 'email', message: 'An account with this email already exists' },
        ]);
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.db.user.findUnique({ where: { email: dto.email } });
    const valid = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      throw new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
    }
    return this.session({ id: user.id, name: user.name, email: user.email });
  }

  private session(user: AuthUser): AuthResponseDto {
    return { ...this.tokens.issue(user.id), user };
  }
}
