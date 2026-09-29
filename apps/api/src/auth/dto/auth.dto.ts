import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class RegisterDto {
  @ApiProperty({ example: 'Jordan Lee', minLength: 2, maxLength: 80 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'jordan@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'a-long-passphrase', minLength: 8, maxLength: 72, description: 'bcrypt only uses the first 72 bytes.' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'demo@nexora.local' })
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'demo-password' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}

export class UserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT bearer access token' }) accessToken!: string;
  @ApiProperty({ example: 7200, description: 'Seconds until the access token expires' }) expiresIn!: number;
  @ApiProperty({ type: UserDto }) user!: UserDto;
}
