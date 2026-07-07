import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { TasksService } from './tasks.service';

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
const STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'SUBMITTED', 'VERIFIED', 'CLOSED'] as const;

class CreateTaskDto {
  @IsString() @MinLength(3) @MaxLength(160) title: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsUUID() conversationId?: string;
  @IsOptional() @IsUUID() sourceMessageId?: string;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsOptional() @IsUUID() verifierId?: string;
  @IsOptional() @IsIn(PRIORITIES as unknown as string[]) priority?: (typeof PRIORITIES)[number];
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() requiresIndependentVerifier?: boolean;
  @IsOptional() @IsString() @MaxLength(120) erpRef?: string;
}

class UpdateTaskDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsUUID() assigneeId?: string | null;
  @IsOptional() @IsUUID() verifierId?: string | null;
  @IsOptional() @IsIn(PRIORITIES as unknown as string[]) priority?: (typeof PRIORITIES)[number];
  @IsOptional() @IsISO8601() dueAt?: string | null;
  @IsOptional() @IsIn(STATUSES as unknown as string[]) status?: (typeof STATUSES)[number];
}

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create({ id: user.id, role: user.role }, dto as any);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('filter') filter?: string,
    @Query('conversationId') conversationId?: string,
    @Query('includeClosed') includeClosed?: string,
  ) {
    const kind =
      conversationId != null
        ? 'conversation'
        : filter === 'created'
          ? 'created'
          : 'assigned';
    return this.tasks.list(user.id, kind, {
      conversationId,
      includeClosed: includeClosed === '1',
    });
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.detail(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update({ id: user.id, role: user.role }, id, dto as any);
  }
}
