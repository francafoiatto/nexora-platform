import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { type AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { ErrorResponseDto } from '../common/errors';
import { AccessService } from '../workspaces/access.service';
import { ActivitiesService, type ActivityView } from './activities.service';

export class ActivityQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @ApiPropertyOptional({ format: 'uuid', description: 'Opaque cursor from a previous page (nextCursor)' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

class ActivityActorDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}

export class ActivityDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workspaceId!: string;
  @ApiProperty({ enum: ['WORKSPACE', 'MEMBER', 'PROJECT', 'TASK'] }) entityType!: string;
  @ApiProperty({ format: 'uuid' }) entityId!: string;
  @ApiProperty({ example: 'task.status_changed' }) action!: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, example: { title: 'Ship v1', from: 'TODO', to: 'DONE' } })
  metadata!: unknown;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: ActivityActorDto }) actor!: ActivityActorDto;
}

export class ActivityPageDto {
  @ApiProperty({ type: [ActivityDto] }) items!: ActivityDto[];
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) nextCursor!: string | null;
}

@ApiTags('activities')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/activities')
export class ActivitiesController {
  constructor(
    private readonly activities: ActivitiesService,
    private readonly access: AccessService,
  ) {}

  @Get()
  @ApiOkResponse({ type: ActivityPageDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async list(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: ActivityQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ items: ActivityView[]; nextCursor: string | null }> {
    await this.access.requireMembership(workspaceId, user.id);
    return this.activities.list(workspaceId, query.limit, query.cursor);
  }
}
