import {
  Injectable,
  NotFoundException,
  Logger,
  Inject,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../core/database/prisma.service";
import { InjectQueue } from "@nestjs/bullmq";
import { JobsOptions, Queue } from "bullmq";
import { NotificationsGateway } from "./websockets/notifications.gateway";
import {
  PaginationDto,
  PaginatedResult,
} from "../../shared/dto/pagination.dto";
import { EmailService, SendEmailOptions } from "../email/email.service";
import type { EmailDigestListing } from "../email/email.templates";

export enum NotificationType {
  MESSAGE_RECEIVED = "MESSAGE_RECEIVED",
  PROPERTY_APPROVED = "PROPERTY_APPROVED",
  PROPERTY_BLOCKED = "PROPERTY_BLOCKED",
  PROPERTY_REJECTED = "PROPERTY_REJECTED",
  INQUIRY_RECEIVED = "INQUIRY_RECEIVED",
  SYSTEM_ALERT = "SYSTEM_ALERT",
}

type NotificationData = Prisma.InputJsonObject & {
  leadId?: string;
  propertyId?: string;
  messageId?: string;
  reason?: string;
};

export interface NotificationPayload {
  userId: string;
  type: NotificationType | string;
  title: string;
  message: string;
  level?: "info" | "success" | "warning" | "error";
  actionUrl?: string;
  data?: NotificationData;
  emailPayload?: {
    subject: string;
    html: string;
    text?: string;
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private notificationsGateway: NotificationsGateway,
    private emailService: EmailService,
    @Inject("REDIS_ENABLED") private redisEnabled: boolean,
    @Optional() @InjectQueue("push_notifications") private pushQueue?: Queue,
    @Optional() @InjectQueue("email_notifications") private emailQueue?: Queue,
  ) {}

  private getEmailJobOptions(jobId?: string): JobsOptions {
    return {
      jobId,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5_000,
      },
      removeOnComplete: 100,
      removeOnFail: 200,
    };
  }

  private async dispatchEmail(options: SendEmailOptions, jobId?: string) {
    if (this.redisEnabled && this.emailQueue) {
      await this.emailQueue
        .add(
          "send_email",
          {
            to: options.to[0],
            subject: options.subject,
            html: options.html,
            text: options.text,
          },
          this.getEmailJobOptions(jobId),
        )
        .catch((err) =>
          this.logger.error("Failed to queue email notification", err),
        );
      return;
    }

    await this.emailService
      .sendMail(options)
      .catch((err) => this.logger.error("Fallback email failed", err));
  }

  private async dispatchTemplateEmail(
    to: string,
    template: { type: string; subject: string; html: string; text: string },
    jobIdSuffix?: string,
  ) {
    await this.dispatchEmail(
      {
        to: [to],
        subject: template.subject,
        html: template.html,
        text: template.text,
      },
      jobIdSuffix
        ? `${template.type}:${jobIdSuffix}`
        : `${template.type}:${to}`,
    );
  }

  private getAppBaseUrl() {
    return (
      this.configService.get<string>("APP_BASE_URL") || "http://localhost:3000"
    );
  }

  private toAbsoluteAppUrl(path: string) {
    if (/^https?:\/\//.test(path)) return path;
    const baseUrl = this.getAppBaseUrl().replace(/\/$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
  }

  async sendPasswordChangedEmail(email: string) {
    const template = this.emailService.buildPasswordChangedEmailTemplate(
      this.toAbsoluteAppUrl("/profile"),
    );
    await this.dispatchEmail(
      {
        to: [email],
        subject: template.subject,
        html: template.html,
        text: template.text,
      },
      `${template.type}:${email}`,
    );
  }

  async sendEmailChangedConfirmationEmails(oldEmail: string, newEmail: string) {
    const accountUrl = this.toAbsoluteAppUrl("/profile");
    const oldEmailTemplate =
      this.emailService.buildEmailChangedNoticeEmailTemplate(
        "old",
        newEmail,
        accountUrl,
      );
    const newEmailTemplate =
      this.emailService.buildEmailChangedNoticeEmailTemplate(
        "new",
        newEmail,
        accountUrl,
      );

    await Promise.all([
      this.dispatchEmail(
        {
          to: [oldEmail],
          subject: oldEmailTemplate.subject,
          html: oldEmailTemplate.html,
          text: oldEmailTemplate.text,
        },
        `${oldEmailTemplate.type}:${oldEmail}:${newEmail}`,
      ),
      this.dispatchEmail(
        {
          to: [newEmail],
          subject: newEmailTemplate.subject,
          html: newEmailTemplate.html,
          text: newEmailTemplate.text,
        },
        `${newEmailTemplate.type}:${newEmail}`,
      ),
    ]);
  }

  async sendWelcomeEmail(email: string, recipientName: string) {
    const template = this.emailService.buildWelcomeEmailTemplate(
      recipientName,
      this.toAbsoluteAppUrl("/"),
    );
    await this.dispatchTemplateEmail(email, template);
  }

  async sendSignInAlertEmail(params: {
    email: string;
    timestamp: string;
    locationLabel?: string;
    deviceLabel?: string;
  }) {
    const template = this.emailService.buildSignInAlertEmailTemplate(
      {
        timestamp: params.timestamp,
        locationLabel: params.locationLabel,
        deviceLabel: params.deviceLabel,
      },
      this.toAbsoluteAppUrl("/profile"),
    );
    await this.dispatchTemplateEmail(
      params.email,
      template,
      `${params.email}:${params.timestamp}`,
    );
  }

  async sendInquiryReceivedNotification(params: {
    userId: string;
    propertyTitle: string;
    inquirerName: string;
    leadId: string;
    propertyId: string;
  }) {
    const inquiryPath = params.leadId
      ? `/chat?leadId=${params.leadId}`
      : "/chat";
    const inquiryUrl = this.toAbsoluteAppUrl(inquiryPath);
    const template = this.emailService.buildInquiryReceivedEmailTemplate(
      params.inquirerName,
      params.propertyTitle,
      inquiryUrl,
    );

    await this.sendNotification({
      userId: params.userId,
      type: NotificationType.INQUIRY_RECEIVED,
      title: "New inquiry on your post",
      message: `${params.inquirerName} inquired about "${params.propertyTitle}"`,
      data: {
        ...(params.leadId ? { leadId: params.leadId } : {}),
        ...(params.propertyId ? { propertyId: params.propertyId } : {}),
      },
      actionUrl: inquiryPath,
      emailPayload: {
        subject: template.subject,
        html: template.html,
        text: template.text,
      },
    });
  }

  async sendInquiryReplyEmail(params: {
    email: string;
    responderName: string;
    propertyTitle: string;
    replyPreview: string;
    leadId: string;
  }) {
    const template = this.emailService.buildInquiryReplyEmailTemplate(
      params.responderName,
      params.propertyTitle,
      params.replyPreview,
      this.toAbsoluteAppUrl(`/chat?leadId=${params.leadId}`),
    );
    await this.dispatchTemplateEmail(
      params.email,
      template,
      `${params.email}:${params.leadId}`,
    );
  }

  async sendMessageReceivedNotification(params: {
    userId: string;
    title: string;
    message: string;
    leadId: string;
    propertyTitle: string;
    responderName: string;
    messageId?: string;
    sendEmail?: boolean;
  }) {
    const emailPayload = params.sendEmail
      ? (() => {
          const template = this.emailService.buildInquiryReplyEmailTemplate(
            params.responderName,
            params.propertyTitle,
            params.message,
            this.toAbsoluteAppUrl(`/chat?leadId=${params.leadId}`),
          );
          return {
            subject: template.subject,
            html: template.html,
            text: template.text,
          };
        })()
      : undefined;

    await this.sendNotification({
      userId: params.userId,
      type: NotificationType.MESSAGE_RECEIVED,
      title: params.title,
      message: params.message,
      data: {
        leadId: params.leadId,
        ...(params.messageId ? { messageId: params.messageId } : {}),
      },
      actionUrl: `/chat?leadId=${params.leadId}`,
      ...(emailPayload ? { emailPayload } : {}),
    });
  }

  async sendUnreadInquiryDigestEmail(params: {
    email: string;
    unreadCount: number;
    propertyTitles: string[];
  }) {
    const template = this.emailService.buildUnreadInquiryDigestEmailTemplate(
      params.unreadCount,
      this.toAbsoluteAppUrl("/chat"),
      params.propertyTitles,
    );
    await this.dispatchTemplateEmail(
      params.email,
      template,
      `${params.email}:${params.unreadCount}`,
    );
  }

  async sendPropertyApprovedNotification(params: {
    userId: string;
    propertyId: string;
    propertyTitle: string;
    variant?: "approved" | "unblocked";
  }) {
    const listingPath = params.propertyId
      ? `/posts/${params.propertyId}`
      : "/posts";
    const listingUrl = this.toAbsoluteAppUrl(listingPath);
    const isUnblocked = params.variant === "unblocked";
    const template = this.emailService.buildPostApprovedEmailTemplate(
      params.propertyTitle,
      listingUrl,
      isUnblocked
        ? {
            subject: "Your PlotFarm post is live again",
            title: "Your post is visible again",
            intro: `Your post "${params.propertyTitle}" has been unblocked and is now visible again on PlotFarm.`,
          }
        : undefined,
    );

    await this.sendNotification({
      userId: params.userId,
      type: NotificationType.PROPERTY_APPROVED,
      title: isUnblocked ? "Post Unblocked" : "Post Approved",
      level: "success",
      message: isUnblocked
        ? `Your post "${params.propertyTitle}" has been unblocked and is now visible.`
        : `Your post "${params.propertyTitle}" has been approved and is now live!`,
      data: params.propertyId ? { propertyId: params.propertyId } : undefined,
      actionUrl: listingPath,
      emailPayload: {
        subject: template.subject,
        html: template.html,
        text: template.text,
      },
    });
  }

  async sendPropertyRejectedNotification(params: {
    userId: string;
    propertyId: string;
    propertyTitle: string;
    reason: string;
  }) {
    const editPath = params.propertyId
      ? `/posts/${params.propertyId}/edit`
      : "/posts";
    const editUrl = this.toAbsoluteAppUrl(editPath);
    const template = this.emailService.buildPostRejectedEmailTemplate(
      params.propertyTitle,
      params.reason,
      editUrl,
    );

    await this.sendNotification({
      userId: params.userId,
      type: NotificationType.PROPERTY_REJECTED,
      title: "Post Rejected",
      level: "error",
      message: `Your post "${params.propertyTitle}" was rejected. Reason: ${params.reason}. Please edit and resubmit.`,
      data: {
        ...(params.propertyId ? { propertyId: params.propertyId } : {}),
        reason: params.reason,
      },
      actionUrl: '/my-posts',
      emailPayload: {
        subject: template.subject,
        html: template.html,
        text: template.text,
      },
    });
  }

  async sendPropertyBlockedNotification(params: {
    userId: string;
    propertyId: string;
    propertyTitle: string;
    reason?: string;
    title?: string;
    message?: string;
  }) {
    const reviewPath = params.propertyId
      ? `/posts/${params.propertyId}`
      : "/posts";
    const reviewUrl = this.toAbsoluteAppUrl(reviewPath);
    const template = this.emailService.buildPostBlockedEmailTemplate(
      params.propertyTitle,
      reviewUrl,
      params.reason,
    );

    await this.sendNotification({
      userId: params.userId,
      type: NotificationType.PROPERTY_BLOCKED,
      title: params.title ?? "Post Blocked",
      level: "error",
      message:
        params.message ??
        `Your post "${params.propertyTitle}" has been blocked by an administrator.`,
      data: {
        propertyId: params.propertyId,
        ...(params.reason ? { reason: params.reason } : {}),
      },
      actionUrl: reviewPath,
      emailPayload: {
        subject: template.subject,
        html: template.html,
        text: template.text,
      },
    });
  }

  async sendReferralInviteEmail(params: {
    email: string;
    inviterName: string;
    referralPathOrUrl: string;
    rewardSummary: string;
  }) {
    const template = this.emailService.buildReferralInviteEmailTemplate(
      params.inviterName,
      this.toAbsoluteAppUrl(params.referralPathOrUrl),
      params.rewardSummary,
    );
    await this.dispatchTemplateEmail(params.email, template);
  }

  async sendWeeklyPropertyDigestEmail(params: {
    email: string;
    recipientName: string;
    listings: EmailDigestListing[];
  }) {
    const template = this.emailService.buildWeeklyPropertyDigestEmailTemplate(
      params.recipientName,
      this.toAbsoluteAppUrl("/posts"),
      params.listings.map((listing) => ({
        ...listing,
        url: this.toAbsoluteAppUrl(listing.url),
      })),
    );
    await this.dispatchTemplateEmail(params.email, template);
  }

  async sendWinBackEmail(params: {
    email: string;
    recipientName: string;
    highlights: string[];
  }) {
    const template = this.emailService.buildWinBackEmailTemplate(
      params.recipientName,
      this.toAbsoluteAppUrl("/posts"),
      params.highlights,
    );
    await this.dispatchTemplateEmail(params.email, template);
  }

  async sendAdminSystemAlertEmail(params: {
    email: string;
    alertTitle: string;
    alertSummary: string;
    dashboardPathOrUrl?: string;
  }) {
    const template = this.emailService.buildAdminSystemAlertEmailTemplate(
      params.alertTitle,
      params.alertSummary,
      params.dashboardPathOrUrl
        ? this.toAbsoluteAppUrl(params.dashboardPathOrUrl)
        : undefined,
    );
    await this.dispatchTemplateEmail(params.email, template);
  }

  async sendNotification(payload: NotificationPayload) {
    const {
      userId,
      type,
      title,
      message,
      data,
      level = "info",
      actionUrl,
    } = payload;

    // 1. Get user preferences
    const preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId_type: { userId, type } },
    });

    // Default to true if no preference is set
    const inApp = preferences?.inApp ?? true;
    const push = preferences?.push ?? true;
    const email = preferences?.email ?? true;

    // Auto-generate actionUrl if not provided (best effort)
    let finalActionUrl = actionUrl;
    if (!finalActionUrl && data) {
      if (type === "MESSAGE_RECEIVED" && data.leadId) {
        finalActionUrl = `/chat?leadId=${data.leadId}`;
      } else if (type === "PROPERTY_REJECTED") {
        finalActionUrl = `/my-posts`;
      } else if (
        (type === "PROPERTY_APPROVED" || type === "PROPERTY_BLOCKED") &&
        data.propertyId
      ) {
        finalActionUrl = `/posts/${data.propertyId}`;
      } else if (type === "INQUIRY_RECEIVED" && data.leadId) {
        finalActionUrl = `/chat?leadId=${data.leadId}`;
      }
    }

    // 2. Always store in DB (source of truth) if inApp is enabled
    let notification = null;
    if (inApp) {
      notification = await this.prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          level,
          actionUrl: finalActionUrl,
          data,
        },
      });

      // 3. Emit real-time update via WebSocket
      const unreadCount = await this.getUnreadCount(userId);
      this.notificationsGateway.emitToUser(userId, "notification", {
        notification,
        unreadCount,
      });
    }

    // 4. Handle Push Notifications
    if (push) {
      const devices = await this.prisma.deviceToken.findMany({
        where: { userId },
        select: { token: true },
      });
      const tokens = devices.map((device) => device.token);

      if (this.redisEnabled && this.pushQueue && tokens.length > 0) {
        await this.pushQueue
          .add("send_push", {
            tokens,
            title,
            message,
            data,
          })
          .catch((err) =>
            this.logger.error("Failed to queue push notification", err),
          );
      }
    }

    // 5. Handle Email Notifications
    if (email && payload.emailPayload) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user?.email) {
        await this.dispatchEmail({
          to: [user.email],
          subject: payload.emailPayload.subject,
          html: payload.emailPayload.html,
          text: payload.emailPayload.text,
        });
      }
    }

    return notification;
  }

  async findAll(pagination: PaginationDto, userId: string) {
    const { page = 1, limit = 20 } = pagination;

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    const pages = Math.ceil(total / limit) || 0;
    return {
      items,
      pagination: { total, page, size: limit, pages },
    } satisfies PaginatedResult<any>;
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) throw new NotFoundException("Notification not found");

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async registerDeviceToken(userId: string, token: string, platform?: string) {
    return this.prisma.deviceToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { userId, token, platform },
    });
  }

  async unregisterDeviceToken(token: string) {
    return this.prisma.deviceToken.deleteMany({
      where: { token },
    });
  }

  async updatePreferences(
    userId: string,
    type: string,
    preferences: { inApp?: boolean; push?: boolean; email?: boolean },
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type } },
      update: preferences,
      create: { userId, type, ...preferences },
    });
  }

  async broadcast(payload: Omit<NotificationPayload, "userId">) {
    const users = await this.prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    this.logger.log(
      `Broadcasting notification to ${users.length} users: ${payload.title}`,
    );

    // Processing in batches to avoid overloading DB/Queue
    const batchSize = 50;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      await Promise.all(
        batch.map((user) =>
          this.sendNotification({ ...payload, userId: user.id }),
        ),
      );
    }

    return { success: true, count: users.length };
  }

  // --- Helpers for backward compatibility ---

  async sendOtpEmail(
    email: string,
    otp: string,
    purpose: "registration" | "email-change" = "registration",
  ) {
    const expiresInMinutes =
      this.configService.get<number>("otp.expiresInMinutes") ?? 10;
    const template = this.emailService.buildOtpEmailTemplate(
      otp,
      purpose,
      expiresInMinutes,
    );
    await this.dispatchEmail(
      {
        to: [email],
        subject: template.subject,
        html: template.html,
        text: template.text,
      },
      `${template.type}:${email}:${otp}`,
    );
  }

  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    appBaseUrl: string,
  ) {
    const template = this.emailService.buildPasswordResetEmailTemplate(
      resetToken,
      appBaseUrl,
    );
    await this.dispatchEmail(
      {
        to: [email],
        subject: template.subject,
        html: template.html,
        text: template.text,
      },
      `${template.type}:${email}:${resetToken}`,
    );
  }

  async sendPostApproval(
    userId: string,
    propertyTitle: string,
    propertyId?: string,
  ) {
    await this.sendPropertyApprovedNotification({
      userId,
      propertyId: propertyId ?? "",
      propertyTitle,
    });
  }

  async sendInterestNotification(
    userId: string,
    interestedUserName: string,
    propertyTitle: string,
    leadId?: string,
    propertyId?: string,
  ) {
    await this.sendInquiryReceivedNotification({
      userId,
      propertyTitle,
      inquirerName: interestedUserName,
      leadId: leadId ?? "",
      propertyId: propertyId ?? "",
    });
  }
}
