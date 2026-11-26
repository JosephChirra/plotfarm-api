# Referrals & Credits (Canonical System Documentation)

This document describes **how referrals and credits work in PlotFarm today** (based on current code), what **events trigger status/ledger updates**, how **admin approvals affect rewards**, and how to keep the **referrer / referee / admin UX consistent**.

If you find older docs mentioning “tokens” or “coins,” treat them as **naming drift**: the runtime system is a **single wallet currency called Credits**, backed by a `CreditTransaction` ledger.

---

## Glossary (what each thing means)

- **Credits**: wallet currency used to create listings and receive rewards.
- **Ledger**: `CreditTransaction` rows (append-only credit/debit history). `User.creditBalance` is a cache.
- **Welcome credits**: the signup grant (`SIGNUP_BONUS`). It can expire.
- **Referral record**: `ReferralRecord` row tying **referrer → referee** when signup was attributed to a referral code.
- **Referrer**: the inviter (shares code/link).
- **Referee**: the invited user (signs up using a code/link).
- **Qualification (activation milestone)**: the referee’s **first admin-approved** listing (published + verified).

---

## Core policy configuration

All rules are driven by the singleton `CreditConfig` (returned to the UI from `GET /referrals/config`).

### Canonical policy fields (used in runtime logic)

- **`listingCostCredits`**: credits debited when a user creates a listing (draft).
- **`listingVisibilityDays`**: how long an approved listing stays live (`expiresAt` computed on approval).
- **`newUserGrantListings`** and **`newUserGrantDays`**: welcome grant amount and expiry window.
- **`referrerReward`**: base referrer reward (can be multiplied by tier/campaign).
- **`refereeBonus`**: referee referral bonus (credited on qualification).
- **`referralExpiryDays`**: referee must qualify within this window.
- **`enableCreditExpiry`**: whether expired welcome grants are clawed back nightly.

### Derived values

- **Signup grant amount**:

  \[
  \text{signupCredits} = \text{newUserGrantListings} \times \text{listingCostCredits}
  \]

The backend keeps the legacy fields `signupBonus` and `creditsPerListing` in sync with these canonical fields for backward compatibility.

---

## End-to-end flows (what happens, in what order)

## Canonical ruleset (single source of truth)

This section is the **contract** the product should follow everywhere (API, admin, and user UI).

### Credits & referral triggers → expected outcomes

#### Welcome grant (onboarding)
- **Trigger**: user is created (registration / OTP verify / first-time phone OTP user).
- **Preconditions**: no prior `SIGNUP_BONUS` exists; user is still within `newUserGrantDays` from `User.createdAt`.
- **Ledger**: create one `SIGNUP_BONUS` credit grant with `expiresAt`.
- **Idempotency**: `signupCreditKey(userId)`.
- **Status changes**: none (no referral lifecycle implications).

#### Listing spend (economy)
- **Trigger**: listing creation (`POST /properties`).
- **Preconditions**: wallet balance ≥ `listingCostCredits`.
- **Ledger**: one `LISTING_SPEND` debit for `listingCostCredits`.
- **Idempotency**: `listingDebitKey(propertyId)`.
- **Status changes**: property starts `DRAFT`/`PENDING` review.

#### Listing approval (admin gate)
- **Trigger**: admin approves a listing.
- **Status changes**: property becomes `PUBLISHED`/`VERIFIED`; `expiresAt` is computed.
- **Referral qualification check**:
  - Only when this approval creates the referee’s **first** approved listing.

#### Referral payout (double-sided incentive)
- **Trigger**: referral qualifies (referee’s first approved listing).
- **Preconditions**:
  - A `ReferralRecord` exists for the referee.
  - Referral is not expired (`record.expiresAt >= now`).
  - Referral is in an allowed status (`PENDING`, `IN_PROGRESS`, `FLAGGED`, `UNDER_REVIEW`) and not already `COMPLETED`.
- **Status changes**: referral becomes `COMPLETED`, `qualifiedAt` set.
- **Ledger**:
  - Referrer: `REFERRAL_REWARD` credit (tier/campaign multipliers applied deterministically).
  - Referee: `REFEREE_BONUS` credit (amount = `refereeBonus`).
