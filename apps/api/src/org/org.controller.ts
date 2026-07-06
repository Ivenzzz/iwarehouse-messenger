import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

class CreateOrgUnitDto {
  @IsString() @MinLength(2) @MaxLength(60) name: string;
  @IsString() @MinLength(2) @MaxLength(12) code: string;
}

@ApiTags('organization')
@Controller()
export class OrgController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('branches')
  branches() {
    return this.prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  @Post('branches')
  @Roles('SUPER_ADMIN')
  createBranch(@Body() dto: CreateOrgUnitDto) {
    return this.prisma.branch.create({ data: { name: dto.name, code: dto.code.toUpperCase() } });
  }

  @Get('departments')
  departments() {
    return this.prisma.department.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  @Post('departments')
  @Roles('SUPER_ADMIN')
  createDepartment(@Body() dto: CreateOrgUnitDto) {
    return this.prisma.department.create({ data: { name: dto.name, code: dto.code.toUpperCase() } });
  }
}
