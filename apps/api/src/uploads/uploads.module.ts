import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { ClamavService } from './clamav.service';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, ClamavService],
  exports: [UploadsService],
})
export class UploadsModule {}
