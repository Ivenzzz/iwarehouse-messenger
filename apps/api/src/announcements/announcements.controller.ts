import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AnnouncementsService } from './announcements.service';

class AudienceDto {
  @IsOptional() @Type(() => Boolean) @IsBoolean() everyone?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true }) branchIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true }) departmentIds?: string[];
}

class PostAnnouncementDto {
  @IsString() @MinLength(5) @MaxLength(4000) content: string;
  @IsObject() @ValidateNested() @Type(() => AudienceDto) audience: AudienceDto;
}

@ApiTags('announcements')
@Roles('MANAGER')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Post()
  post(@CurrentUser() user: AuthUser, @Body() dto: PostAnnouncementDto) {
    return this.announcements.post({ id: user.id, role: user.role }, dto as any);
  }
}
