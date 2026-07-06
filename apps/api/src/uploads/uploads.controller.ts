import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { StorageService } from '../storage/storage.service';
import { maxUploadBytes, UploadsService } from './uploads.service';

@ApiTags('uploads')
@Controller()
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly storage: StorageService,
  ) {}

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('uploads')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: tmpdir() }),
      limits: { fileSize: maxUploadBytes() },
    }),
  )
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.uploads.store(user.id, file);
  }

  // Inline stream for previews (img/video/audio tags). Supports Range so
  // videos can seek.
  @Get('files/:id/raw')
  async raw(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.stream(user, id, req, res, 'inline');
  }

  @Get('files/:id/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.stream(user, id, req, res, 'attachment');
  }

  private async stream(
    user: AuthUser,
    attachmentId: string,
    req: Request,
    res: Response,
    disposition: 'inline' | 'attachment',
  ) {
    const attachment = await this.uploads.authorizeAttachment(attachmentId, user.id);
    const size = Number(attachment.sizeBytes);
    const encodedName = encodeURIComponent(attachment.originalName);

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodedName}`,
    );
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const range = req.headers.range;
    const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (match && (match[1] || match[2])) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1;
      if (start >= size || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
        return;
      }
      const stream = await this.storage.getPartialStream(
        attachment.storageKey,
        start,
        end - start + 1,
      );
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', end - start + 1);
      stream.pipe(res);
      return;
    }

    const stream = await this.storage.getStream(attachment.storageKey);
    res.setHeader('Content-Length', size);
    stream.pipe(res);
  }
}
