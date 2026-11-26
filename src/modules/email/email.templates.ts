export type EmailType =
  | "auth_otp_registration"
  | "auth_otp_email_change"
  | "auth_password_reset"
  | "auth_password_changed"
  | "auth_email_changed_old"
  | "auth_email_changed_new"
  | "auth_welcome"
  | "auth_sign_in_alert"
  | "post_approved"
  | "post_rejected"
  | "post_blocked"
  | "inquiry_received"
  | "inquiry_reply"
  | "inquiry_unread_digest"
  | "referral_invite"
  | "lifecycle_weekly_digest"
  | "lifecycle_win_back"
  | "admin_system_alert";

export type EmailTemplate = {
  type: EmailType;
  subject: string;
  html: string;
  text: string;
};

type LayoutInput = {
  previewText?: string;
  eyebrow?: string;
  title: string;
  intro: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  fallbackText?: string;
  footerNote?: string;
};

export type EmailDigestListing = {
  title: string;
  subtitle?: string;
  url: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailLayout({
  previewText,
  eyebrow,
  title,
  intro,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  fallbackText,
  footerNote,
}: LayoutInput) {
  const preview = previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(previewText)}</div>`
    : "";

  const cta =
    ctaLabel && ctaUrl
      ? `
      <div style="margin:32px 0 24px;">
        <a
          href="${ctaUrl}"
          style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;"
        >
          ${escapeHtml(ctaLabel)}
        </a>
      </div>
    `
      : "";

  const fallback = fallbackText
    ? `<p style="margin:24px 0 0;color:#475569;font-size:14px;line-height:1.6;">${fallbackText}</p>`
    : "";

  const footer = footerNote
    ? `<p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.6;">${footerNote}</p>`
    : "";

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(title)}</title>
      </head>
      <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
        ${preview}
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
          <tr>
            <td align="center">
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                style="max-width:640px;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;"
              >
                <tr>
                  <td style="padding:32px;">
                    <p style="margin:0 0 8px;color:#2563eb;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
                      ${escapeHtml(eyebrow || "PlotFarm")}
                    </p>
                    <h1 style="margin:0 0 16px;font-size:28px;line-height:1.25;color:#0f172a;">${escapeHtml(title)}</h1>
                    <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:#334155;">${escapeHtml(intro)}</p>
                    ${bodyHtml}
                    ${cta}
                    ${fallback}
                    ${footer}
                    <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px;" />
                    <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">
                      PlotFarm Estate<br />
                      You are receiving this email because of activity on your PlotFarm account.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function buildBulletList(items: string[]) {
  return items
    .map(
      (item) =>
        `<li style="margin:0 0 10px;color:#334155;font-size:15px;line-height:1.7;">${escapeHtml(item)}</li>`,
    )
    .join("");
}

