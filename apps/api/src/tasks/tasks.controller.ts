import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../common/decorators/auth.decorators';
import { ErrorResponseDto } from '../common/errors';
import { CreateTaskDto, TaskDto, UpdateTaskDto } from './dto/task.dto';
import { TasksService, type TaskView } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('projects/:projectId/tasks')
  @ApiOkResponse({ type: [TaskDto], description: 'Newest first, at most 500' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  list(@Param('projectId', ParseUUIDPipe) projectId: string, @CurrentUser() user: AuthUser): Promise<TaskView[]> {
    return this.tasks.list(projectId, user.id);
  }

  @Post('projects/:projectId/tasks')
  @ApiCreatedResponse({ type: TaskDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_ERROR or ASSIGNEE_NOT_MEMBER' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TaskView> {
    return this.tasks.create(projectId, user.id, dto);
  }

  @Get('tasks/:taskId')
  @ApiOkResponse({ type: TaskDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(@Param('taskId', ParseUUIDPipe) taskId: string, @CurrentUser() user: AuthUser): Promise<TaskView> {
    return this.tasks.get(taskId, user.id);
  }

  @Patch('tasks/:taskId')
  @ApiOkResponse({ type: TaskDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_ERROR or ASSIGNEE_NOT_MEMBER' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  update(@Param('taskId', ParseUUIDPipe) taskId: string, @Body() dto: UpdateTaskDto, @CurrentUser() user: AuthUser): Promise<TaskView> {
    return this.tasks.update(taskId, user.id, dto);
  }

  @Delete('tasks/:taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  remove(@Param('taskId', ParseUUIDPipe) taskId: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.tasks.remove(taskId, user.id);
  }
}
