import { Controller, Post, Body, UseGuards, Res, Req, UnauthorizedException } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RequestPhoneOtpDto } from './dto/request-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import {
  clearAuthCookies,
  setAuthCookies,
} from './utils/auth-cookies';
import { REFRESH_TOKEN_COOKIE } from './utils/jwt-extractor';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post('token')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const tokens = await this.authService.login(dto.email, dto.password);
    setAuthCookies(res, tokens);
    return { success: true };
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const ipAddress = (req as any).ip || (req as any).headers?.['x-forwarded-for'];
    const tokens = await this.authService.register(dto, ipAddress);
    setAuthCookies(res, tokens);
    const { refresh_token: _refresh, access_token: _access, ...rest } = tokens as Record<string, unknown>;
    return { success: true, ...rest };
  }

  @Post('token/refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) throw new UnauthorizedException('Refresh token missing');

    const tokens = await this.authService.refresh(refreshToken);
    setAuthCookies(res, tokens);
    return { success: true };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookies(res);
    return { success: true };
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ otp: { limit: 5, ttl: 60000 } })
  @Post('phone/request-otp')
  async requestPhoneOtp(@Body() dto: RequestPhoneOtpDto) {
    return this.authService.requestPhoneOtp(dto.phone, dto.channel);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post('phone/verify-otp')
  async verifyPhoneOtp(
    @Body() dto: VerifyPhoneOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ipAddress = (req as any).ip || (req as any).headers?.['x-forwarded-for'];
    const tokens = await this.authService.verifyPhoneOtp(dto.phone, dto.otp, dto.referralCode, ipAddress, dto.channel);
    setAuthCookies(res, tokens);
    const { refresh_token: _refresh, access_token: _access, ...rest } = tokens as Record<string, unknown>;
    return { success: true, ...rest };
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ otp: { limit: 5, ttl: 60000 } })
  @Post('otp')
  async otp(@Body('email') email: string) {
    return this.authService.requestOtp(email);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post('otp/verify')
  async verifyOtp(
    @Body() dto: RegisterDto & { otp: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const ipAddress = (req as any).ip || (req as any).headers?.['x-forwarded-for'];
    const tokens = await this.authService.verifyOtp(dto, ipAddress);
    setAuthCookies(res, tokens);
    const { refresh_token: _refresh, access_token: _access, ...rest } = tokens as Record<string, unknown>;
    return { success: true, ...rest };
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ otp: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }
}