- **Idempotency**:
  - `referral:reward:<referralId>:referrer`
  - `referral:reward:<referralId>:referee`

#### Listing rejection refund (not a reward)
- **Trigger**: admin rejects a listing.
- **Ledger**: `LISTING_REFUND` credit for the *exact original debit amount*.
- **Idempotency**: `refund:<originalDebitId>`.

### Known divergences / ambiguities in current system

These are the sources of “randomness” and inconsistent expectations.

- **`CreditConfig.refereeGrantListings` is surfaced but not enforced**:
  - The admin UI currently edits `refereeGrantListings` and describes it as a referral-specific onboarding grant.
  - The runtime referral payout logic credits referees using **`refereeBonus`** on qualification (first approved listing).
  - Recommended resolution (pick one and standardize everywhere):
    - **Option A (recommended)**: delete/deprecate `refereeGrantListings` from admin/UI and config DTOs; keep **`refereeBonus`** as the single referee referral incentive.
    - **Option B**: implement `refereeGrantListings` explicitly as a *welcome-grant override* for referred users (and document its interaction with `SIGNUP_BONUS`).

- **Terminology drift (“tokens/coins”)**:
  - Product/UX copy sometimes uses tokens/coins while the ledger and API are credits.
  - Standardize on “Credits” everywhere; reserve “token” only for push-notification device tokens.

### 1) Signup (welcome credits + optional referral attribution)

**Trigger:** user registers (email OTP flow, direct register, or new phone-OTP user).

**Ledger effect (welcome credits):**
- **Type**: `SIGNUP_BONUS`
- **Direction**: `CREDIT`
- **Amount**: `newUserGrantListings × listingCostCredits`
- **Expiry**: `createdAt + newUserGrantDays`
- **Idempotency**: keyed by `signupCreditKey(userId)` to prevent duplicates on retries.

**Referral attribution (only if a referral code is present):**
- The backend attempts to create a `ReferralRecord`:
  - **Status:** `PENDING`
  - **Expires:** `createdAt + referralExpiryDays`
  - **Guards:** disabled engine, code not found, self-referral, already referred, cap reached.
- Side effects:
  - `User.referredById` is set for the referee.
  - A notification is sent to the referrer: “someone joined with your link”.

**Important:** no referral payout is credited at signup. Referral payouts happen only on qualification.

### 2) User creates a listing (credit spend)

**Trigger:** user submits a new property listing.

**Ledger effect (spend):**
- **Type**: `LISTING_SPEND`
- **Direction**: `DEBIT`
- **Amount**: `listingCostCredits`
- **Idempotency**: keyed by a `listingDebitKey(propertyId)` (prevents duplicate charges if the create call is retried).

**Property state:**
- Created as `status=DRAFT` and `verificationStatus=PENDING`.
- The property stores `creditTransactionId` to link the spend to the listing.

### 3) Admin approves a listing (publish + referral qualification)

**Trigger:** admin approves the listing.

**Property state updates:**
- `verificationStatus=VERIFIED`
- `status=PUBLISHED`
- `publishedAt` set
- `expiresAt = publishedAt + listingVisibilityDays`

**Qualification check:**
- If this is the referee’s **first** approved listing, the system attempts to qualify any referral record for that referee.

### 4) Referral qualification → payout (referrer + referee)

**Trigger:** referee’s first approved listing (or admin manual completion).

**Referral record updates:**
- Status becomes `COMPLETED`
- `qualifiedAt` set
- Rewards persisted on the referral record for audit:
  - `referrerReward` becomes the effective computed reward (tier/campaign multiplier applied).
  - `refereeReward` becomes `refereeBonus`.

**Ledger effects:**
- **Referrer**:
  - Type: `REFERRAL_REWARD`
  - Direction: `CREDIT`
  - Amount: `floor(referrerReward × tierMultiplier × campaignMultiplier)`
  - Idempotency key: `referral:reward:<referralId>:referrer`
- **Referee**:
  - Type: `REFEREE_BONUS`
  - Direction: `CREDIT`
  - Amount: `refereeBonus`
  - Idempotency key: `referral:reward:<referralId>:referee`

