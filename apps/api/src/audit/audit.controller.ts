import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PageQuery } from '../common/pagination';
import { AuditService } from './audit.service';

class AuditQuery extends PageQuery {
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() actorId?: string;
}

@ApiTags('admin')
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles('ADMIN')
  list(@Query() q: AuditQuery) {
    return this.audit.list(q);
  }
}
