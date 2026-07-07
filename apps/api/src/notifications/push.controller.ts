import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject, IsString, IsUrl, ValidateNested } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { PushService } from './push.service';

class SubscriptionKeysDto {
  @IsString() p256dh: string;
  @IsString() auth: string;
}

class SubscribeDto {
  @IsUrl({ require_tld: false }) endpoint: string;
  @IsObject() @ValidateNested() @Type(() => SubscriptionKeysDto) keys: SubscriptionKeysDto;
}

class UnsubscribeDto {
  @IsUrl({ require_tld: false }) endpoint: string;
}

@ApiTags('push')
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('status')
  status() {
    return this.push.status();
  }

  @Post('subscribe')
  subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubscribeDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.push.subscribe(user.id, dto, userAgent);
  }

  @Post('unsubscribe')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: UnsubscribeDto) {
    return this.push.unsubscribe(user.id, dto.endpoint);
  }
}
