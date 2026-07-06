import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

// Extension + MIME allowlist from the product spec. Anything else is rejected.
const ALLOWED: Record<string, string[]> = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  mp4: ['video/mp4'],
  mov: ['video/quicktime'],
  mp3: ['audio/mpeg'],
  wav: ['audio/wav', 'audio/x-wav'],
  m4a: ['audio/mp4', 'audio/x-m4a'],
  webm: ['video/webm', 'audio/webm'],
  ogg: ['audio/ogg', 'video/ogg'],
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
  txt: ['text/plain'],
  zip: ['application/zip', 'application/x-zip-compressed'],
};

export function maxUploadBytes() {
  return Number(process.env.UPLOAD_MAX_MB ?? 50) * 1024 * 1024;
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  validate(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file received');
    if (file.size > maxUploadBytes()) {
      throw new BadRequestException(
        `File is larger than the ${process.env.UPLOAD_MAX_MB ?? 50} MB limit`,
      );
    }
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    const allowedMimes = ALLOWED[ext];
    if (!allowedMimes) {
      throw new BadRequestException(`.${ext || '?'} files are not allowed`);
    }
    // Browsers occasionally send application/octet-stream; the extension check
    // above is the gate, the MIME check catches obvious mismatches.
    if (file.mimetype !== 'application/octet-stream' && !allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('File type does not match its extension');
    }
    return allowedMimes[0];
  }

  async store(userId: string, file: Express.Multer.File) {
    const mimeType = this.validate(file);
    const safeName = file.originalname.replace(/[^\w.\-() ]+/g, '_').slice(0, 180);
    const key = `u/${randomUUID()}/${safeName}`;

    try {
      const sha256 = await sha256File(file.path);
      await this.storage.putFile(key, file.path, file.size, mimeType);
      const upload = await this.prisma.upload.create({
        data: {
          userId,
          storageKey: key,
          originalName: file.originalname.slice(0, 255),
          mimeType,
          sizeBytes: BigInt(file.size),
          sha256,
          status: 'COMPLETE',
          scanStatus: 'SKIPPED', // ClamAV hook lands with the scanning worker
          completedAt: new Date(),
        },
      });
      return {
        id: upload.id,
        originalName: upload.originalName,
        mimeType: upload.mimeType,
        sizeBytes: Number(upload.sizeBytes),
      };
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  // Access rule: an attachment is visible to members of its conversation.
  async authorizeAttachment(attachmentId: string, userId: string) {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      include: { message: true },
    });
    if (!attachment || attachment.message.deletedAt) {
      throw new NotFoundException('File not found');
    }
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: attachment.message.conversationId,
          userId,
        },
      },
    });
    if (!member) throw new ForbiddenException('You do not have access to this file');
    return attachment;
  }
}
