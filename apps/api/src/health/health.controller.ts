import { Controller, Get, HttpStatus, Module, Res } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

class HealthDto {
  @ApiProperty({ enum: ['ok', 'degraded'] }) status!: 'ok' | 'degraded';
  @ApiProperty({ enum: ['up', 'down'] }) database!: 'up' | 'down';
  @ApiProperty({ example: 12.3 }) uptimeSeconds!: number;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly db: PrismaService) {}

  @Public()
  @Get()
  @ApiOkResponse({ type: HealthDto })
  @ApiServiceUnavailableResponse({ type: HealthDto })
  async health(@Res({ passthrough: true }) res: Response): Promise<HealthDto> {
    const database = await this.db.$queryRaw`SELECT 1`.then(
      () => 'up' as const,
      () => 'down' as const,
    );
    if (database === 'down') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: database === 'up' ? 'ok' : 'degraded', database, uptimeSeconds: Math.round(process.uptime() * 10) / 10 };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
