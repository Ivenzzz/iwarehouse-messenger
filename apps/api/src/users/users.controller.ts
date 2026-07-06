import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { PageQuery } from '../common/pagination';
import { UsersService } from './users.service';

class UserListQuery extends PageQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() status?: string;
}

class UpdateMeDto {
  @IsOptional() @IsString() @MaxLength(80) displayName?: string;
  @IsOptional() @IsString() @MaxLength(80) title?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) statusText?: string;
  @IsOptional() @IsIn(['ONLINE', 'AWAY', 'BUSY', 'OFFLINE']) presence?: string;
  @IsOptional() @IsBoolean() showLastSeen?: boolean;
}

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user.id, dto as any);
  }

  @Get('users')
  list(@Query() q: UserListQuery) {
    return this.users.findMany(q);
  }

  @Get('users/:id')
  one(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }
}
