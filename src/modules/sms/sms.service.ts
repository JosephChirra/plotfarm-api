import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly snsClient: SNSClient | null;
  private readonly senderId: string;
  private readonly smsType: string;

  constructor(private readonly configService: ConfigService) {
    const enabled = this.configService.get<boolean>('sns.enabled') ?? false;
    const region = this.configService.get<string>('sns.region') || '';
    const accessKeyId = this.configService.get<string>('sns.accessKeyId') || '';
    const secretAccessKey =
      this.configService.get<string>('sns.secretAccessKey') || '';

    this.senderId = this.configService.get<string>('sns.senderId') || '';
    this.smsType = this.configService.get<string>('sns.smsType') || 'Transactional';

    if (!enabled) {
      this.snsClient = null;
      this.logger.warn('SNS is not enabled; SMS messages will be logged only.');
      return;
    }

    if (!region) {
      throw new Error('SNS_REGION is required when SNS is enabled.');
    }

    this.snsClient = new SNSClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    this.logger.log(`Initialized SNS client in region ${region}`);
  }

  async sendOtpSms(to: string, otp: string, expiresInMinutes: number) {
    const message = `Your PlotFarm OTP is ${otp}. It is valid for ${expiresInMinutes} minutes.`;

    if (!this.snsClient) {
      this.logger.debug("SNS disabled; OTP SMS delivery skipped");
      return { status: 'skipped', reason: 'sns-disabled' };
    }

    const messageAttributes: Record<string, { DataType: string; StringValue: string }> = {
      'AWS.SNS.SMS.SMSType': {
        DataType: 'String',
        StringValue: this.smsType,
      },
    };

    if (this.senderId) {
      messageAttributes['AWS.SNS.SMS.SenderID'] = {
        DataType: 'String',
        StringValue: this.senderId,
      };
    }

    try {
      return await this.snsClient.send(
        new PublishCommand({
          PhoneNumber: to,
          Message: message,
          MessageAttributes: messageAttributes,
        }),
      );
    } catch (error) {
      this.logger.error('Error sending OTP SMS via SNS', error as Error);
      throw error;
    }
  }
}