function buildLinkList(items: EmailDigestListing[]) {
  return items
    .map(
      (item) => `
        <div style="margin:0 0 16px;padding:16px;border:1px solid #e2e8f0;border-radius:12px;">
          <p style="margin:0 0 6px;font-size:16px;line-height:1.5;color:#0f172a;font-weight:600;">${escapeHtml(item.title)}</p>
          ${
            item.subtitle
              ? `<p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">${escapeHtml(item.subtitle)}</p>`
              : ""
          }
          <a href="${item.url}" style="color:#2563eb;text-decoration:none;font-size:14px;font-weight:600;">Open</a>
        </div>
      `,
    )
    .join("");
}

export function buildRegistrationOtpEmail(
  otp: string,
  expiresInMinutes: number,
): EmailTemplate {
  return {
    type: "auth_otp_registration",
    subject: "Your PlotFarm verification code",
    html: buildEmailLayout({
      previewText: `Your PlotFarm verification code is ${otp}.`,
      eyebrow: "Email Verification",
      title: "Verify your email address",
      intro: "Use the code below to complete your PlotFarm registration.",
      bodyHtml: `
        <div style="margin:28px 0;padding:18px 20px;border-radius:14px;background:#eff6ff;border:1px solid #bfdbfe;text-align:center;">
          <p style="margin:0 0 8px;color:#1d4ed8;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Verification Code</p>
          <p style="margin:0;font-size:34px;line-height:1.2;font-weight:700;letter-spacing:0.2em;color:#0f172a;">${escapeHtml(otp)}</p>
        </div>
        <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
          This code expires in <strong>${expiresInMinutes} minutes</strong>.
        </p>
      `,
      footerNote:
        "If you did not request this code, you can ignore this email. For safety, never share your verification code with anyone.",
    }),
    text: [
      "PlotFarm verification code",
      "",
      `Use this code to complete your registration: ${otp}`,
      `This code expires in ${expiresInMinutes} minutes.`,
      "",
      "If you did not request this code, you can ignore this email.",
    ].join("\n"),
  };
}

export function buildEmailChangeOtpEmail(
  otp: string,
  expiresInMinutes: number,
): EmailTemplate {
  return {
    type: "auth_otp_email_change",
    subject: "Confirm your new PlotFarm email address",
    html: buildEmailLayout({
      previewText: `Use ${otp} to verify your new PlotFarm email address.`,
      eyebrow: "Email Change",
      title: "Confirm your new email address",
      intro:
        "Use the code below to confirm the new email address on your PlotFarm account.",
      bodyHtml: `
        <div style="margin:28px 0;padding:18px 20px;border-radius:14px;background:#eff6ff;border:1px solid #bfdbfe;text-align:center;">
          <p style="margin:0 0 8px;color:#1d4ed8;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Verification Code</p>
          <p style="margin:0;font-size:34px;line-height:1.2;font-weight:700;letter-spacing:0.2em;color:#0f172a;">${escapeHtml(otp)}</p>
        </div>
        <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
          This code expires in <strong>${expiresInMinutes} minutes</strong>. Your current email will stay active until verification is complete.
        </p>
      `,
      footerNote:
        "If you did not request an email change, you can ignore this email and your current login email will remain unchanged.",
    }),
    text: [
      "Confirm your new PlotFarm email address",
      "",
      `Use this code to confirm the new email address on your account: ${otp}`,
      `This code expires in ${expiresInMinutes} minutes.`,
      "Your current email will stay active until verification is complete.",
      "",
      "If you did not request this change, you can ignore this email.",
    ].join("\n"),
  };
}

export function buildPasswordResetEmail(
  resetLink: string,
  expiresInMinutes: number,
): EmailTemplate {
  return {
    type: "auth_password_reset",
    subject: "Reset your PlotFarm password",
    html: buildEmailLayout({
      previewText:
        "Reset your PlotFarm password with the secure link in this email.",
      eyebrow: "Account Security",
      title: "Reset your password",
      intro: "We received a request to reset your PlotFarm password.",
      bodyHtml: `
        <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
          Use the button below to choose a new password. This secure link expires in <strong>${expiresInMinutes} minutes</strong>.
        </p>
      `,
      ctaLabel: "Reset Password",
      ctaUrl: resetLink,
      fallbackText: `If the button does not work, copy and paste this link into your browser: ${resetLink}`,
      footerNote:
        "If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged until you use the link above.",
    }),
    text: [
      "Reset your PlotFarm password",
      "",
      `Use this secure link to reset your password: ${resetLink}`,
      `This link expires in ${expiresInMinutes} minutes.`,
      "",
      "If you did not request a password reset, you can ignore this email.",
    ].join("\n"),
  };
}

export function buildPasswordChangedEmail(accountUrl: string): EmailTemplate {
  return {
    type: "auth_password_changed",
    subject: "Your PlotFarm password was changed",
    html: buildEmailLayout({
      previewText:
        "Your PlotFarm password was updated. Review your account if this was not you.",
      eyebrow: "Account Security",
      title: "Your password was changed",
      intro:
        "This is a confirmation that your PlotFarm account password was changed successfully.",
      bodyHtml: `
        <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
          If you made this change, no further action is needed.
        </p>
        <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
          If you did <strong>not</strong> change your password, review your account immediately and contact support.
        </p>
      `,
      ctaLabel: "Review Account",
      ctaUrl: accountUrl,
      footerNote:
        "For security, we recommend using a strong unique password that you do not reuse elsewhere.",
    }),
    text: [
      "Your PlotFarm password was changed",
      "",
      "This is a confirmation that your password was updated successfully.",
      `Review your account here: ${accountUrl}`,
      "",
      "If you did not make this change, secure your account immediately.",
    ].join("\n"),
  };
}

export function buildWelcomeEmail(
  recipientName: string,
  startUrl: string,
): EmailTemplate {
  return {
    type: "auth_welcome",
    subject: "Welcome to PlotFarm",
    html: buildEmailLayout({
      previewText: `Welcome to PlotFarm, ${recipientName}.`,
      eyebrow: "Welcome",
      title: "Welcome to PlotFarm",
      intro: `Hi ${recipientName}, your account is ready and you can start exploring properties, leads, and your dashboard right away.`,
      bodyHtml: `
        <ul style="margin:0 0 12px 20px;padding:0;">
          ${buildBulletList([
            "Browse verified posts",
            "Create and manage your own posts",
            "Track inquiries and conversations from one place",
          ])}
        </ul>
      `,
      ctaLabel: "Open PlotFarm",
      ctaUrl: startUrl,
      footerNote:
        "You can update your profile and notification preferences at any time from your account settings.",
    }),
    text: [
      "Welcome to PlotFarm",
      "",
      `Hi ${recipientName}, your account is ready.`,
      `Open PlotFarm: ${startUrl}`,
      "",
      "- Browse verified posts",
      "- Create and manage your own posts",
      "- Track inquiries and conversations from one place",
    ].join("\n"),
  };
}

export function buildSignInAlertEmail(
  details: {
    timestamp: string;
    locationLabel?: string;
    deviceLabel?: string;
  },
  accountUrl: string,
): EmailTemplate {
  const summary = [
    `Time: ${details.timestamp}`,
    details.locationLabel ? `Location: ${details.locationLabel}` : undefined,
    details.deviceLabel ? `Device: ${details.deviceLabel}` : undefined,
  ].filter((value): value is string => Boolean(value));

  return {
    type: "auth_sign_in_alert",
    subject: "New sign-in to your PlotFarm account",
    html: buildEmailLayout({
      previewText: "A new sign-in to your PlotFarm account was detected.",
      eyebrow: "Account Security",
      title: "New sign-in detected",
      intro: "We noticed a new sign-in to your PlotFarm account.",
      bodyHtml: `
        <ul style="margin:0 0 12px 20px;padding:0;">
          ${buildBulletList(summary)}
        </ul>
        <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
          If this was you, no action is needed. If not, review your account immediately and change your password.
        </p>
      `,
      ctaLabel: "Review Account",
      ctaUrl: accountUrl,
    }),
    text: [
      "New sign-in to your PlotFarm account",
      "",
      ...summary,
      "",
      `Review your account: ${accountUrl}`,
    ].join("\n"),
  };
}

export function buildEmailChangedNoticeEmail(
  variant: "old" | "new",
  newEmail: string,
  accountUrl: string,
): EmailTemplate {
  const isOldAddress = variant === "old";
  return {
    type: isOldAddress ? "auth_email_changed_old" : "auth_email_changed_new",
    subject: isOldAddress
      ? "Your PlotFarm login email was changed"
      : "Your new PlotFarm email is now active",
    html: buildEmailLayout({
      previewText: isOldAddress
        ? `Your PlotFarm login email was changed to ${newEmail}.`
        : `Your new PlotFarm email address ${newEmail} is now active.`,
      eyebrow: "Account Security",
      title: isOldAddress
        ? "Your login email was changed"
        : "Your new email is active",
      intro: isOldAddress
        ? `Your PlotFarm login email has been changed to ${newEmail}.`
        : `Your new PlotFarm login email address is now ${newEmail}.`,
      bodyHtml: isOldAddress
        ? `
          <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
            If you approved this change, no action is needed.
          </p>
          <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
            If you did not request this change, review your account immediately and contact support.
          </p>
        `
        : `
          <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
            Your PlotFarm account is now linked to this email address for sign-in and account notifications.
          </p>
        `,
      ctaLabel: "Open Account Settings",
      ctaUrl: accountUrl,
      footerNote: isOldAddress
        ? "Security notices will continue to be important on your old address until you confirm the change was expected."
        : "Keep this email address accessible so you can receive security and account notifications.",
    }),
    text: [
      isOldAddress
        ? "Your PlotFarm login email was changed"
        : "Your new PlotFarm email is now active",
      "",
      isOldAddress
        ? `Your login email has been changed to ${newEmail}.`
        : `Your PlotFarm account now uses ${newEmail}.`,
      `Review account settings: ${accountUrl}`,
      "",
      isOldAddress
        ? "If you did not request this change, secure your account immediately."
        : "Keep this email address accessible for future account notices.",
    ].join("\n"),
  };
}

export function buildInquiryReceivedEmail(
  inquirerName: string,
  propertyTitle: string,
  inquiryUrl: string,
): EmailTemplate {
  return {
    type: "inquiry_received",
    subject: "You received a new PlotFarm inquiry",
    html: buildEmailLayout({
      previewText: `${inquirerName} sent an inquiry about ${propertyTitle}.`,
      eyebrow: "Lead Alert",
      title: "You have a new inquiry",
      intro: `${inquirerName} is interested in your post "${propertyTitle}".`,
      bodyHtml: `
        <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
          Open the conversation to review the inquiry and respond while the lead is still fresh.
        </p>
      `,
      ctaLabel: "View Inquiry",
      ctaUrl: inquiryUrl,
      fallbackText: `Open this link to view the inquiry: ${inquiryUrl}`,
      footerNote:
        "Responding quickly usually leads to better engagement and conversion on post inquiries.",
    }),
    text: [
      "You received a new PlotFarm inquiry",
      "",
      `${inquirerName} is interested in your post "${propertyTitle}".`,
      `Open the inquiry: ${inquiryUrl}`,
    ].join("\n"),
  };
}

export function buildInquiryReplyEmail(
  responderName: string,
  propertyTitle: string,
  replyPreview: string,
  chatUrl: string,
): EmailTemplate {
  return {
    type: "inquiry_reply",
    subject: "New reply to your PlotFarm inquiry",
    html: buildEmailLayout({
      previewText: `${responderName} replied about ${propertyTitle}.`,
      eyebrow: "Conversation Update",
      title: "You have a new reply",
      intro: `${responderName} replied to your inquiry about "${propertyTitle}".`,
      bodyHtml: `
        <div style="margin:0 0 16px;padding:16px;border-left:4px solid #2563eb;background:#f8fafc;border-radius:10px;">
          <p style="margin:0;color:#334155;font-size:15px;line-height:1.7;">${escapeHtml(replyPreview)}</p>
        </div>
      `,
      ctaLabel: "Open Conversation",
      ctaUrl: chatUrl,
      fallbackText: `Open this link to continue the conversation: ${chatUrl}`,
    }),
    text: [
      "New reply to your PlotFarm inquiry",
      "",
      `${responderName} replied about "${propertyTitle}".`,
      replyPreview,
      "",
      `Open conversation: ${chatUrl}`,
    ].join("\n"),
  };
}

export function buildUnreadInquiryDigestEmail(
  unreadCount: number,
  chatUrl: string,
  propertyTitles: string[],
): EmailTemplate {
  const propertyLines =
    propertyTitles.length > 0
      ? propertyTitles.map((title) => `Unread inquiry on: ${title}`)
      : [];

  return {
    type: "inquiry_unread_digest",
    subject: `You have ${unreadCount} unread PlotFarm ${unreadCount === 1 ? "inquiry" : "inquiries"}`,
    html: buildEmailLayout({
      previewText: `You have ${unreadCount} unread inquiry updates waiting in PlotFarm.`,
      eyebrow: "Lead Digest",
      title: "Unread inquiries waiting for you",
      intro: `You currently have ${unreadCount} unread ${unreadCount === 1 ? "inquiry" : "inquiries"} in PlotFarm.`,
      bodyHtml:
        propertyTitles.length > 0
          ? `<ul style="margin:0 0 12px 20px;padding:0;">${buildBulletList(
              propertyTitles.map((title) => `Unread inquiry on "${title}"`),
            )}</ul>`
          : `<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">Open your inbox to catch up on new messages and leads.</p>`,
      ctaLabel: "Open Inbox",
      ctaUrl: chatUrl,
    }),
    text: [
      `You have ${unreadCount} unread PlotFarm ${unreadCount === 1 ? "inquiry" : "inquiries"}`,
      "",
      ...propertyLines,
      "",
      `Open inbox: ${chatUrl}`,
    ].join("\n"),
  };
}

