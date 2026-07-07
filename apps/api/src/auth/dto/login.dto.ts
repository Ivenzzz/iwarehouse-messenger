import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString() @MinLength(8) @MaxLength(128)
  password: string;

  // true (default): stay signed in for the refresh-token lifetime (30 days).
  // false: session cookie — signed out when the browser closes (shared PCs).
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  rememberMe?: boolean;
}
