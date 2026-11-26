/**
 * Canonical idempotency keys for credits & referrals.
 * Reuse these helpers so retries and migrations stay consistent.
 */
export function signupCreditKey(userId: string): string {
  return `signup:credit:${userId}`;
}

/** Legacy signup key from earlier PlotFarm builds — treat as alias when detecting duplicates. */
export function legacySignupCreditKey(userId: string): string {
  return `signup:${userId}`;
}

/** Canonical post debit key (preferred). */
export function postDebitKey(propertyId: string): string {
  return `post:debit:${propertyId}`;
}

/** Legacy debit key from earlier builds — treat as alias for dedupe. */
export function listingDebitKey(propertyId: string): string {
  return `listing:debit:${propertyId}`;
}

export function referralRewardReferrerKey(referralId: string): string {
  return `referral:reward:${referralId}:referrer`;
}

export function referralRewardRefereeKey(referralId: string): string {
  return `referral:reward:${referralId}:referee`;
}

export function refundForOriginalDebitKey(
  originalDebitTransactionId: string,
): string {
  return `refund:${originalDebitTransactionId}`;
}

export function migrationSignupKey(userId: string): string {
  return `migration:signup:${userId}`;
}

export function migrationListingsAggregateKey(userId: string): string {
  return `migration:listings_aggregate:${userId}`;
}

export function migrationReferralRewardPrefix(referralId: string): string {
  return `migration:referral:${referralId}`;
}
