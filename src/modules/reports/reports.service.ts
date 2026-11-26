import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PropertyStatus,
  ReportResolutionAction,
  ReportStatus,
  ReportPriority,
  ReportTargetType,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ReviewReportDto } from './dto/review-report.dto';
import { FindReportsQueryDto } from './dto/find-reports-query.dto';
import { ModerationLogsService } from '../moderation-logs/moderation-logs.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationType } from '../notifications/notifications.service';


const DAILY_REPORT_LIMIT = 5;

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private moderationLogs: ModerationLogsService,
    private eventEmitter: EventEmitter2,
  ) {}

  private async loadTargetMaps(
    items: Array<{ targetType: ReportTargetType; targetId: string }>,
  ) {
    const propertyIds = items
      .filter((r) => r.targetType === ReportTargetType.PROPERTY)
      .map((r) => r.targetId);
    const userIds = items
      .filter((r) => r.targetType === ReportTargetType.USER)
      .map((r) => r.targetId);

    const [properties, users] = await Promise.all([
      propertyIds.length
        ? this.prisma.property.findMany({
            where: { id: { in: propertyIds } },
            select: { id: true, title: true, isBlocked: true, ownerId: true },
          })
        : [],
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true, email: true, isSuspended: true },
          })
        : [],
    ]);

    return {
      propMap: new Map(properties.map((p) => [p.id, p])),
      userMap: new Map(users.map((u) => [u.id, u])),
    };
  }

  private enrichReports(
    items: Array<{
      id: string;
      targetType: ReportTargetType;
      targetId: string;
      reason: string;
      description: string | null;
      status: ReportStatus;
      priority: ReportPriority;
      adminNotes: string | null;
      resolutionAction: ReportResolutionAction | null;
      reporter: { id: string; fullName: string | null; email: string | null };
      reviewedBy: { id: string; fullName: string | null; email: string | null } | null;
      reviewedAt: Date | null;
      createdAt: Date;
    }>,
    maps: {
      propMap: Map<string, { id: string; title: string; isBlocked: boolean; ownerId: string | null }>;
      userMap: Map<string, { id: string; fullName: string; email: string | null; isSuspended: boolean }>;
    },
  ) {
    return items.map((r) => {
      let targetInfo: { label: string; meta?: string };
      if (r.targetType === ReportTargetType.PROPERTY) {
        const p = maps.propMap.get(r.targetId);
        targetInfo = {
          label: p?.title ?? '(deleted or unknown property)',
          meta: p ? `blocked=${p.isBlocked}` : undefined,
        };
      } else {
        const u = maps.userMap.get(r.targetId);
        targetInfo = {
          label: u?.fullName ?? '(unknown user)',
          meta: u?.email ?? undefined,
        };
      }
      return {
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        targetInfo,
        reason: r.reason,
        description: r.description,
        status: r.status,
        priority: r.priority,
        adminNotes: r.adminNotes,
        resolutionAction: r.resolutionAction,
        reporter: r.reporter,
        reviewedBy: r.reviewedBy,
        reviewedAt: r.reviewedAt,
        createdAt: r.createdAt,
      };
    });
  }

  private startOfUtcDay(): Date {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  }

  async assertDailyLimit(reporterId: string): Promise<void> {
    const count = await this.prisma.report.count({
      where: {
        reporterId,
        createdAt: { gte: this.startOfUtcDay() },
      },
    });
    if (count >= DAILY_REPORT_LIMIT) {
      throw new BadRequestException(
        `You can submit at most ${DAILY_REPORT_LIMIT} reports per day. Try again tomorrow.`,
      );
    }
  }

  async hasReported(reporterId: string, targetId: string): Promise<boolean> {
    const row = await this.prisma.report.findUnique({
      where: {
        reporterId_targetId: { reporterId, targetId },
      },
      select: { id: true },
    });
    return !!row;
  }

  async createReport(reporterId: string, dto: CreateReportDto) {
    await this.assertDailyLimit(reporterId);

    const existing = await this.prisma.report.findUnique({
      where: {
        reporterId_targetId: { reporterId, targetId: dto.targetId },
      },
    });
    if (existing) {
      throw new ConflictException('You have already reported this target');
    }

    if (dto.targetType === ReportTargetType.PROPERTY) {
      const property = await this.prisma.property.findUnique({
        where: { id: dto.targetId },
        select: { id: true, ownerId: true },
      });
      if (!property) throw new NotFoundException('Property not found');
      if (property.ownerId === reporterId) {
        throw new BadRequestException('You cannot report your own post');
      }
    } else {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.targetId },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('User not found');
      if (user.id === reporterId) {
        throw new BadRequestException('You cannot report yourself');
      }
    }

    try {
      await this.prisma.report.create({
        data: {
          reporterId,
          targetType: dto.targetType,
          targetId: dto.targetId,
          reason: dto.reason,
          description: dto.description?.trim() || null,
          status: ReportStatus.PENDING,
          priority: ReportPriority.MEDIUM,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('You have already reported this target');
      }
      throw e;
    }

    return { message: 'Report submitted. Our team will review it.' };
  }

  async getAllReports(query: FindReportsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.ReportWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.targetType) where.targetType = query.targetType;

    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { id: true, fullName: true, email: true } },
          reviewedBy: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.report.count({ where }),
    ]);

    const maps = await this.loadTargetMaps(items);
    const enriched = this.enrichReports(items, maps);

    const pages = Math.ceil(total / limit) || 0;
    return {
      items: enriched,
      pagination: { total, page, size: limit, pages },
    };
  }

  async getReportsForTarget(targetType: ReportTargetType, targetId: string) {
    const items = await this.prisma.report.findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, fullName: true, email: true } },
        reviewedBy: { select: { id: true, fullName: true, email: true } },
      },
    });
    const maps = await this.loadTargetMaps(items);
    return { items: this.enrichReports(items, maps) };
  }

  private normalizeResolutionAction(
    report: { targetType: ReportTargetType; targetId: string; status: ReportStatus },
    dto: ReviewReportDto,
  ): ReportResolutionAction | null {
    if (dto.status !== ReportStatus.RESOLVED) {
      return null;
    }
    const resolutionAction = dto.action ?? ReportResolutionAction.NONE;

    const userPenalties: ReportResolutionAction[] = [
      ReportResolutionAction.SUSPEND_USER,
      ReportResolutionAction.TEMP_SUSPEND_USER,
      ReportResolutionAction.PERM_BAN_USER,
      ReportResolutionAction.WARNING,
    ];
    if (report.targetType === ReportTargetType.PROPERTY && userPenalties.includes(resolutionAction)) {
      throw new BadRequestException('Cannot apply user penalties when the target is a property');
    }

    const propPenalties: ReportResolutionAction[] = [
      ReportResolutionAction.REMOVE_PROPERTY,
      ReportResolutionAction.TOMBSTONE_PROPERTY,
      ReportResolutionAction.FLAG_PROPERTY,
    ];
    if (report.targetType === ReportTargetType.USER && propPenalties.includes(resolutionAction)) {
      throw new BadRequestException('Cannot apply property penalties when the target is a user');
    }
    return resolutionAction;
  }

  private async applyResolutionAction(
    tx: Prisma.TransactionClient,
    resolutionAction: ReportResolutionAction | null,
    targetType: ReportTargetType,
    targetId: string,
    reason: string,
    dto: ReviewReportDto
  ) {
    if (!resolutionAction || resolutionAction === ReportResolutionAction.NONE) return;

    if (targetType === ReportTargetType.PROPERTY) {
       const property = await tx.property.findUnique({
         where: { id: targetId },
         select: { title: true, ownerId: true },
       });
       if (resolutionAction === ReportResolutionAction.REMOVE_PROPERTY || resolutionAction === ReportResolutionAction.TOMBSTONE_PROPERTY) {
         await tx.property.update({
           where: { id: targetId },
           data: { 
             isBlocked: true, 
             isDeleted: true,
             status: PropertyStatus.INACTIVE,
             description: resolutionAction === ReportResolutionAction.TOMBSTONE_PROPERTY ? 'This content was removed by a moderator.' : undefined
           },
         });
         if (property?.ownerId) {
            this.eventEmitter.emit('notification.send', {
              userId: property.ownerId,
              type: NotificationType.PROPERTY_BLOCKED,
              title: 'Post removed by moderation',
              level: 'error',
              message: `Your post "${property?.title}" was removed after review of user reports (${reason}).`,
              data: { propertyId: targetId },
            });
         }
       } else if (resolutionAction === ReportResolutionAction.FLAG_PROPERTY) {
         // Placeholder for marking flag property
       }
    } else {
       const targetUser = await tx.user.findUnique({
         where: { id: targetId },
         select: { role: true, strikeCount: true },
       });
       if (targetUser?.role === UserRole.ADMIN) {
         throw new BadRequestException('Cannot apply penalties to an administrator');
       }
       if (resolutionAction === ReportResolutionAction.PERM_BAN_USER || resolutionAction === ReportResolutionAction.SUSPEND_USER) {
         await tx.user.update({
           where: { id: targetId },
           data: { isSuspended: true, status: UserStatus.BLOCKED },
         });
       } else if (resolutionAction === ReportResolutionAction.TEMP_SUSPEND_USER) {
         let days = dto.suspensionDays || 7;
         const d = new Date();
         d.setDate(d.getDate() + days);
         await tx.user.update({
           where: { id: targetId },
           data: { 
             isSuspended: true, 
             strikeCount: { increment: 1 },
             status: UserStatus.BLOCKED,
             suspensionExpiresAt: d,
           },
         });
       } else if (resolutionAction === ReportResolutionAction.WARNING) {
         await tx.user.update({
           where: { id: targetId },
           data: { strikeCount: { increment: 1 } },
         });
         this.eventEmitter.emit('notification.send', {
           userId: targetId,
           type: NotificationType.SYSTEM_ALERT,
           title: 'Warning from moderation',
           level: 'warning',
           message: `You have received a warning regarding a recent report (${reason}). Please review our community guidelines.`,
         });
       }
    }
  }

  async reviewReport(reportId: string, adminId: string, dto: ReviewReportDto) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Report not found');
    if (report.status === ReportStatus.RESOLVED || report.status === ReportStatus.REJECTED) {
      throw new BadRequestException('This report has already been reviewed');
    }

    const now = new Date();
    const resolutionAction = this.normalizeResolutionAction(report, dto);

    await this.prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: reportId },
        data: {
          status: dto.status,
          reviewedById: adminId,
          reviewedAt: now,
          resolutionAction,
          adminNotes: dto.adminNotes ?? null,
        },
      });

      if (dto.status === ReportStatus.RESOLVED) {
        await this.applyResolutionAction(tx, resolutionAction, report.targetType, report.targetId, report.reason, dto);
        
        // Record dedicated Moderation Log
        if (resolutionAction && resolutionAction !== ReportResolutionAction.NONE) {
          await tx.moderationLog.create({
            data: {
              adminId,
              targetType: report.targetType,
              targetId: report.targetId,
              actionType: resolutionAction,
              reason: report.reason,
              adminNotes: dto.adminNotes ?? null,
              metadata: dto.suspensionDays ? JSON.stringify({ suspensionDays: dto.suspensionDays }) : null
            }
          });
        }
      }
    });

    return { message: 'Report updated' };
  }

  async reviewTarget(
    targetType: ReportTargetType,
    targetId: string,
    adminId: string,
    dto: ReviewReportDto,
  ) {
    const pending = await this.prisma.report.findMany({
      where: { targetType, targetId, status: { in: [ReportStatus.PENDING, ReportStatus.IN_PROGRESS, ReportStatus.ESCALATED] } },
      orderBy: { createdAt: 'desc' },
    });
    if (pending.length === 0) {
      throw new BadRequestException('No unreviewed reports found for this target');
    }

    const primary = pending[0];
    const resolutionAction = this.normalizeResolutionAction(primary, dto);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.report.updateMany({
        where: { targetType, targetId, status: { in: [ReportStatus.PENDING, ReportStatus.IN_PROGRESS, ReportStatus.ESCALATED] } },
        data: {
          status: dto.status,
          reviewedById: adminId,
          reviewedAt: now,
          resolutionAction,
          adminNotes: dto.adminNotes ?? null,
        },
      });

      if (dto.status === ReportStatus.RESOLVED) {
        await this.applyResolutionAction(tx, resolutionAction, targetType, targetId, primary.reason, dto);

        // Record dedicated Moderation Log
        if (resolutionAction && resolutionAction !== ReportResolutionAction.NONE) {
          await tx.moderationLog.create({
            data: {
              adminId,
              targetType,
              targetId,
              actionType: resolutionAction,
              reason: primary.reason,
              adminNotes: dto.adminNotes ?? null,
              metadata: dto.suspensionDays ? JSON.stringify({ suspensionDays: dto.suspensionDays }) : null
            }
          });
        }
      }
    });

    return { message: 'All pending reports for this target were updated' };
  }
}
