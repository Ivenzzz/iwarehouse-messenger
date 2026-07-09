import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { PollsService } from './polls.service';

class CreatePollDto {
  @IsString() @MinLength(3) @MaxLength(300) question: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(10) @IsString({ each: true }) options: string[];
  @IsOptional() @Type(() => Boolean) @IsBoolean() multi?: boolean;
}

class VoteDto {
  @IsArray() @ArrayMaxSize(10) @IsUUID('4', { each: true }) optionIds: string[];
}

@ApiTags('polls')
@Controller()
export class PollsController {
  constructor(private readonly polls: PollsService) {}

  @Post('conversations/:id/polls')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePollDto,
  ) {
    return this.polls.create(user.id, id, dto);
  }

  @Post('polls/:pollId/vote')
  vote(
    @CurrentUser() user: AuthUser,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @Body() dto: VoteDto,
  ) {
    return this.polls.vote(user.id, pollId, dto.optionIds);
  }
}
