import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../core/database/prisma.service";
import { LeadStatus, Prisma } from "@prisma/client";
import {
  PaginationDto,
  PaginatedResult,
} from "../../shared/dto/pagination.dto";
import { CreatePropertyLeadDto } from "./dto/create-property-lead.dto";
import { CreatePublicLeadDto } from "./dto/create-public-lead.dto";
import { UpdatePropertyLeadDto } from "./dto/update-property-lead.dto";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  NotificationsService,
  NotificationType,
} from "../notifications/notifications.service";

import { ChatGateway } from "./websockets/chat.gateway";

/** Consistent lead summary for API consumers (camelCase JSON). */
export type PropertyLeadSummary = {
  id: string;
  propertyId: string;
  buyerId: string | null;
  guestEmail: string | null;
  createdAt: Date;
};

@Injectable()
export class PropertyLeadsService {
  private readonly logger = new Logger(PropertyLeadsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private notificationsService: NotificationsService,
    private chatGateway: ChatGateway,
  ) {}

  /** Ensure user is owner of the property, buyer of the lead, or has admin role. */
  private async assertCanAccessLead(
    leadId: string,
    userId: string,
    role?: string,
  ): Promise<void> {
    const lead = await this.prisma.propertyLead.findUnique({
      where: { id: leadId },
      select: {
        property: { select: { ownerId: true } },
        buyerId: true,
      },
    });
    if (!lead) throw new NotFoundException("Property lead not found");
    const isOwner = lead.property.ownerId === userId;
    const isBuyer = lead.buyerId === userId;
    const isAdmin = role === "ADMIN";
    if (!isOwner && !isBuyer && !isAdmin) {
      throw new ForbiddenException("You do not have access to this lead");
    }
  }

