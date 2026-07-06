import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from 'minio';
import { Readable } from 'stream';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('Storage');
  private client: Client;
  readonly bucket = process.env.MINIO_BUCKET ?? 'iwm-attachments';

  onModuleInit() {
    this.client = new Client({
      endPoint: process.env.MINIO_ENDPOINT ?? 'minio',
      port: Number(process.env.MINIO_PORT ?? 9000),
      useSSL: (process.env.MINIO_USE_SSL ?? 'false') === 'true',
      accessKey: process.env.MINIO_ROOT_USER ?? '',
      secretKey: process.env.MINIO_ROOT_PASSWORD ?? '',
    });
    // Bucket is normally created by the minio-init container; this covers
    // fresh volumes and manual deployments.
    this.client
      .bucketExists(this.bucket)
      .then((exists) => (exists ? null : this.client.makeBucket(this.bucket, '')))
      .catch((err) => this.logger.warn(`bucket check failed: ${err.message}`));
  }

  putFile(key: string, filePath: string, size: number, mimeType: string) {
    return this.client.fPutObject(this.bucket, key, filePath, {
      'Content-Type': mimeType,
      // Uploaded content must never execute in the browser context.
      'Content-Disposition': 'attachment',
    });
  }

  stat(key: string) {
    return this.client.statObject(this.bucket, key);
  }

  getStream(key: string): Promise<Readable> {
    return this.client.getObject(this.bucket, key);
  }

  getPartialStream(key: string, offset: number, length: number): Promise<Readable> {
    return this.client.getPartialObject(this.bucket, key, offset, length);
  }

  remove(key: string) {
    return this.client.removeObject(this.bucket, key);
  }
}
