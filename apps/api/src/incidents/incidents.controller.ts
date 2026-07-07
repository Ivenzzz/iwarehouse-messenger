import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { IncidentsService } from './incidents.service';

const TYPES = [
  'STOCK_VARIANCE', 'MISSING_UNIT', 'WRONG_IMEI', 'DELIVERY_DELAY', 'DELIVERY_DAMAGE',
  'CASH_DISCREPANCY', 'FINANCING_DOC_MISSING', 'CUSTOMER_COMPLAINT', 'RMA_DELAY',
  'DAMAGED_UNIT', 'SYSTEM_OUTAGE', 'SECURITY_CONCERN', 'OTHER',
] as const;
const STATUSES = ['OPEN', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'CLOSED'] as const;
const PRIORITIES = ['P1', 'P2', 'P3'] as const;

class CreateIncidentDto {
  @IsIn(TYPES as unknown as string[]) type: (typeof TYPES)[number];
  @IsString() @MinLength(5) @MaxLength(4000) description: string;
  @IsOptional() @IsIn(PRIORITIES as unknown as string[]) priority?: (typeof PRIORITIES)[number];
  @IsOptional() @IsString() @MaxLength(80) sku?: string;
  @IsOptional() @IsString() @MaxLength(80) imei?: string;
  @IsOptional() @IsString() @MaxLength(120) erpRef?: string;
  @IsOptional() @IsISO8601() resolutionDeadline?: string;
  @IsOptional() @IsUUID() conversationId?: string;
  @IsOptional() @IsUUID() sourceMessageId?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsUUID() escalationId?: string;
}

class UpdateIncidentDto {
  @IsOptional() @IsString() @MinLength(5) @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(PRIORITIES as unknown as string[]) priority?: (typeof PRIORITIES)[number];
  @IsOptional() @IsString() @MaxLength(80) sku?: string;
  @IsOptional() @IsString() @MaxLength(80) imei?: string;
  @IsOptional() @IsString() @MaxLength(120) erpRef?: string;
  @IsOptional() @IsISO8601() resolutionDeadline?: string | null;
  @IsOptional() @IsUUID() ownerId?: string | null;
  @IsOptional() @IsUUID() escalationId?: string | null;
  @IsOptional() @IsIn(STATUSES as unknown as string[]) status?: (typeof STATUSES)[number];
}

@ApiTags('incidents')
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIncidentDto) {
    return this.incidents.create({ id: user.id, role: user.role }, dto as any);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('conversationId') conversationId?: string,
    @Query('includeClosed') includeClosed?: string,
  ) {
    return this.incidents.list(
      { id: user.id, role: user.role },
      { conversationId, includeClosed: includeClosed === '1' },
    );
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidents.detail({ id: user.id, role: user.role }, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.incidents.update({ id: user.id, role: user.role }, id, dto as any);
  }
}
