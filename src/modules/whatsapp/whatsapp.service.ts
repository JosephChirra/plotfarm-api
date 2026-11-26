import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly enabled: boolean;
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly session: string;
  private readonly timeoutMs: number;
  private readonly debugLogFile?: string;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('whatsapp.enabled') ?? false;
    this.apiUrl =
      this.configService.get<string>('whatsapp.apiUrl') ||
      'http://api.tezsolutions.in:3000/api/sendText';
    this.apiKey = this.configService.get<string>('whatsapp.apiKey') || '';
    this.session =
      this.configService.get<string>('whatsapp.session') || 'default';
    this.timeoutMs = this.configService.get<number>('whatsapp.timeoutMs') ?? 10_000;
    this.debugLogFile = this.configService.get<string>('whatsapp.debugLogFile') || undefined;

    if (!this.enabled) {
      this.logger.warn(
        'WhatsApp service is disabled; messages will be logged only.',
      );
    }
  }

  private logToFile(message: string) {
    const logPath =
      this.debugLogFile && this.debugLogFile.length > 0
        ? this.debugLogFile
        : path.join(process.cwd(), 'whatsapp-debug.log');
    const timestamp = new Date().toISOString();
    try {
      const dir = path.dirname(logPath);
      if (dir && dir !== '.' && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
    } catch (err) {
      // Never let filesystem permissions break OTP delivery in dev/prod.
      this.logger.warn(
        `WhatsApp debug log write failed (${(err as Error).message}); continuing without file logging.`,
      );
    }
  }

  private redactSensitiveText(text: string) {
    // Redact common OTP patterns (6 digits) to avoid leaking codes into logs.
    return text.replace(/\b\d{6}\b/g, '******');
  }

  async sendText(to: string, text: string) {
    if (!this.enabled) {
      this.logger.warn("WhatsApp attempt while service is DISABLED");
      throw new Error('WhatsApp service is disabled in the environment configuration.');
    }

    if (!this.apiKey) {
      this.logger.error('WhatsApp API Key is missing');
      throw new Error('WhatsApp configuration error: API Key missing');
    }
    if (!this.apiUrl) {
      this.logger.error('WhatsApp API URL is missing');
      throw new Error('WhatsApp configuration error: API URL missing');
    }

    // Format phone number for Tez Solutions (e.g. 919440895146@c.us)
    // Extract digits and append @c.us if not already present
    let chatId = to;
    if (!chatId.includes('@')) {
      const digits = chatId.replace(/\D/g, '');
      if (!digits) {
        throw new Error("Invalid phone number provided for WhatsApp");
      }
      chatId = `${digits}@c.us`;
    }

    const payload = {
      chatId,
      text,
      session: this.session,
    };

    this.logToFile(
      `Sending WhatsApp message: ${JSON.stringify({
        ...payload,
        chatId: "[redacted]",
        text: this.redactSensitiveText(payload.text),
      })}`,
    );

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      if (typeof fetch !== 'function') {
        throw new Error(
          'Global fetch is not available. Use Node 18+ (recommended Node 20) or provide a fetch polyfill.',
        );
      }
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      } as any);
      clearTimeout(timeout);

      const responseText = await response.text();
      this.logToFile(
        `WhatsApp API response (Status ${response.status}): ${responseText}`,
      );

      let data: any = {};
      if (responseText.trim()) {
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          this.logger.warn(
            `WhatsApp API returned non-JSON response: ${responseText}`,
          );
          data = { raw: responseText };
        }
      }

      if (!response.ok) {
        this.logger.error(
          `Failed to send WhatsApp message (Status ${response.status}): ${responseText}`,
        );
        throw new Error(
          data.message || `WhatsApp API error (Status ${response.status})`,
        );
      }

      this.logger.log("WhatsApp message successfully sent");
      return data || { success: true };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error calling WhatsApp API (url=${this.apiUrl}, timeoutMs=${this.timeoutMs})`,
        err,
      );
      throw error;
    }
  }

  async sendOtp(to: string, otp: string, expiresInMinutes: number) {
    const text = `Your PlotFarm verification code is: ${otp}. It is valid for ${expiresInMinutes} minutes. Please do not share this code with anyone.`;
    return this.sendText(to, text);
  }
}