export function buildPostApprovedEmail(
  propertyTitle: string,
  listingUrl: string,
  options?: { subject?: string; title?: string; intro?: string },
): EmailTemplate {
  const subject = options?.subject ?? "Your PlotFarm post is approved";
  const title = options?.title ?? "Your post is live";
  const intro =
    options?.intro ??
    `Your post "${propertyTitle}" has been approved and is now visible on PlotFarm.`;

  return {
    type: "post_approved",
    subject,
    html: buildEmailLayout({
      previewText: intro,
      eyebrow: "Post Update",
      title,
      intro,
      bodyHtml: `
        <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
          Review your post details and keep responding to inquiries to make the most of the approval.
        </p>
      `,
      ctaLabel: "View Post",
      ctaUrl: listingUrl,
      fallbackText: `Open this link to view your post: ${listingUrl}`,
    }),
    text: [subject, "", intro, `View your post: ${listingUrl}`].join("\n"),
  };
}

export function buildPostRejectedEmail(
  propertyTitle: string,
  reason: string,
  editUrl: string,
): EmailTemplate {
  return {
    type: "post_rejected",
    subject: "Action needed: your PlotFarm post was rejected",
    html: buildEmailLayout({
      previewText: `Your post "${propertyTitle}" was rejected and needs updates before it can go live.`,
      eyebrow: "Post Update",
      title: "Your post needs changes",
      intro: `Your post "${propertyTitle}" was rejected during review.`,
      bodyHtml: `
        <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
          <strong>Reason:</strong> ${escapeHtml(reason)}
        </p>
        <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
          Update the post details and resubmit it for review.
        </p>
      `,
      ctaLabel: "Edit Post",
      ctaUrl: editUrl,
      fallbackText: `Open this link to edit your post: ${editUrl}`,
      footerNote: undefined,
    }),
    text: [
      "Action needed: your PlotFarm post was rejected",
      "",
      `Your post "${propertyTitle}" was rejected.`,
      `Reason: ${reason}`,
      `Edit your post: ${editUrl}`,
    ].join("\n"),
  };
}

