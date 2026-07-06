import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { unlink } from 'fs/promises';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { StorageService } from '../storage/storage.service';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { PageQuery } from '../common/pagination';
import { ConversationsService } from './conversations.service';

class CreateConversationDto {
  @IsIn(['DIRECT', 'PRIVATE_GROUP', 'DEPARTMENT', 'BRANCH', 'ANNOUNCEMENT', 'PROJECT', 'INCIDENT'])
  type: string;

  // DIRECT
  @IsOptional() @IsUUID() userId?: string;

  // groups
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) title?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsString() @MaxLength(16) icon?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) memberIds?: string[];
}

class CaptureMetaDto {
  @IsString() capturedAt: string;
  @IsOptional() @Type(() => Number) lat?: number;
  @IsOptional() @Type(() => Number) lng?: number;
  @IsOptional() @Type(() => Number) accuracyM?: number;
}

class SendMessageDto {
  @IsOptional() @IsString() @MaxLength(8000) content?: string;
  @IsOptional() @IsUUID() replyToMessageId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('4', { each: true }) attachmentIds?: string[];
  // Evidence record for stamped-camera photos: stored server-side in the
  // message metadata so the burned-in stamp isn't the only record.
  @IsOptional() @ValidateNested() @Type(() => CaptureMetaDto) capture?: CaptureMetaDto;
}

class EditMessageDto {
  @IsString() @MinLength(1) @MaxLength(8000) content: string;
}

class ReactionDto {
  @IsString() @MinLength(1) @MaxLength(16) emoji: string;
}

class UpdateConversationDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) title?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  // A single emoji used as the conversation icon; empty string clears it.
  @IsOptional() @IsString() @MaxLength(16) icon?: string;
  @IsOptional() @IsIn(['P1', 'P2', 'P3', '']) priority?: string;
}

class MuteDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24 * 30) hours?: number;
}

@ApiTags('conversations')
@Controller()
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly storage: StorageService,
  ) {}

  // Group photo (image avatar). Owners/admins upload; stored key is prefixed
  // img: so the icon system knows it's an image rather than an emoji.
  @Post('conversations/:id/photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: tmpdir() }),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async uploadPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No image received');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('Photo must be a JPG, PNG, or WEBP image');
    }
    const key = `conv-photos/${id}/${randomUUID()}`;
    try {
      await this.storage.putFile(key, file.path, file.size, file.mimetype);
      await this.conversations.updateConversation(id, user.id, { icon: `img:${key}` });
      return { icon: `img:${key}` };
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  @Get('conversations/:id/photo')
  async servePhoto(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const icon = await this.conversations.iconFor(id, user.id);
    if (!icon?.startsWith('img:')) {
      res.status(404).end();
      return;
    }
    const key = icon.slice(4);
    try {
      const stat = await this.storage.stat(key);
      res.setHeader('Content-Type', stat.metaData?.['content-type'] ?? 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=300');
      const stream = await this.storage.getStream(key);
      stream.pipe(res);
    } catch {
      res.status(404).end();
    }
  }

  @Get('conversations')
  list(@CurrentUser() user: AuthUser) {
    return this.conversations.listForUser(user.id);
  }

  @Post('conversations')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateConversationDto) {
    if (dto.type === 'DIRECT') {
      if (!dto.userId) throw new Error('userId is required for a direct message');
      return this.conversations.createDirect(user.id, dto.userId);
    }
    if (!dto.title) throw new Error('title is required');
    return this.conversations.createGroup(user.id, {
      title: dto.title,
      description: dto.description,
      icon: dto.icon,
      memberIds: dto.memberIds ?? [],
      type: dto.type as any,
    });
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageQuery,
  ) {
    return this.conversations.messages(id, user.id, q.limit, q.cursor);
  }

  // 30 messages/min per user connection is generous for humans, tight for bots.
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('conversations/:id/messages')
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversations.sendMessage(id, user.id, dto);
  }

  @Post('conversations/:id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.markRead(id, user.id);
  }

  @Get('conversations/:id/media')
  media(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.sharedFiles(id, user.id, 'media');
  }

  @Get('conversations/:id/files')
  files(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.sharedFiles(id, user.id, 'files');
  }

  @Get('conversations/:id/members')
  members(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.readState(id, user.id);
  }

  @Patch('conversations/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversations.updateConversation(id, user.id, {
      title: dto.title,
      description: dto.description,
      icon: dto.icon === '' ? null : dto.icon,
      priority: dto.priority === '' ? null : dto.priority,
    });
  }

  @Get('conversations/:id/pinned')
  pinned(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.pinnedMessages(id, user.id);
  }

  @Post('conversations/:id/pin-conversation')
  pinConversation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.pinConversation(id, user.id, true);
  }

  @Delete('conversations/:id/pin-conversation')
  unpinConversation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.pinConversation(id, user.id, false);
  }

  @Post('conversations/:id/mute')
  mute(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MuteDto,
  ) {
    return this.conversations.muteConversation(id, user.id, dto.hours);
  }

  @Delete('conversations/:id/mute')
  unmute(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.unmuteConversation(id, user.id);
  }

  @Post('messages/:id/reactions')
  react(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReactionDto,
  ) {
    return this.conversations.addReaction(id, user.id, dto.emoji);
  }

  @Delete('messages/:id/reactions/:emoji')
  unreact(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('emoji') emoji: string,
  ) {
    return this.conversations.removeReaction(id, user.id, decodeURIComponent(emoji));
  }

  @Post('messages/:id/pin')
  pin(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.pinMessage(id, user.id);
  }

  @Delete('messages/:id/pin')
  unpin(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.unpinMessage(id, user.id);
  }

  @Post('messages/:id/save')
  save(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.saveMessage(id, user.id);
  }

  @Delete('messages/:id/save')
  unsave(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.unsaveMessage(id, user.id);
  }

  @Get('saved')
  saved(@CurrentUser() user: AuthUser) {
    return this.conversations.savedMessages(user.id);
  }

  @Post('messages/:id/ack')
  ack(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.acknowledge(id, user.id);
  }

  @Get('messages/:id/acks')
  acks(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.acknowledgements(id, user.id);
  }

  @Get('search/messages')
  searchMessages(
    @CurrentUser() user: AuthUser,
    @Query('q') q: string,
    @Query('conversationId') conversationId?: string,
  ) {
    return this.conversations.searchMessages(user.id, q ?? '', conversationId);
  }

  @Get('search/files')
  searchFiles(@CurrentUser() user: AuthUser, @Query('q') q: string) {
    return this.conversations.searchFiles(user.id, q ?? '');
  }

  @Patch('messages/:id')
  edit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.conversations.editMessage(id, user.id, dto.content);
  }

  @Delete('messages/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.deleteMessage(id, user.id);
  }
}
