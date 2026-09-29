import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { ErrorResponseDto } from '../common/errors';
import { AddMemberDto, CreateWorkspaceDto, MemberDto, UpdateWorkspaceDto, WorkspaceDto, WorkspaceSummaryDto } from './dto/workspace.dto';
import { WorkspacesService } from './workspaces.service';

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  @ApiOkResponse({ type: [WorkspaceDto], description: 'Workspaces the current user belongs to' })
  list(@CurrentUser() user: AuthUser): Promise<WorkspaceDto[]> {
    return this.workspaces.list(user.id);
  }

  @Post()
  @ApiCreatedResponse({ type: WorkspaceDto, description: 'The creator becomes OWNER' })
  create(@Body() dto: CreateWorkspaceDto, @CurrentUser() user: AuthUser): Promise<WorkspaceDto> {
    return this.workspaces.create(user.id, dto.name);
  }

  @Get(':workspaceId')
  @ApiOkResponse({ type: WorkspaceDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Not found or not a member' })
  get(@Param('workspaceId', ParseUUIDPipe) workspaceId: string, @CurrentUser() user: AuthUser): Promise<WorkspaceDto> {
    return this.workspaces.get(workspaceId, user.id);
  }

  @Patch(':workspaceId')
  @ApiOkResponse({ type: WorkspaceDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Only owners can rename' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<WorkspaceDto> {
    return this.workspaces.update(workspaceId, user.id, dto.name);
  }

  @Get(':workspaceId/summary')
  @ApiOkResponse({ type: WorkspaceSummaryDto, description: 'Dashboard metrics across the whole workspace' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  summary(@Param('workspaceId', ParseUUIDPipe) workspaceId: string, @CurrentUser() user: AuthUser): Promise<WorkspaceSummaryDto> {
    return this.workspaces.summary(workspaceId, user.id);
  }

  @Get(':workspaceId/members')
  @ApiOkResponse({ type: [MemberDto] })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  members(@Param('workspaceId', ParseUUIDPipe) workspaceId: string, @CurrentUser() user: AuthUser): Promise<MemberDto[]> {
    return this.workspaces.members(workspaceId, user.id);
  }

  @Post(':workspaceId/members')
  @ApiCreatedResponse({ type: MemberDto, description: 'Adds an existing account as MEMBER' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Only owners can add members' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Workspace or user not found' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Already a member' })
  addMember(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MemberDto> {
    return this.workspaces.addMember(workspaceId, user.id, dto.email);
  }
}