export function buildPostBlockedEmail(
  propertyTitle: string,
  reviewUrl: string,
  reason?: string,
): EmailTemplate {
  return {
    type: "post_blocked",
    subject: "Your PlotFarm post was blocked",
    html: buildEmailLayout({
      previewText: `Your post "${propertyTitle}" is no longer visible on PlotFarm.`,
      eyebrow: "Post Update",
      title: "Your post was blocked",
      intro: `Your post "${propertyTitle}" is no longer visible on PlotFarm.`,
      bodyHtml: `
        <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
          ${reason ? `<strong>Reason:</strong> ${escapeHtml(reason)}` : "An administrator took action on this post for policy or safety reasons."}
        </p>
      `,
      ctaLabel: "Review Post",
      ctaUrl: reviewUrl,
      fallbackText: `Open this link to review the post: ${reviewUrl}`,
      footerNote:
        "If you believe this was a mistake, contact support with the post details for review.",
    }),
    text: [
      "Your PlotFarm post was blocked",
      "",
      `Your post "${propertyTitle}" is no longer visible on PlotFarm.`,
      ...(reason ? [`Reason: ${reason}`] : []),
      `Review the post: ${reviewUrl}`,
    ].join("\n"),
  };
}

export function buildReferralInviteEmail(
  inviterName: string,
  referralUrl: string,
  rewardSummary: string,
): EmailTemplate {
  return {
    type: "referral_invite",
    subject: `${inviterName} invited you to PlotFarm`,
    html: buildEmailLayout({
      previewText: `${inviterName} invited you to try PlotFarm.`,
      eyebrow: "Referral Invite",
      title: "You were invited to PlotFarm",
      intro: `${inviterName} shared PlotFarm with you.`,
      bodyHtml: `
        <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
          ${escapeHtml(rewardSummary)}
        </p>
      `,
      ctaLabel: "Accept Invite",
      ctaUrl: referralUrl,
      fallbackText: `Use this invite link to join: ${referralUrl}`,
    }),
    text: [
      `${inviterName} invited you to PlotFarm`,
      "",
      rewardSummary,
      `Accept invite: ${referralUrl}`,
    ].join("\n"),
  };
}

