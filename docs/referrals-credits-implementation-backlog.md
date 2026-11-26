# Referrals & Credits — Implementation Backlog (Optional)

This backlog turns the canonical ruleset into a set of concrete engineering tasks. It is intentionally scoped to **high-leverage changes** that improve consistency, auditability, and UX clarity without a rebuild.

---

## 1) Resolve `refereeGrantListings` (remove ambiguity)

### Option A (recommended): deprecate + remove

- **Backend**
  - Remove `refereeGrantListings` from:
    - `CreditConfig` schema (Prisma) and seed
    - `UpdateReferralConfigDto`
    - `ReferralsService.getConfig()` creation defaults
  - Add a migration that:
    - keeps the column for one release if needed, but stops reading/writing it (soft deprecation), then drops it.
- **UI**
  - Keep only `refereeBonus` as the “referee incentive” knob.
  - Remove any copy implying referral overwrites signup bonus.
- **Why**
  - Today the runtime payout uses `refereeBonus` at qualification; surfacing a second knob that is not enforced creates trust and support issues.

### Option B: implement as a true onboarding override

- **Policy**
  - Define how `refereeGrantListings` interacts with `SIGNUP_BONUS`:
    - Replace signup grant for referred users, or
    - Add on top of signup grant, or
    - Cap to a maximum.
- **Backend implementation approach**
  - On successful referral attribution (`recordReferral`), store a “referee onboarding plan” on the user/referral record.
  - Ensure the correct grant is issued **once** (idempotent) with a dedicated key:
    - `referee-welcome:<referralId>` (or similar).
- **UI**
  - Display the exact rule on registration / referrals / credits pages.

---

## 2) Standardize terms: “Credits” everywhere

- Rename UI labels and copy to avoid “coins/tokens” (except device push tokens).
- Ensure admin actions and transaction rows are always categorized:
  - **Grant** (welcome)
  - **Spend** (listing)
  - **Refund** (rejected listing)
  - **Reward** (referral)
  - **Admin adjustment**

---

## 3) Referral funnel metrics (supporting metrics)

Add lightweight counters/queries (and optionally dashboards) so you can measure improvements:

- **Attribution rate**
  - \( \text{attributed_signups} / \text{signups_with_ref_param} \)
- **Qualification rate**
  - \( \text{completed_referrals} / \text{attributed_referrals} \)
- **Time-to-qualification**
  - Median / p90 of `qualifiedAt - createdAt` for `ReferralRecord`
- **Payout integrity**
  - % of `COMPLETED` referrals where both ledger entries exist (`REFERRAL_REWARD` and `REFEREE_BONUS`)
- **Fraud hold impact**
  - Completion rate for `FLAGGED/UNDER_REVIEW` vs baseline

Where to compute:
- Extend `ReferralsService.adminGetStats()` and/or create a dedicated admin analytics endpoint.

---

## 4) Make admin “holds” explicit (optional UX improvement)

If `FLAGGED/UNDER_REVIEW` is meant to delay payouts:
- Define whether they **block payout** or simply annotate risk.
- If they should block payout:
  - Adjust `completeReferralOnFirstProperty()` allowed statuses.
  - Add an explicit admin “Release payout” action.

---

## 5) Idempotency / determinism hardening (already good, but extend)

Current system already uses idempotency keys for:
- signup grant
- referral payouts
- listing spend
- refunds

Recommended next hardening steps:
- Add an “idempotency conflict” guard (if the same key is reused with different intent).
- Add a small “ledger integrity check” job:
  - e.g., nightly verify `User.creditBalance` matches last `CreditTransaction.balanceAfter` and repair drift.

---

## 6) Eventing (only if scaling)

If referral/credits traffic grows substantially:
- Use an Outbox pattern for publishing “credit_issued” / “referral_completed” events.
- Keep the DB transaction as the source of truth; publish events asynchronously.

