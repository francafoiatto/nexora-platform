import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { ErrorResponseDto } from '../common/errors';
import { CreateProjectDto, ProjectDto, UpdateProjectDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('workspaces/:workspaceId/projects')
  @ApiOkResponse({ type: [ProjectDto] })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  list(@Param('workspaceId', ParseUUIDPipe) workspaceId: string, @CurrentUser() user: AuthUser): Promise<ProjectDto[]> {
    return this.projects.list(workspaceId, user.id);
  }

  @Post('workspaces/:workspaceId/projects')
  @ApiCreatedResponse({ type: ProjectDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProjectDto> {
    return this.projects.create(workspaceId, user.id, dto);
  }

  @Get('projects/:projectId')
  @ApiOkResponse({ type: ProjectDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(@Param('projectId', ParseUUIDPipe) projectId: string, @CurrentUser() user: AuthUser): Promise<ProjectDto> {
    return this.projects.get(projectId, user.id);
  }

  @Patch('projects/:projectId')
  @ApiOkResponse({ type: ProjectDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProjectDto> {
    return this.projects.update(projectId, user.id, dto);
  }

  @Delete('projects/:projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Project and its tasks deleted' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Only owners can delete projects' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  remove(@Param('projectId', ParseUUIDPipe) projectId: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.projects.remove(projectId, user.id);
  }
}
