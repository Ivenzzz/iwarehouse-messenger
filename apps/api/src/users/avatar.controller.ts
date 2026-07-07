import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { unlink } from 'fs/promises';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const AVATAR_MAX = 8 * 1024 * 1024; // 8 MB is plenty for a profile photo
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

@ApiTags('users')
@Controller()
export class AvatarController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: tmpdir() }),
      limits: { fileSize: AVATAR_MAX },
    }),
  )
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.saveAvatar(user.id, file);
  }

  private async saveAvatar(userId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image received');
    if (!ALLOWED.includes(file.mimetype)) {
      throw new BadRequestException('Avatar must be a JPG, PNG, or WEBP image');
    }
    const key = `avatars/${userId}/${randomUUID()}`;
    try {
      await this.storage.putFile(key, file.path, file.size, file.mimetype);
      const existing = await this.prisma.userProfile.findUnique({ where: { userId } });
      await this.prisma.userProfile.update({
        where: { userId },
        data: { avatarKey: key },
      });
      // Best-effort cleanup of the previous avatar object.
      if (existing?.avatarKey) {
        this.storage.remove(existing.avatarKey).catch(() => undefined);
      }
      return { avatarKey: key };
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  // Admins can set a photo on any user's behalf — lets HR/IT roll out staff
  // photos centrally instead of waiting for each employee.
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('admin/users/:id/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: tmpdir() }),
      limits: { fileSize: AVATAR_MAX },
    }),
  )
  async adminUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No image received');
    if (!ALLOWED.includes(file.mimetype)) {
      throw new BadRequestException('Avatar must be a JPG, PNG, or WEBP image');
    }
    const key = `avatars/${id}/${randomUUID()}`;
    try {
      await this.storage.putFile(key, file.path, file.size, file.mimetype);
      const existing = await this.prisma.userProfile.findUnique({ where: { userId: id } });
      if (!existing) throw new BadRequestException('User not found');
      await this.prisma.userProfile.update({ where: { userId: id }, data: { avatarKey: key } });
      if (existing.avatarKey) this.storage.remove(existing.avatarKey).catch(() => undefined);
      return { avatarKey: key };
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  // Avatars are low-sensitivity (name + face, already visible in chat), so
  // they are readable by any authenticated user by user id.
  @Get('users/:id/avatar')
  async serve(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId: id } });
    if (!profile?.avatarKey) {
      res.status(404).end();
      return;
    }
    try {
      const stat = await this.storage.stat(profile.avatarKey);
      res.setHeader('Content-Type', stat.metaData?.['content-type'] ?? 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
      const stream = await this.storage.getStream(profile.avatarKey);
      stream.pipe(res);
    } catch {
      res.status(404).end();
    }
  }
}
