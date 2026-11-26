import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { ReportTargetType, ReportResolutionAction, Prisma } from '@prisma/client';

@Injectable()
export class ModerationLogsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    adminId: string;
    targetType: ReportTargetType;
    targetId: string;
    actionType: ReportResolutionAction;
    reason?: string;
    adminNotes?: string;
    metadata?: any;
  }) {
    return this.prisma.moderationLog.create({
      data: {
        adminId: data.adminId,
        targetType: data.targetType,
        targetId: data.targetId,
        actionType: data.actionType,
        reason: data.reason,
        adminNotes: data.adminNotes,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      },
    });
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    targetType?: ReportTargetType;
    adminId?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: Prisma.ModerationLogWhereInput = {};
    if (query.targetType) where.targetType = query.targetType;
    if (query.adminId) where.adminId = query.adminId;

    const [items, total] = await Promise.all([
      this.prisma.moderationLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          admin: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.moderationLog.count({ where }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }
}
