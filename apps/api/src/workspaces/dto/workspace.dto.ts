import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'Acme Operations', minLength: 2, maxLength: 80 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
}

export class UpdateWorkspaceDto extends CreateWorkspaceDto {}

export class AddMemberDto {
  @ApiProperty({ example: 'teammate@example.com', description: 'Email of an existing Nexora account' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;
}

export class WorkspaceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: ['OWNER', 'MEMBER'], description: "The current user's role" }) role!: string;
  @ApiProperty() projectCount!: number;
  @ApiProperty() memberCount!: number;
  @ApiProperty() createdAt!: Date;
}

export class MemberDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['OWNER', 'MEMBER'] }) role!: string;
}

export class TaskCountsDto {
  @ApiProperty() TODO!: number;
  @ApiProperty() IN_PROGRESS!: number;
  @ApiProperty() REVIEW!: number;
  @ApiProperty() DONE!: number;
}

export class WorkspaceSummaryDto {
  @ApiProperty() projects!: number;
  @ApiProperty() members!: number;
  @ApiProperty({ type: TaskCountsDto }) tasksByStatus!: TaskCountsDto;
  @ApiProperty({ description: 'Open tasks (not DONE) across the workspace' }) openTasks!: number;
  @ApiProperty({ description: 'Open tasks whose due date has passed' }) overdueTasks!: number;
  @ApiProperty({ description: 'Open tasks assigned to the current user' }) assignedToMe!: number;
}
