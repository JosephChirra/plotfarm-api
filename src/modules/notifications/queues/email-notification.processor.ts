import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../../email/email.service';

@Injectable()
@Processor('email_notifications')
export class EmailNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailNotificationProcessor.name);

  constructor(private emailService: EmailService) {
    super();
  }

  async process(job: Job<any>) {
    const { to, subject, html, text } = job.data;
    
    try {
      await this.emailService.sendMail({
        to: [to],
        subject,
        html,
        text,
      });
      this.logger.debug(`Successfully sent email notification to ${to}`);
    } catch (error) {
      this.logger.error(`Error sending email notification to ${to}`, error);
      throw error;
    }
  }
}
