import {
  Injectable,
  UnauthorizedException,
  Logger,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { OtpChannel, OtpPurpose } from "@prisma/client";
import { UsersService } from "../users/users.service";
import { PrismaService } from "../../core/database/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SmsService } from "../sms/sms.service";
import { WhatsappService } from "../whatsapp/whatsapp.service";
import { ReferralsService } from "../referrals/referrals.service";
import { CreditsService } from "../credits/credits.service";
import { RegisterDto } from "./dto/register.dto";
import { CreateUserDto, UserRoleEnum } from "../users/dto/create-user.dto";
import {
  buildPhoneLookupCandidates,
  normalizePhoneNumber,
  toE164Phone,
} from "../../shared/utils/phone-number";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private isDevOtpEnabled(): boolean {
    return this.config.get<boolean>("otp.useDevDefault") === true;
  }

  private getDevDefaultOtp(): string {
    return this.config.get<string>("otp.devDefaultCode") || "111111";
  }

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private smsService: SmsService,
    private whatsappService: WhatsappService,
    private referralsService: ReferralsService,
    private creditsService: CreditsService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException("Invalid email or password");
    this.ensureUserCanSignIn(user);
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("Invalid email or password");
    return this.issueTokensForUser(user);
  }

  async register(dto: RegisterDto, ipAddress?: string) {
    const createDto: CreateUserDto = {
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      password: dto.password,
      state: dto.state,
      district: dto.district,
      role: UserRoleEnum.USER,
    };
    const user = await this.usersService.create(createDto);

    // Issue Signup Bonus (5 Credits)
    await this.issueSignupBonus(user.id);

    // Link guest leads where guest email matches the new user (never overwrites buyerId).
    await this.linkGuestLeadsToUser(user.id, user.email, user.phone);

    let referralAttribution: any = undefined;
    // Attribute referral if a referral code was passed
    if (dto.referralCode) {
      try {
        const attribution = await this.referralsService.recordReferral(
          user.id,
          dto.referralCode,
          ipAddress,
        );
        referralAttribution = attribution ?? { ok: false, reason: "UNKNOWN" };
        if (!attribution?.ok) {
          this.logger.warn(
            `Referral attribution no-op for user ${user.id} (reason=${attribution?.reason ?? "UNKNOWN"})`,
          );
          await this.notificationsService.sendNotification({
            userId: user.id,
            type: "REFERRAL_ATTRIBUTION_FAILED",
            title: "Referral link could not be applied",
            message:
              "Your referral code could not be applied to this account. If you believe this is incorrect, contact support or try again from the referral link.",
            level: "warning",
            actionUrl: "/referrals",
            data: { reason: attribution?.reason ?? "UNKNOWN" },
          });
        }

        // Always persist an auditable attribution attempt result (best effort).
        await this.notificationsService.sendNotification({
          userId: user.id,
          type: "REFERRAL_ATTRIBUTION_RESULT",
          title: attribution?.ok ? "Referral applied" : "Referral not applied",
          message: attribution?.ok
            ? "Your signup was attributed to a referral."
            : `Referral attribution did not apply (reason: ${attribution?.reason ?? "UNKNOWN"}).`,
          level: attribution?.ok ? "success" : "warning",
          actionUrl: "/referrals",
          data: {
            referralCode: dto.referralCode,
            ...(attribution ?? { ok: false, reason: "UNKNOWN" }),
          },
        });
      } catch (err) {
        this.logger.error("Failed to record referral", err);
      }
    }

    const tokens = await this.issueTokensForUser(user);
    if (user.email) {
      await this.notificationsService.sendWelcomeEmail(
        user.email,
        user.fullName || "there",
      );
    }
    return { ...tokens, referralAttribution };
  }

  private async linkGuestLeadsToUser(
    userId: string,
    email: string | null,
    phone: string | null,
  ) {
    const updates = [];
    const normalizedEmail = email ? email.toLowerCase() : null;
    if (normalizedEmail) {
      updates.push(
        this.prisma.propertyLead.updateMany({
          where: {
            buyerId: null,
            guestEmail: normalizedEmail,
          },
          data: {
            buyerId: userId,
          },
        }),
      );
    }

    if (phone) {
      updates.push(
        this.prisma.propertyLead.updateMany({
          where: {
            buyerId: null,
            guestPhone: { in: buildPhoneLookupCandidates(phone) },
          },
          data: {
            buyerId: userId,
          },
        }),
      );
    }

    if (updates.length === 0) return;

    const results = await Promise.all(updates);
    const linkedCount = results.reduce((sum, result) => sum + result.count, 0);
    if (linkedCount > 0) {
      this.logger.log(`Linked ${linkedCount} guest lead(s) to user ${userId}`);
    }
  }

  async requestOtp(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const devOtp = this.getDevDefaultOtp();

    if (this.isDevOtpEnabled()) {
      return {
        success: true,
        deliverySkipped: true,
        message: `Development mode: use verification code ${devOtp}.`,
      };
    }

    const otp = await this.createOtpChallenge({
      channel: OtpChannel.EMAIL,
      purpose: OtpPurpose.REGISTRATION,
      target: normalizedEmail,
    });
    await this.notificationsService.sendOtpEmail(
      normalizedEmail,
      otp,
      "registration",
    );
    this.logger.log("Registration OTP sent");
    return { success: true, message: "OTP sent to email" };
  }

  async verifyOtp(dto: RegisterDto & { otp: string }, ipAddress?: string) {
    await this.consumeOtpChallenge({
      channel: OtpChannel.EMAIL,
      purpose: OtpPurpose.REGISTRATION,
      target: dto.email.trim().toLowerCase(),
      otp: dto.otp,
    });

    const createDto: CreateUserDto = {
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      password: dto.password,
      state: dto.state,
      district: dto.district,
      role: UserRoleEnum.USER,
    };
    const user = await this.usersService.create(createDto);

    // Issue Signup Bonus (5 Credits)
    await this.issueSignupBonus(user.id);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true, isVerified: true },
    });
    await this.linkGuestLeadsToUser(user.id, user.email, user.phone);

    let referralAttribution: any = undefined;
    if (dto.referralCode) {
      try {
        const attribution = await this.referralsService.recordReferral(
          user.id,
          dto.referralCode,
          ipAddress,
        );
        referralAttribution = attribution ?? { ok: false, reason: "UNKNOWN" };
        if (!attribution?.ok) {
          this.logger.warn(
            `Referral attribution no-op on verifyOtp for user ${user.id} (reason=${attribution?.reason ?? "UNKNOWN"})`,
          );
          await this.notificationsService.sendNotification({
            userId: user.id,
            type: "REFERRAL_ATTRIBUTION_FAILED",
            title: "Referral link could not be applied",
            message:
              "Your referral code could not be applied to this account. If you believe this is incorrect, contact support or try again from the referral link.",
            level: "warning",
            actionUrl: "/referrals",
            data: { reason: attribution?.reason ?? "UNKNOWN" },
          });
        }

        // Always persist an auditable attribution attempt result (best effort).
        await this.notificationsService.sendNotification({
          userId: user.id,
          type: "REFERRAL_ATTRIBUTION_RESULT",
          title: attribution?.ok ? "Referral applied" : "Referral not applied",
          message: attribution?.ok
            ? "Your signup was attributed to a referral."
            : `Referral attribution did not apply (reason: ${attribution?.reason ?? "UNKNOWN"}).`,
          level: attribution?.ok ? "success" : "warning",
          actionUrl: "/referrals",
          data: {
            referralCode: dto.referralCode,
            ...(attribution ?? { ok: false, reason: "UNKNOWN" }),
          },
        });
      } catch (err) {
        this.logger.error("Failed to record referral on verifyOtp", err);
      }
    }

    const tokens = await this.issueTokensForUser(user);
    if (user.email) {
      await this.notificationsService.sendWelcomeEmail(
        user.email,
        user.fullName || "there",
      );
    }
    return { ...tokens, referralAttribution };
  }

  async requestPhoneOtp(phone: string, channel: 'SMS' | 'WHATSAPP' = 'SMS') {
    const defaultCountryCode =
      this.config.get<string>("sns.defaultCountryCode") || "+91";
    const normalizedPhone = normalizePhoneNumber(phone, defaultCountryCode);
    const e164Phone = toE164Phone(phone, defaultCountryCode);

    const otpChannel = channel === 'WHATSAPP' ? OtpChannel.WHATSAPP : OtpChannel.SMS;
    const devOtp = this.getDevDefaultOtp();

    if (this.isDevOtpEnabled()) {
      return {
        success: true,
        deliverySkipped: true,
        message: `Development mode: use verification code ${devOtp}.`,
      };
    }

    const otp = await this.createOtpChallenge({
      channel: otpChannel,
      purpose: OtpPurpose.PHONE_LOGIN,
      target: normalizedPhone,
    });
    const otpExpiresInMinutes =
      this.config.get<number>("otp.expiresInMinutes") ?? 10;

    if (channel === 'WHATSAPP') {
      try {
        await this.whatsappService.sendOtp(e164Phone, otp, otpExpiresInMinutes);
        this.logger.log("WhatsApp OTP sent");
      } catch (error) {
        this.logger.error(`Failed to send WhatsApp OTP: ${(error as Error).message}`);
        // If it's a configuration error, we want to be explicit.
        if ((error as Error).message.includes('disabled') || (error as Error).message.includes('configuration')) {
          throw new BadRequestException(`WhatsApp delivery is currently unavailable: ${(error as Error).message}`);
        }
        throw error;
      }
    } else {
      await this.smsService.sendOtpSms(e164Phone, otp, otpExpiresInMinutes);
      this.logger.log("Phone OTP sent");
    }

    return {
      success: true,
      message:
        channel === 'WHATSAPP' 
          ? "A verification code has been sent to your WhatsApp number."
          : "If this mobile number can receive SMS, a verification code has been sent.",
    };
  }

  async verifyPhoneOtp(
    phone: string,
    otp: string,
    referralCode?: string,
    ipAddress?: string,
    channel: 'SMS' | 'WHATSAPP' = 'SMS',
  ) {
    const defaultCountryCode =
      this.config.get<string>("sns.defaultCountryCode") || "+91";
    const normalizedPhone = normalizePhoneNumber(phone, defaultCountryCode);

    const otpChannel = channel === 'WHATSAPP' ? OtpChannel.WHATSAPP : OtpChannel.SMS;

    await this.consumeOtpChallenge({
      channel: otpChannel,
      purpose: OtpPurpose.PHONE_LOGIN,
      target: normalizedPhone,
      otp,
    });

    let user = await this.prisma.user.findFirst({
      where: {
        phone: {
          in: buildPhoneLookupCandidates(normalizedPhone, defaultCountryCode),
        },
      },
    });

    let createdByPhoneOtp = false;
    if (!user) {
      user = await this.createPhoneOtpUser(normalizedPhone);
      createdByPhoneOtp = true;
      // Issue Signup Bonus for new SMS registrations
      await this.issueSignupBonus(user.id);
    }

    this.ensureUserCanSignIn(user);

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isPhoneVerified: true,
        isVerified: true,
        needsProfileCompletion: createdByPhoneOtp
          ? true
          : user.needsProfileCompletion,
      },
    });

    await this.linkGuestLeadsToUser(
      updatedUser.id,
      updatedUser.email,
      updatedUser.phone,
    );
    if (createdByPhoneOtp && referralCode?.trim()) {
      await this.referralsService
        .recordReferral(updatedUser.id, referralCode.trim(), ipAddress)
        .catch((err) =>
          this.logger.error("Failed to record referral on verifyPhoneOtp", err),
        );
    }
    return this.issueTokensForUser(updatedUser);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get("jwt.secret"),
      });
      if (payload.type !== "refresh") throw new UnauthorizedException();
      const user = await this.usersService.findOne(payload.sub);
      this.ensureUserCanSignIn(user);
      return this.issueTokensForUser(user);
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }

  /** Initiate password reset — always returns success to prevent email enumeration. */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: token, passwordResetExpiry: expiry },
      });
      const appBaseUrl =
        this.config.get<string>("APP_BASE_URL") || "http://localhost:3000";
      await this.notificationsService.sendPasswordResetEmail(
        user.email!,
        token,
        appBaseUrl,
      );
      this.logger.log(`Password reset email sent to ${email}`);
    }
    // Always return success — prevents email enumeration
    return {
      success: true,
      message:
        "If an account exists with that email, a reset link has been sent.",
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { passwordResetToken: token },
    });
    if (
      !user ||
      !user.passwordResetExpiry ||
      user.passwordResetExpiry < new Date()
    ) {
      throw new BadRequestException("Invalid or expired reset token");
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });
    return { success: true, message: "Password updated successfully" };
  }

  private buildTokenResponse(user: {
    id: string;
    email?: string | null;
    role: string;
  }) {
    const secret = this.config.get<string>("jwt.secret");
    const expiresIn = this.config.get<string>("jwt.expiresIn") || '30m';
    const refreshExpiresIn = this.config.get<string>("jwt.refreshExpiresIn") || '7d';
    
    const access_token = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email ?? undefined,
        role: user.role,
        type: "access",
      },
      { secret, expiresIn: expiresIn as any },
    );
    const refresh_token = this.jwtService.sign(
      { sub: user.id, type: "refresh" },
      { secret, expiresIn: refreshExpiresIn as any },
    );
    return { access_token, refresh_token };
  }

  private async issueTokensForUser(user: {
    id: string;
    email?: string | null;
    role: string;
  }) {
    await this.referralsService
      .getOrCreateCode(user.id)
      .catch((err) =>
        this.logger.error(
          `Failed to ensure referral code for user ${user.id}`,
          err,
        ),
      );
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.buildTokenResponse(user);
  }

  private ensureUserCanSignIn(user: {
    isSuspended?: boolean;
    status?: string;
  }) {
    if (user.isSuspended || user.status === "BLOCKED") {
      throw new UnauthorizedException("Account suspended");
    }
  }

  private async createOtpChallenge(input: {
    channel: OtpChannel;
    purpose: OtpPurpose;
    target: string;
  }) {
    if (this.isDevOtpEnabled()) {
      return this.getDevDefaultOtp();
    }

    // Production: random 6-digit OTP (set OTP_USE_DEV_DEFAULT=false to enable).
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await bcrypt.hash(otp, 10);
    const expiresInMinutes =
      this.config.get<number>("otp.expiresInMinutes") ?? 10;
    const maxAttempts = this.config.get<number>("otp.maxAttempts") ?? 5;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    await this.prisma.authOtpChallenge.deleteMany({
      where: {
        channel: input.channel,
        purpose: input.purpose,
        target: input.target,
      },
    });

    await this.prisma.authOtpChallenge.create({
      data: {
        channel: input.channel,
        purpose: input.purpose,
        target: input.target,
        codeHash,
        expiresAt,
        maxAttempts,
      },
    });

    return otp;
  }

  private async consumeOtpChallenge(input: {
    channel: OtpChannel;
    purpose: OtpPurpose;
    target: string;
    otp: string;
  }) {
    if (this.isDevOtpEnabled()) {
      if (input.otp !== this.getDevDefaultOtp()) {
        throw new UnauthorizedException("Invalid or expired verification code");
      }
      return;
    }

    const challenge = await this.prisma.authOtpChallenge.findFirst({
      where: {
        channel: input.channel,
        purpose: input.purpose,
        target: input.target,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!challenge) {
      throw new UnauthorizedException("Invalid or expired verification code");
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      await this.prisma.authOtpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw new UnauthorizedException("Invalid or expired verification code");
    }

    const isValid = await bcrypt.compare(input.otp, challenge.codeHash);
    if (!isValid) {
      const nextAttempts = challenge.attempts + 1;
      await this.prisma.authOtpChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts: nextAttempts,
          consumedAt:
            nextAttempts >= challenge.maxAttempts ? new Date() : undefined,
        },
      });
      throw new UnauthorizedException("Invalid or expired verification code");
    }

    await this.prisma.authOtpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
  }

  private async createPhoneOtpUser(phone: string) {
    const createDto: CreateUserDto = {
      fullName: `PlotFarm User ${phone.slice(-4)}`,
      phone,
      password: crypto.randomBytes(24).toString("hex"),
      role: UserRoleEnum.USER,
      state: "",
      district: "",
    };

    try {
      const user = await this.usersService.create(createDto);
      return this.prisma.user.update({
        where: { id: user.id },
        data: {
          isPhoneVerified: true,
          isVerified: true,
          needsProfileCompletion: true,
        },
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        const existingUser = await this.prisma.user.findFirst({
          where: { phone: { in: buildPhoneLookupCandidates(phone) } },
        });
        if (existingUser) return existingUser;
      }
      throw error;
    }
  }

  private async issueSignupBonus(userId: string) {
    try {
      const granted =
        await this.creditsService.ensureWelcomeSignupCredits(userId);
      if (!granted) {
        this.logger.warn(
          `Signup welcome credits not granted at registration for ${userId} (may already exist, outside window, or retry on next balance read).`,
        );
      }
    } catch (err) {
      this.logger.error(`Failed to issue signup bonus for ${userId}`, err);
    }
  }
}