  async create(dto: CreatePropertyLeadDto, buyerId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: dto.propertyId },
      select: { id: true, title: true, ownerId: true, isBlocked: true },
    });
    if (!property) throw new NotFoundException("Property not found");
    if (property.isBlocked) {
      throw new BadRequestException("This post is not available");
    }
    if (property.ownerId === buyerId) {
      throw new BadRequestException("You cannot inquire on your own post");
    }

    const lead = await this.prisma.propertyLead.create({
      data: { ...dto, buyerId } as never,
      include: {
        property: { select: { id: true, title: true, ownerId: true } },
        buyer: { select: { id: true, fullName: true, email: true } },
      },
    });

    // Mirror initial message to message history for chat bubbles
    if (dto.message) {
      await this.prisma.propertyLeadMessage.create({
        data: {
          leadId: lead.id,
          senderId: buyerId,
          message: dto.message.trim(),
          fromOwner: false,
        },
      });
    }

    if (lead.property.ownerId && lead.property.ownerId !== buyerId) {
      const buyerLabel = lead.buyer?.fullName || lead.buyer?.email || "A buyer";
      await this.notificationsService.sendInquiryReceivedNotification({
        userId: lead.property.ownerId,
        propertyTitle: lead.property.title,
        inquirerName: buyerLabel,
        leadId: lead.id,
        propertyId: lead.property.id,
      });
    }

    return lead;
  }

  private readonly leadSummarySelect = {
    id: true,
    propertyId: true,
    buyerId: true,
    guestEmail: true,
    createdAt: true,
  } satisfies Prisma.PropertyLeadSelect;

  private toLeadSummary(lead: {
    id: string;
    propertyId: string;
    buyerId: string | null;
    guestEmail: string | null;
    createdAt: Date;
  }): PropertyLeadSummary {
    return {
      id: lead.id,
      propertyId: lead.propertyId,
      buyerId: lead.buyerId,
      guestEmail: lead.guestEmail,
      createdAt: lead.createdAt,
    };
  }

  /**
   * Public (guest) lead submission.
   * Creates a PropertyLead with buyerId = null and guest identity fields filled.
   * @param currentUserId When present (valid JWT), blocks the post owner from submitting.
   */
  async createPublic(dto: CreatePublicLeadDto, currentUserId?: string) {
    const guestEmail = dto.email.toLowerCase();

    const property = await this.prisma.property.findUnique({
      where: { id: dto.propertyId },
      select: {
        id: true,
        title: true,
        ownerId: true,
        isBlocked: true,
        owner: { select: { email: true, phone: true } },
      },
    });

    if (!property) throw new NotFoundException("Property not found");
    if (property.isBlocked) {
      throw new BadRequestException("This post is not available");
    }
    if (!property.ownerId)
      throw new BadRequestException("Property owner not available");

    if (currentUserId && property.ownerId === currentUserId) {
      throw new BadRequestException("You cannot inquire on your own post");
    }

    const ownerEmail = property.owner?.email ?? null;
    const ownerPhone = property.owner?.phone ?? null;

    // Prevent the property owner from submitting a lead using their own contact details (guest flow).
    if (guestEmail && ownerEmail && guestEmail === ownerEmail.toLowerCase()) {
      throw new BadRequestException("You cannot inquire on your own post");
    }
    if (dto.phone && ownerPhone && dto.phone === ownerPhone) {
      throw new BadRequestException("You cannot inquire on your own post");
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentDuplicate = await this.prisma.propertyLead.findFirst({
      where: {
        propertyId: dto.propertyId,
        guestEmail,
        createdAt: { gte: tenMinutesAgo },
      },
      select: this.leadSummarySelect,
    });

    if (recentDuplicate) {
      this.logger.log(
        `Guest lead deduped: propertyId=${dto.propertyId} email=${guestEmail} existingLeadId=${recentDuplicate.id}`,
      );
      return {
        ...this.toLeadSummary(recentDuplicate),
        message: "Lead submitted successfully",
        deduplicated: true,
      };
    }

    const lead = await this.prisma.propertyLead.create({
      data: {
        propertyId: dto.propertyId,
        buyerId: null,
        message: dto.message,
        contactPhone: dto.phone ?? null,
        guestName: dto.name,
        guestEmail,
        guestPhone: dto.phone ?? null,
        status: LeadStatus.NEW,
      } as never,
      select: this.leadSummarySelect,
    });

    await this.notificationsService.sendInquiryReceivedNotification({
      userId: property.ownerId,
      propertyTitle: property.title,
      inquirerName: `${dto.name} (Guest)`,
      leadId: lead.id,
      propertyId: dto.propertyId,
    });

    this.logger.log(
      `Guest lead created: leadId=${lead.id} propertyId=${dto.propertyId} email=${guestEmail}`,
    );

    return {
      ...this.toLeadSummary(lead),
      message: "Lead submitted successfully",
      deduplicated: false,
    };
  }

  async findAll(
    pagination: PaginationDto,
    filters?: { propertyId?: string; buyerId?: string; status?: LeadStatus },
  ) {
    const { page = 1, limit = 20 } = pagination;
    const where: Record<string, unknown> = {};
    if (filters?.propertyId) where.propertyId = filters.propertyId;
    if (filters?.buyerId) where.buyerId = filters.buyerId;
    if (filters?.status) where.status = filters.status;

    const [items, total] = await Promise.all([
      this.prisma.propertyLead.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          property: {
            select: {
              id: true,
              title: true,
              ownerId: true,
              owner: { select: { id: true, fullName: true, email: true } },
            },
          },
          buyer: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.propertyLead.count({ where }),
    ]);

    const pages = Math.ceil(total / limit) || 0;
    return {
      items,
      pagination: { total, page, size: limit, pages },
    } satisfies PaginatedResult<(typeof items)[0]>;
  }

  async findOne(id: string, userId?: string, role?: string) {
    const lead = await this.prisma.propertyLead.findUnique({
      where: { id },
      include: { property: true, buyer: true },
    });
    if (!lead) throw new NotFoundException("Property lead not found");
    if (userId != null) await this.assertCanAccessLead(id, userId, role);
    return lead;
  }

  async update(
    id: string,
    dto: UpdatePropertyLeadDto,
    userId?: string,
    role?: string,
  ) {
    if (userId != null) await this.assertCanAccessLead(id, userId, role);
    else await this.findOne(id);
    return this.prisma.propertyLead.update({
      where: { id },
      data: dto as never,
      include: { property: true, buyer: true },
    });
  }

  async remove(id: string, userId?: string, role?: string) {
    if (userId != null) await this.assertCanAccessLead(id, userId, role);
    else await this.findOne(id);
    return this.prisma.propertyLead.delete({ where: { id } });
  }

  async findForOwner(ownerId: string) {
    return this.prisma.propertyLead.findMany({
      where: { property: { ownerId } },
      include: {
        property: { select: { id: true, title: true, images: true } },
        buyer: { select: { id: true, fullName: true, email: true } },
        messages: {
          include: {
            sender: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getMessagesForUser(leadId: string, userId: string, role?: string) {
    const lead = await this.prisma.propertyLead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        property: { select: { ownerId: true } },
        buyerId: true,
      },
    });
    if (!lead) throw new NotFoundException("Property lead not found");
    const isAdmin = role === "ADMIN";
    const isOwner = lead.property.ownerId === userId;
    const isBuyer = lead.buyerId != null && lead.buyerId === userId;
    if (!isAdmin && !isOwner && !isBuyer) {
      throw new ForbiddenException(
        "You do not have access to this conversation",
      );
    }

    return this.prisma.propertyLeadMessage.findMany({
      where: { leadId },
      include: {
        sender: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async addMessage(leadId: string, userId: string, text: string) {
    const lead = await this.prisma.propertyLead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        property: {
          select: {
            ownerId: true,
            title: true,
            owner: { select: { email: true, fullName: true } },
          },
        },
        buyerId: true,
        buyer: { select: { email: true, fullName: true } },
      },
    });
    if (!lead) throw new NotFoundException("Property lead not found");
    const isOwner = lead.property.ownerId === userId;
    const isBuyer = lead.buyerId != null && lead.buyerId === userId;
    if (!isOwner && !isBuyer) {
      throw new ForbiddenException(
        "You do not have access to this conversation",
      );
    }

    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) {
      throw new BadRequestException("Message cannot be empty");
    }

    const message = await this.prisma.propertyLeadMessage.create({
      data: {
        leadId,
        senderId: userId,
        message: trimmed,
        fromOwner: isOwner,
      },
      include: {
        sender: { select: { id: true, fullName: true, email: true } },
      },
    });

    // Real-time broadcast
    this.chatGateway.emitNewMessage(leadId, message);

    const roomId = `lead_${leadId}`;

    if (isOwner && lead.buyerId) {
      if (!this.chatGateway.isUserInRoom(lead.buyerId, roomId)) {
        await this.notificationsService.sendMessageReceivedNotification({
          userId: lead.buyerId,
          title: "Reply on your inquiry",
          message: trimmed,
          leadId,
          messageId: message.id,
          propertyTitle: lead.property.title,
          responderName:
            message.sender.fullName ||
            lead.property.owner?.fullName ||
            "Property owner",
          sendEmail: Boolean(lead.buyer?.email),
        });
      }
    }
    if (isBuyer && lead.property.ownerId) {
      if (!this.chatGateway.isUserInRoom(lead.property.ownerId, roomId)) {
        await this.notificationsService.sendMessageReceivedNotification({
          userId: lead.property.ownerId,
          title: "New reply on your post inquiry",
          message: trimmed,
          leadId,
          messageId: message.id,
          propertyTitle: lead.property.title,
          responderName:
            message.sender.fullName || lead.buyer?.fullName || "Buyer",
          sendEmail: Boolean(lead.property.owner?.email),
        });
      }
    }

    return message;
  }

  async markAsRead(leadId: string, userId: string) {
    const lead = await this.prisma.propertyLead.findUnique({
      where: { id: leadId },
      include: { property: { select: { ownerId: true } } },
    });
    if (!lead) return;

    const data: any = {};
    if (lead.property.ownerId === userId) data.ownerReadAt = new Date();
    if (lead.buyerId === userId) data.buyerReadAt = new Date();

    if (Object.keys(data).length > 0) {
      return this.prisma.propertyLead.update({
        where: { id: leadId },
        data,
      });
    }
  }

  async findForBuyer(buyerId: string) {
    return this.prisma.propertyLead.findMany({
      where: { buyerId },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            images: true,
            owner: { select: { id: true, fullName: true, email: true } },
          },
        },
        buyer: { select: { id: true, fullName: true, email: true } },
        messages: {
          include: {
            sender: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
