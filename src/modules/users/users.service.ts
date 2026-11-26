import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../core/database/prisma.service";
import * as bcrypt from "bcrypt";
import { Prisma, UserRole } from "@prisma/client";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateMyProfileDto } from "./dto/update-my-profile.dto";
import {
  PaginationDto,
  PaginatedResult,
} from "../../shared/dto/pagination.dto";
import { NotificationsService } from "../notifications/notifications.service";
import {
  buildPhoneLookupCandidates,
  normalizePhoneNumber,
} from "../../shared/utils/phone-number";

function sanitizeBio(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, 2000);
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  /** Key: `${userId}:${newEmailLower}` → OTP (email change verification). */
  private emailChangeOtp = new Map<string, string>();

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(dto: CreateUserDto) {
    const normalizedPhone = normalizePhoneNumber(dto.phone);
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase() },
      });
      if (existing) throw new ConflictException("Email already registered");
    }
    const existingPhone = await this.prisma.user.findFirst({
      where: { phone: { in: buildPhoneLookupCandidates(normalizedPhone) } },
    });
    if (existingPhone) throw new ConflictException("Phone already registered");
    const hash = await bcrypt.hash(dto.password, 10);
    const { password: _, ...rest } = dto;
    return this.prisma.user.create({
      data: {
        ...rest,
        email: dto.email?.toLowerCase(),
        phone: normalizedPhone,
        state: dto.state ?? "",
        district: dto.district ?? "",
        isVerified: false,
        passwordHash: hash,
        role: rest.role as UserRole,
      },
    });
  }

  async findAll(pagination: PaginationDto, filters?: { role?: UserRole }) {
    const { page = 1, limit = 20 } = pagination;
    const where: Record<string, unknown> = {};
    if (filters?.role) where.role = filters.role;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          isEmailVerified: true,
          isPhoneVerified: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    const pages = Math.ceil(total / limit) || 0;
    return {
      items,
      pagination: { total, page, size: limit, pages },
    } satisfies PaginatedResult<(typeof items)[0]>;
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });
    if (!user) throw new NotFoundException("User not found");
    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, email: true },
    });
    return users;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  async findByPhone(phone: string) {
    return this.prisma.user.findFirst({
      where: { phone: { in: buildPhoneLookupCandidates(phone) } },
    });
  }

  async updateMyProfile(userId: string, dto: UpdateMyProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw new NotFoundException("User not found");

    const userUpdate: Prisma.UserUpdateInput = {};

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email !== user.email) {
        if (user.email) {
          throw new BadRequestException(
            "Email is already set. Please use the email verification flow under settings to change it."
          );
        }
        const taken = await this.prisma.user.findFirst({
          where: { email, NOT: { id: userId } },
        });
        if (taken) throw new ConflictException("Email address already in use");
        userUpdate.email = email;
        userUpdate.isEmailVerified = false;
      }
    }

    if (dto.fullName !== undefined) {
      const name = dto.fullName.trim();
      if (name.length < 2)
        throw new BadRequestException("Name must be at least 2 characters");
      userUpdate.fullName = name;
      userUpdate.needsProfileCompletion = false;
    }

    if (dto.phone !== undefined) {
      const phone = normalizePhoneNumber(dto.phone.trim());
      if (phone !== user.phone) {
        const taken = await this.prisma.user.findFirst({
          where: {
            phone: { in: buildPhoneLookupCandidates(phone) },
            NOT: { id: userId },
          },
        });
        if (taken) throw new ConflictException("Phone number already in use");
        userUpdate.phone = phone;
        userUpdate.isPhoneVerified = false;
      }
    }

    /** Keep `User.state` / `User.district` in sync with profile (registration stores them on User only). */
    if (dto.state !== undefined) {
      userUpdate.state = dto.state.trim();
    }
    if (dto.district !== undefined) {
      userUpdate.district = dto.district.trim();
    }

    const profileUpdate: Prisma.UserProfileUpdateInput = {};
    if (dto.bio !== undefined) {
      profileUpdate.bio = dto.bio ? sanitizeBio(dto.bio) : null;
    }
    if (dto.profileImageUrl !== undefined) {
      profileUpdate.profileImageUrl = dto.profileImageUrl?.trim() || null;
    }
    if (dto.address !== undefined) {
      profileUpdate.address = dto.address?.trim() || null;
    }
    if (dto.city !== undefined) {
      profileUpdate.city = dto.city?.trim() || null;
    }
    if (dto.state !== undefined) {
      profileUpdate.state = dto.state?.trim() || null;
    }
    if (dto.country !== undefined) {
      profileUpdate.country = dto.country?.trim() || null;
    }
    if (dto.mandal !== undefined) {
      profileUpdate.mandal = dto.mandal?.trim() || null;
    }
    if (dto.village !== undefined) {
      profileUpdate.village = dto.village?.trim() || null;
    }
    if (dto.alternatePhone !== undefined) {
      profileUpdate.alternatePhone = dto.alternatePhone?.trim() || null;
    }
    if (dto.showPhonePublicly !== undefined) {
      profileUpdate.showPhonePublicly = dto.showPhonePublicly;
    }
    if (dto.accountType !== undefined) {
      profileUpdate.accountType = dto.accountType;
    }
    if (dto.pincode !== undefined) {
      profileUpdate.pincode = dto.pincode?.trim() || null;
    }

    const hasProfilePatch = Object.keys(profileUpdate).length > 0;

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(userUpdate).length > 0) {
        await tx.user.update({ where: { id: userId }, data: userUpdate });
      }
      if (hasProfilePatch) {
        await tx.userProfile.upsert({
          where: { userId },
          create: {
            user: { connect: { id: userId } },
            bio:
              dto.bio !== undefined
                ? dto.bio
                  ? sanitizeBio(dto.bio)
                  : null
                : null,
            profileImageUrl:
              dto.profileImageUrl !== undefined
                ? dto.profileImageUrl?.trim() || null
                : null,
            address:
              dto.address !== undefined ? dto.address?.trim() || null : null,
            city: dto.city !== undefined ? dto.city?.trim() || null : null,
            state: dto.state !== undefined ? dto.state?.trim() || null : null,
            country:
              dto.country !== undefined ? dto.country?.trim() || null : null,
            mandal:
              dto.mandal !== undefined ? dto.mandal?.trim() || null : null,
            village:
              dto.village !== undefined ? dto.village?.trim() || null : null,
            alternatePhone:
              dto.alternatePhone !== undefined
                ? dto.alternatePhone?.trim() || null
                : null,
            showPhonePublicly: dto.showPhonePublicly ?? false,
            accountType: dto.accountType ?? "BUYER",
            pincode:
              dto.pincode !== undefined ? dto.pincode?.trim() || null : null,
          },
          update: profileUpdate,
        });
      }
    });

    return this.findOne(userId);
  }

  async requestEmailChange(userId: string, newEmailRaw: string) {
    const newEmail = newEmailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    if (user.email?.toLowerCase() === newEmail) {
      throw new BadRequestException("This is already your email address");
    }
    const taken = await this.prisma.user.findFirst({
      where: { email: newEmail, NOT: { id: userId } },
    });
    if (taken) throw new ConflictException("That email is already registered");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const key = `${userId}:${newEmail}`;
    this.emailChangeOtp.set(key, otp);
    await this.notifications.sendOtpEmail(
      newEmailRaw.trim(),
      otp,
      "email-change",
    );
    this.logger.log(`Email change OTP sent for user ${userId}`);
    return {
      success: true,
      message: "We sent a verification code to the new email address.",
    };
  }

  async confirmEmailChange(userId: string, newEmailRaw: string, otp: string) {
    const newEmail = newEmailRaw.trim().toLowerCase();
    const key = `${userId}:${newEmail}`;
    const stored = this.emailChangeOtp.get(key);
    if (!stored || stored !== otp.trim()) {
      throw new UnauthorizedException("Invalid or expired verification code");
    }
    this.emailChangeOtp.delete(key);

    const taken = await this.prisma.user.findFirst({
      where: { email: newEmail, NOT: { id: userId } },
    });
    if (taken) throw new ConflictException("That email is no longer available");

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!currentUser?.email)
      throw new NotFoundException("Current email not found");

    await this.prisma.user.update({
      where: { id: userId },
      data: { email: newEmail, isEmailVerified: true },
    });
    await this.linkGuestLeadsToUser(userId, newEmail);
    await this.notifications.sendEmailChangedConfirmationEmails(
      currentUser.email,
      newEmail,
    );
    return this.findOne(userId);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPasswordRaw: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const isCurrentValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!isCurrentValid)
      throw new UnauthorizedException("Current password is incorrect");

    const newPassword = newPasswordRaw.trim();
    if (newPassword.length < 8) {
      throw new BadRequestException(
        "New password must be at least 8 characters",
      );
    }
    const sameAsCurrent = await bcrypt.compare(newPassword, user.passwordHash);
    if (sameAsCurrent) {
      throw new BadRequestException(
        "New password must be different from current password",
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    if (user.email) {
      await this.notifications.sendPasswordChangedEmail(user.email);
    }
    return { success: true, message: "Password changed successfully" };
  }

  private async linkGuestLeadsToUser(userId: string, email: string) {
    const normalizedEmail = email.toLowerCase();
    const result = await this.prisma.propertyLead.updateMany({
      where: { buyerId: null, guestEmail: normalizedEmail },
      data: { buyerId: userId },
    });
    if (result.count > 0) {
      this.logger.log(`Linked ${result.count} guest lead(s) to user ${userId}`);
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    const data: Record<string, unknown> = { ...dto };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      delete data.password;
    }
    return this.prisma.user.update({
      where: { id },
      data: data as never,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.user.delete({ where: { id } });
  }

  // =============================================================================
  // USER BLOCKING SYSTEM
  // =============================================================================

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException("You cannot block yourself");
    }
    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
    });
    if (!target) throw new NotFoundException("User to block not found");
    if (target.role === UserRole.ADMIN) {
      throw new BadRequestException("You cannot block an administrator");
    }

    await this.prisma.blockedUser.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });
    return { success: true, message: "User blocked successfully" };
  }

  async unblockUser(blockerId: string, blockedId: string) {
    try {
      await this.prisma.blockedUser.delete({
        where: { blockerId_blockedId: { blockerId, blockedId } },
      });
    } catch {
      // Ignored if they weren't blocked
    }
    return { success: true, message: "User unblocked successfully" };
  }

  async getBlockedUsers(userId: string) {
    const blocks = await this.prisma.blockedUser.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: { id: true, fullName: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return blocks.map((b) => b.blocked);
  }
}
