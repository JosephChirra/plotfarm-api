import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import {
  buildAdminSystemAlertEmail,
  buildEmailChangeOtpEmail,
  buildEmailChangedNoticeEmail,
  buildInquiryReplyEmail,
  buildInquiryReceivedEmail,
  buildReferralInviteEmail,
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
  buildPostApprovedEmail,
  buildPostBlockedEmail,
  buildPostRejectedEmail,
  buildRegistrationOtpEmail,
  buildSignInAlertEmail,
  buildUnreadInquiryDigestEmail,
  buildWeeklyPropertyDigestEmail,
  buildWelcomeEmail,
  buildWinBackEmail,
  type EmailDigestListing,
  type EmailTemplate,
} from "./email.templates";

export type SendEmailOptions = {
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
};

export type OtpEmailPurpose = "registration" | "email-change";

type SesConfig = {
  enabled: boolean;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sourceEmail: string;
  fromName?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly sesClient: SESClient | null;
  private readonly sourceEmail: string;
  private readonly fromName: string;

  constructor(private configService: ConfigService) {
    const sesConfig = this.configService.get<SesConfig>("ses");

    this.sourceEmail = sesConfig?.sourceEmail ?? "";
    this.fromName = sesConfig?.fromName || "PlotFarm Estate";

    if (!sesConfig?.enabled) {
      this.sesClient = null;
      this.logger.warn("SES is not enabled; emails will be logged only.");
      return;
    }

    if (!this.sourceEmail) {
      throw new Error("SES_SOURCE_EMAIL is required when SES is enabled.");
    }

    this.sesClient = new SESClient({
      region: sesConfig.region,
      credentials: {
        accessKeyId: sesConfig.accessKeyId,
        secretAccessKey: sesConfig.secretAccessKey,
      },
    });

    this.logger.log(`Initialized SES client in region ${sesConfig.region}`);
  }

  private getFromAddress() {
    return this.fromName
      ? `${this.fromName} <${this.sourceEmail}>`
      : this.sourceEmail;
  }

  private getOtpExpiryMinutes() {
    return this.configService.get<number>("otp.expiresInMinutes") ?? 10;
  }

  buildOtpEmailTemplate(
    otp: string,
    purpose: OtpEmailPurpose,
    expiresInMinutes = this.getOtpExpiryMinutes(),
  ): EmailTemplate {
    return purpose === "email-change"
      ? buildEmailChangeOtpEmail(otp, expiresInMinutes)
      : buildRegistrationOtpEmail(otp, expiresInMinutes);
  }

  buildPasswordResetEmailTemplate(
    resetToken: string,
    appBaseUrl: string,
    expiresInMinutes = 15,
  ): EmailTemplate {
    const resetLink = `${appBaseUrl}/reset-password?token=${resetToken}`;
    return buildPasswordResetEmail(resetLink, expiresInMinutes);
  }

  buildPasswordChangedEmailTemplate(accountUrl: string): EmailTemplate {
    return buildPasswordChangedEmail(accountUrl);
  }

  buildEmailChangedNoticeEmailTemplate(
    variant: "old" | "new",
    newEmail: string,
    accountUrl: string,
  ): EmailTemplate {
    return buildEmailChangedNoticeEmail(variant, newEmail, accountUrl);
  }

  buildInquiryReceivedEmailTemplate(
    inquirerName: string,
    propertyTitle: string,
    inquiryUrl: string,
  ): EmailTemplate {
    return buildInquiryReceivedEmail(inquirerName, propertyTitle, inquiryUrl);
  }

  buildPostApprovedEmailTemplate(
    propertyTitle: string,
    listingUrl: string,
    options?: { subject?: string; title?: string; intro?: string },
  ): EmailTemplate {
    return buildPostApprovedEmail(propertyTitle, listingUrl, options);
  }

  buildPostRejectedEmailTemplate(
    propertyTitle: string,
    reason: string,
    editUrl: string,
  ): EmailTemplate {
    return buildPostRejectedEmail(propertyTitle, reason, editUrl);
  }

  buildPostBlockedEmailTemplate(
    propertyTitle: string,
    reviewUrl: string,
    reason?: string,
  ): EmailTemplate {
    return buildPostBlockedEmail(propertyTitle, reviewUrl, reason);
  }

  buildWelcomeEmailTemplate(
    recipientName: string,
    startUrl: string,
  ): EmailTemplate {
    return buildWelcomeEmail(recipientName, startUrl);
  }

  buildSignInAlertEmailTemplate(
    details: {
      timestamp: string;
      locationLabel?: string;
      deviceLabel?: string;
    },
    accountUrl: string,
  ): EmailTemplate {
    return buildSignInAlertEmail(details, accountUrl);
  }

  buildInquiryReplyEmailTemplate(
    responderName: string,
    propertyTitle: string,
    replyPreview: string,
    chatUrl: string,
  ): EmailTemplate {
    return buildInquiryReplyEmail(
      responderName,
      propertyTitle,
      replyPreview,
      chatUrl,
    );
  }

  buildUnreadInquiryDigestEmailTemplate(
    unreadCount: number,
    chatUrl: string,
    propertyTitles: string[],
  ): EmailTemplate {
    return buildUnreadInquiryDigestEmail(unreadCount, chatUrl, propertyTitles);
  }

  buildReferralInviteEmailTemplate(
    inviterName: string,
    referralUrl: string,
    rewardSummary: string,
  ): EmailTemplate {
    return buildReferralInviteEmail(inviterName, referralUrl, rewardSummary);
  }

  buildWeeklyPropertyDigestEmailTemplate(
    recipientName: string,
    browseUrl: string,
    listings: EmailDigestListing[],
  ): EmailTemplate {
    return buildWeeklyPropertyDigestEmail(recipientName, browseUrl, listings);
  }

  buildWinBackEmailTemplate(
    recipientName: string,
    browseUrl: string,
    highlights: string[],
  ): EmailTemplate {
    return buildWinBackEmail(recipientName, browseUrl, highlights);
  }

  buildAdminSystemAlertEmailTemplate(
    alertTitle: string,
    alertSummary: string,
    dashboardUrl?: string,
  ): EmailTemplate {
    return buildAdminSystemAlertEmail(alertTitle, alertSummary, dashboardUrl);
  }

  async sendMail(options: SendEmailOptions) {
    const { to, subject, text, html, cc, bcc } = options;
    if (!to?.length) {
      throw new BadRequestException("At least one recipient is required");
    }
    if (!text && !html) {
      throw new BadRequestException("Either text or html body is required");
    }

    if (!this.sesClient) {
      this.logger.debug("SES disabled; sendMail called with payload", {
        to,
        subject,
        text,
        html,
        cc,
        bcc,
      });
      return { status: "skipped", reason: "ses-disabled" };
    }

    const command = new SendEmailCommand({
      Source: this.getFromAddress(),
      Destination: {
        ToAddresses: to,
        CcAddresses: cc,
        BccAddresses: bcc,
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: "UTF-8",
        },
        Body: {
          ...(text ? { Text: { Data: text, Charset: "UTF-8" } } : {}),
          ...(html ? { Html: { Data: html, Charset: "UTF-8" } } : {}),
        },
      },
    });

    try {
      const result = await this.sesClient.send(command);
      this.logger.log(`Email sent: ${subject} to ${to.join(", ")}`);
      return result;
    } catch (error) {
      this.logger.error("Error sending email via SES", error as Error);
      throw error;
    }
  }

  async sendOtpEmail(
    to: string,
    otp: string,
    purpose: OtpEmailPurpose = "registration",
    expiresInMinutes = this.getOtpExpiryMinutes(),
  ) {
    const template = this.buildOtpEmailTemplate(otp, purpose, expiresInMinutes);
    return this.sendMail({
      to: [to],
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  async sendPostApprovalNotification(to: string, propertyTitle: string) {
    const subject = "Your property has been approved";
    const html = `
      <p>Congratulations!</p>
      <p>Your post <strong>${propertyTitle}</strong> has been approved and is now live on PlotFarm Estate.</p>
      <p>You can manage your post from your dashboard.</p>
      <p>Thanks,<br/>PlotFarm Estate Team</p>
    `;

    return this.sendMail({ to: [to], subject, html });
  }

  async sendInterestNotification(
    to: string,
    interestedUserName: string,
    propertyTitle: string,
  ) {
    const subject = "Someone is interested in your property";
    const html = `
      <p>Hello,</p>
      <p>${interestedUserName} showed interest in your property <strong>${propertyTitle}</strong>.</p>
      <p>Visit your dashboard to view details and respond.</p>
      <p>Thanks,<br/>PlotFarm Estate Team</p>
    `;

    return this.sendMail({ to: [to], subject, html });
  }

  async sendPasswordResetEmail(
    to: string,
    resetToken: string,
    appBaseUrl: string,
  ) {
    const template = this.buildPasswordResetEmailTemplate(
      resetToken,
      appBaseUrl,
    );
    return this.sendMail({
      to: [to],
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }
}
