import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateActivityLogDto } from './dto/create-activity-log.dto';
import { PaginationDto, PaginatedResult } from '../../shared/dto/pagination.dto';

@Injectable()
export class ActivityLogsService {
  constructor(private prisma: PrismaService) { }

  async create(dto: CreateActivityLogDto) {
    const data = {
      ...dto,
      metadata: dto.metadata ? JSON.stringify(dto.metadata) : undefined,
    };
    return this.prisma.activityLog.create({
      data: data as never,
      include: { user: true },
    });
  }

  async findAll(pagination: PaginationDto, userId?: string, entityType?: string, action?: string) {
    const { page = 1, limit = 20 } = pagination;
    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (entityType) where.entityType = entityType;
    if (action) where.action = action;

    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { user: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    const pages = Math.ceil(total / limit) || 0;
    return {
      items,
      pagination: { total, page, size: limit, pages },
    } satisfies PaginatedResult<typeof items[0]>;
  }

  async findOne(id: string) {
    const log = await this.prisma.activityLog.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!log) throw new NotFoundException('Activity log not found');
    return log;
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.activityLog.delete({ where: { id } });
  }
}
