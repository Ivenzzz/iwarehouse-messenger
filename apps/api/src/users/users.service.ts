import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const publicSelect = {
  id: true, email: true, username: true, role: true, status: true,
  branchId: true, departmentId: true, lastActiveAt: true, createdAt: true,
  branch: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true, code: true } },
  profile: {
    select: { displayName: true, title: true, presence: true, statusText: true, avatarKey: true },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(params: {
    q?: string; branchId?: string; departmentId?: string; role?: string;
    status?: string; limit: number; cursor?: string;
  }) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(params.branchId ? { branchId: params.branchId } : {}),
      ...(params.departmentId ? { departmentId: params.departmentId } : {}),
      ...(params.role ? { role: params.role as any } : {}),
      ...(params.status ? { status: params.status as any } : {}),
      ...(params.q
        ? {
            OR: [
              { username: { contains: params.q, mode: 'insensitive' } },
              { email: { contains: params.q, mode: 'insensitive' } },
              { profile: { displayName: { contains: params.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const items = await this.prisma.user.findMany({
      where,
      select: publicSelect,
      take: params.limit + 1,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
      orderBy: { username: 'asc' },
    });
    const hasMore = items.length > params.limit;
    if (hasMore) items.pop();
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: publicSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  me(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { ...publicSelect, notificationPreference: true },
    });
  }

  async updateMe(id: string, data: { displayName?: string; title?: string; phone?: string; statusText?: string | null; presence?: any; showLastSeen?: boolean }) {
    await this.prisma.userProfile.update({
      where: { userId: id },
      data,
    });
    return this.me(id);
  }
}