**Notifications:**
- Referrer gets “You earned X credits”.
- Referee gets “You earned Y credits”.

### 5) Rejection refund (not a reward)

**Trigger:** admin rejects a listing.

**Ledger effect (refund):**
- Type: `LISTING_REFUND`
- Direction: `CREDIT`
- Amount: the exact original debit amount for that listing (lookup by `creditTransactionId`)
- Idempotency: `refund:<originalDebitId>`

This is a key source of confusion: it is a **refund**, not a bonus.

---

## Referral statuses (lifecycle semantics)

`ReferralRecord.status` can include:

- **`PENDING`**: referee joined via referral, hasn’t qualified yet (within expiry window).
- **`COMPLETED`**: referee qualified; payouts have been (or are being) issued idempotently.
- **`EXPIRED`**: referee did not qualify before `expiresAt`.
- **`FLAGGED` / `UNDER_REVIEW` / `REJECTED`**: moderation / fraud states (used more in admin tooling; payout logic only completes from specific allowed states).

Practical UX recommendation: in user-facing UI, treat the lifecycle as:

1. Joined via referral
2. First listing approved
3. Bonuses credited

…and surface special statuses only when they block progress (expired/flagged).

---

## Admin actions and how they impact rewards

Admin can:

- **Complete a referral manually** (status → `COMPLETED`) *only* if the referee has posted; this runs the same qualification logic and issues credits idempotently.
- **Expire a referral** only when it is still `PENDING` (audit integrity: completed referrals cannot be “un-completed”).
- **Repair attribution** (rerun the same `recordReferral` rules; idempotent and guard-protected).
- **Tune config / campaigns** which affect future payouts (tier/campaign multipliers affect referrer reward computation).

Admin cannot safely “undo” payouts via status changes; clawbacks should be done via explicit admin debit transactions for auditability.

---

## Scheduled jobs (automatic consistency / safety nets)

- **Referral code backfill**: generates missing referral codes for older users.
- **Qualification reconcile**: finds pending referrals where referee already has an approved listing and completes them.
- **Referral expiry job**: marks stale pending referrals as `EXPIRED`.
- **Credit expiry job**: processes expired `SIGNUP_BONUS` grants and debits them as `EXPIRED` (free credits only).

---

## “Why did I get credits twice?” (support-ready explanation)

In PlotFarm, credits can increase for several **different reasons**:

- **Welcome credits (`SIGNUP_BONUS`)**: granted after registration (free posting credits, may expire).
- **Referral bonus (`REFEREE_BONUS`)**: granted **only after your first listing is approved**, if you joined via referral.
- **Refund (`LISTING_REFUND`)**: if a listing is rejected, the spend is refunded.

So “credits twice” often means one of:
- signup grant + referral bonus, or
- signup grant + listing refund, or
- referral bonus + listing refund.

---

## Best-practice alignment (why this structure is good)

- **Rewards after activation**: paying referral rewards after a meaningful activation milestone (here: first approved listing) is a common industry pattern to reduce low-quality referrals and fraud.
- **Ledger + idempotency**: credit issuance uses idempotency keys so retries/concurrency don’t double-pay; the ledger provides an audit trail for admin/support.

---

## Source map (code pointers)

- Signup + referral attribution:
  - `plotfarm-api/src/modules/auth/auth.service.ts`
  - `plotfarm-ui/src/features/auth/register-form.tsx`
- Referral logic:
  - `plotfarm-api/src/modules/referrals/referrals.service.ts`
  - `plotfarm-api/src/modules/referrals/referrals.controller.ts`
- Posting debit + approval trigger + refund:
  - `plotfarm-api/src/modules/properties/properties.service.ts`
- Ledger / balance / expiry:
  - `plotfarm-api/src/modules/credits/credits.service.ts`
  - `plotfarm-api/src/modules/credits/credits.scheduler.ts`
- Admin UI:
  - `plotfarm-ui/src/app/(main)/admin/referrals/page.tsx`
- User UI:
  - `plotfarm-ui/src/app/(main)/referrals/page.tsx`
  - `plotfarm-ui/src/app/(main)/credits/page.tsx`

