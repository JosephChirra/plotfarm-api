import {
  buildAdminSystemAlertEmail,
  buildEmailChangeOtpEmail,
  buildEmailChangedNoticeEmail,
  buildInquiryReceivedEmail,
  buildInquiryReplyEmail,
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
  buildPostRejectedEmail,
  buildReferralInviteEmail,
  buildRegistrationOtpEmail,
  buildSignInAlertEmail,
  buildUnreadInquiryDigestEmail,
  buildWeeklyPropertyDigestEmail,
  buildWelcomeEmail,
  buildWinBackEmail,
} from "./email.templates";

describe("email templates", () => {
  it("builds the registration OTP template with the expected copy", () => {
    const template = buildRegistrationOtpEmail("123456", 10);

    expect(template.type).toBe("auth_otp_registration");
    expect(template.subject).toBe("Your PlotFarm verification code");
    expect(template.html).toContain("Verify your email address");
    expect(template.html).toContain("123456");
    expect(template.html).toContain("10 minutes");
    expect(template.text).toContain("complete your registration");
  });

  it("builds the email change OTP template with change-specific messaging", () => {
    const template = buildEmailChangeOtpEmail("654321", 15);

    expect(template.type).toBe("auth_otp_email_change");
    expect(template.subject).toBe("Confirm your new PlotFarm email address");
    expect(template.html).toContain("Confirm your new email address");
    expect(template.html).toContain("current email will stay active");
    expect(template.text).toContain("current email will stay active");
  });

  it("builds the password reset template with the reset link in html and text", () => {
    const resetLink = "https://plotfarm.example/reset-password?token=abc123";
    const template = buildPasswordResetEmail(resetLink, 15);

    expect(template.type).toBe("auth_password_reset");
    expect(template.subject).toBe("Reset your PlotFarm password");
    expect(template.html).toContain(resetLink);
    expect(template.html).toContain("Reset Password");
    expect(template.text).toContain(resetLink);
    expect(template.text).toContain("15 minutes");
  });

  it("builds the password changed security template", () => {
    const template = buildPasswordChangedEmail(
      "https://plotfarm.example/profile",
    );

    expect(template.type).toBe("auth_password_changed");
    expect(template.subject).toBe("Your PlotFarm password was changed");
    expect(template.html).toContain("Review Account");
    expect(template.text).toContain("secure your account immediately");
  });

  it("builds both email changed confirmation variants", () => {
    const oldTemplate = buildEmailChangedNoticeEmail(
      "old",
      "new@example.com",
      "https://plotfarm.example/profile",
    );
    const newTemplate = buildEmailChangedNoticeEmail(
      "new",
      "new@example.com",
      "https://plotfarm.example/profile",
    );

    expect(oldTemplate.type).toBe("auth_email_changed_old");
    expect(oldTemplate.text).toContain("new@example.com");
    expect(newTemplate.type).toBe("auth_email_changed_new");
    expect(newTemplate.html).toContain("new@example.com");
  });

  it("builds inquiry and rejected post emails with the supplied details", () => {
    const inquiry = buildInquiryReceivedEmail(
      "A buyer",
      "Sunrise Plots",
      "https://plotfarm.example/chat?leadId=lead-1",
    );
    const rejected = buildPostRejectedEmail(
      "Sunrise Plots",
      "Missing ownership proof",
      "https://plotfarm.example/posts/post-1/edit",
    );

    expect(inquiry.type).toBe("inquiry_received");
    expect(inquiry.subject).toBe("You received a new PlotFarm inquiry");
    expect(inquiry.html).toContain("A buyer");
    expect(rejected.type).toBe("post_rejected");
    expect(rejected.text).toContain("Missing ownership proof");
    expect(rejected.html).toContain("Edit Post");
  });

  it("builds welcome and sign-in alert emails", () => {
    const welcome = buildWelcomeEmail(
      "Joseph",
      "https://plotfarm.example/dashboard",
    );
    const signInAlert = buildSignInAlertEmail(
      {
        timestamp: "2026-04-16 08:45 UTC",
        locationLabel: "Hyderabad, India",
        deviceLabel: "Chrome on Linux",
      },
      "https://plotfarm.example/profile",
    );

    expect(welcome.type).toBe("auth_welcome");
    expect(welcome.text).toContain("Joseph");
    expect(signInAlert.type).toBe("auth_sign_in_alert");
    expect(signInAlert.html).toContain("Chrome on Linux");
  });

  it("builds reply and unread inquiry digest emails", () => {
    const reply = buildInquiryReplyEmail(
      "Property Owner",
      "Green Acres",
      "Thanks for reaching out. The plot is still available.",
      "https://plotfarm.example/chat?leadId=lead-2",
    );
    const digest = buildUnreadInquiryDigestEmail(
      2,
      "https://plotfarm.example/chat",
      ["Green Acres", "Sunrise Villas"],
    );

    expect(reply.type).toBe("inquiry_reply");
    expect(reply.text).toContain("still available");
    expect(digest.type).toBe("inquiry_unread_digest");
    expect(digest.subject).toContain("2 unread");
    expect(digest.html).toContain("Sunrise Villas");
  });

  it("builds referral, weekly digest, win-back, and admin alert emails", () => {
    const referral = buildReferralInviteEmail(
      "Joseph",
      "https://plotfarm.example/ref/rf123",
      "Join with this invite and unlock referral benefits when you get started.",
    );
    const weeklyDigest = buildWeeklyPropertyDigestEmail(
      "Joseph",
      "https://plotfarm.example/posts",
      [
        {
          title: "2-acre farmland",
          subtitle: "Nalgonda district",
          url: "https://plotfarm.example/posts/1",
        },
      ],
    );
    const winBack = buildWinBackEmail(
      "Joseph",
      "https://plotfarm.example/posts",
      ["Fresh posts were added in your preferred areas."],
    );
    const adminAlert = buildAdminSystemAlertEmail(
      "Bounce rate spike",
      "Email bounce rate exceeded the expected threshold in the last hour.",
      "https://plotfarm.example/admin/email-health",
    );

    expect(referral.type).toBe("referral_invite");
    expect(referral.html).toContain("Accept Invite");
    expect(weeklyDigest.type).toBe("lifecycle_weekly_digest");
    expect(weeklyDigest.text).toContain("2-acre farmland");
    expect(winBack.type).toBe("lifecycle_win_back");
    expect(winBack.subject).toContain("Come back");
    expect(adminAlert.type).toBe("admin_system_alert");
    expect(adminAlert.text).toContain("Bounce rate spike");
  });
});
