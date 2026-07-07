import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength,
} from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';

class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(3) @MaxLength(40) username: string;
  @IsString() @MinLength(10) @MaxLength(128) password: string;
  @IsString() @MinLength(2) @MaxLength(80) displayName: string;
  @IsEnum(Role) role: Role;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsString() @MaxLength(80) title?: string;
}

class UpdateUserDto {
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}

class ResetPasswordDto {
  @IsString() @MinLength(10) @MaxLength(128) newPassword: string;
}

@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('system')
  system() {
    return this.admin.systemStats();
  }

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Post('users')
  createUser(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.admin.createUser(actor, dto);
  }

  @Patch('users/:id')
  updateUser(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.admin.updateUser(actor, id, dto);
  }

  @Post('users/:id/reset-password')
  resetPassword(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.admin.resetPassword(actor, id, dto.newPassword);
  }

  @Post('users/:id/revoke-sessions')
  revokeSessions(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.revokeSessions(actor, id);
  }
}