export function buildWeeklyPropertyDigestEmail(
  recipientName: string,
  browseUrl: string,
  listings: EmailDigestListing[],
): EmailTemplate {
  return {
    type: "lifecycle_weekly_digest",
    subject: "New PlotFarm posts you may like this week",
    html: buildEmailLayout({
      previewText: `Fresh PlotFarm posts are ready for ${recipientName}.`,
      eyebrow: "Weekly Digest",
      title: "Fresh posts this week",
      intro: `Hi ${recipientName}, here are some posts you may want to review this week.`,
      bodyHtml:
        listings.length > 0
          ? buildLinkList(listings)
          : `<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">New recommendations will appear here when matching posts are available.</p>`,
      ctaLabel: "Browse Posts",
      ctaUrl: browseUrl,
    }),
    text: [
      "New PlotFarm posts you may like this week",
      "",
      ...listings.map((listing) => `${listing.title} - ${listing.url}`),
      "",
      `Browse posts: ${browseUrl}`,
    ].join("\n"),
  };
}

export function buildWinBackEmail(
  recipientName: string,
  browseUrl: string,
  highlights: string[],
): EmailTemplate {
  return {
    type: "lifecycle_win_back",
    subject: "Come back to see what is new on PlotFarm",
    html: buildEmailLayout({
      previewText: "New posts and updates are waiting for you on PlotFarm.",
      eyebrow: "We Miss You",
      title: "Come back to PlotFarm",
      intro: `Hi ${recipientName}, we have new activity waiting for you on PlotFarm.`,
      bodyHtml:
        highlights.length > 0
          ? `<ul style="margin:0 0 12px 20px;padding:0;">${buildBulletList(highlights)}</ul>`
          : `<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">There are fresh posts and account activity waiting for you.</p>`,
      ctaLabel: "Explore PlotFarm",
      ctaUrl: browseUrl,
    }),
    text: [
      "Come back to see what is new on PlotFarm",
      "",
      ...highlights,
      "",
      `Explore PlotFarm: ${browseUrl}`,
    ].join("\n"),
  };
}

export function buildAdminSystemAlertEmail(
  alertTitle: string,
  alertSummary: string,
  dashboardUrl?: string,
): EmailTemplate {
  return {
    type: "admin_system_alert",
    subject: `PlotFarm admin alert: ${alertTitle}`,
    html: buildEmailLayout({
      previewText: `Admin alert: ${alertTitle}`,
      eyebrow: "Admin Alert",
      title: alertTitle,
      intro: alertSummary,
      bodyHtml: `
        <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">
          Review this operational alert and take action if needed.
        </p>
      `,
      ctaLabel: dashboardUrl ? "Open Admin Dashboard" : undefined,
      ctaUrl: dashboardUrl,
      fallbackText: dashboardUrl
        ? `Open this link for more details: ${dashboardUrl}`
        : undefined,
    }),
    text: [
      `PlotFarm admin alert: ${alertTitle}`,
      "",
      alertSummary,
      ...(dashboardUrl ? [`Open dashboard: ${dashboardUrl}`] : []),
    ].join("\n"),
  };
}
