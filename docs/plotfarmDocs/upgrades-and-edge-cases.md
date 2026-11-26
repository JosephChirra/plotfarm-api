# PlotFarm Estate — Upgrades and Edge Cases

This document lists recommended upgrades, edge cases, and future improvements so you can build and harden the application. It assumes the **unified user** model (one user type; anyone can post, inquire, favorite) and the flows in [end-to-end-flow.md](end-to-end-flow.md) and [schema.md](schema.md).

---

## 1. Edge Cases (Current and Recommended Handling)

### 1.1 Inquiry and conversation

| Edge case | Current behavior | Recommendation |
|-----------|------------------|-----------------|
| User inquires on **own** property | Blocked in API: "You cannot inquire on your own listing" | Keep. Optionally return 403 with clear message in UI. |
| **Guest** tries to send message | No JWT → 401 on POST /property-leads | Keep. UI: show "Register to contact" and redirect to auth. |
| **Same user** opens multiple inquiries on same property | Allowed (multiple PropertyLead rows) | Decide: allow (multiple threads) or enforce one active lead per (user, property) and reuse thread. If one thread: before create lead, check existing lead for same buyer_id + property_id and redirect to that thread. |
| **Owner deletes property** | PropertyLead CASCADE deletes (by schema) | Document. Optionally soft-delete property so conversation history remains. |
| **Viewing another user's thread** | 404 if not owner and not buyer | Keep. Ensure UI never exposes lead IDs for other users. |
| **Empty initial message** | CreatePropertyLeadDto has message optional | Allowed. Consider requiring at least message or contact_phone so owner has a way to respond. |

### 1.2 Posts (properties)

| Edge case | Current behavior | Recommendation |
|-----------|------------------|-----------------|
| **Draft** posts | status = DRAFT; visible in "mine" | Consider hiding DRAFT from public list (filter status = PUBLISHED only for GET /properties). |
| **Owner deletes account** | owner_id SET NULL on properties | Decide: keep orphaned posts or CASCADE delete. Document. |
| **Price / listing_type** | On property (single post) | If you later split Property vs Listing: one property can have multiple listings (e.g. sale + rent); then favorites/leads point to listing_id. |
| **Duplicate favorites** | Unique (userId, propertyId) prevents duplicate | Already correct. |

### 1.3 Auth and users

| Edge case | Current behavior | Recommendation |
|-----------|------------------|-----------------|
| **Phone vs email** | Both optional in current DTO; schema can enforce one | For "must contact" flows, require at least one of email or phone at registration; consider UNIQUE and NOT NULL for phone if SMS is primary. |
| **Role** | Stored (ADMIN, USER) | ADMIN for moderation; USER for all other capabilities. Signup does not accept role—backend assigns USER. |
| **Blocked user** | status = BLOCKED | **Implemented:** Login rejects with "Account suspended". ActiveUserGuard returns 403 on create lead / create property / add message. |
| **JWT expiry** | Handled by auth module | Access 30 min, refresh 7 days. Payload includes sub, email, role, type, exp. |

### 1.4 Dealer (post on behalf)

| Edge case | Current behavior | Recommendation |
|-----------|------------------|-----------------|
| User posts **on behalf of** someone else | No explicit "dealer" link on property | Option A: Keep single owner_id (the dealer sets owner_id to the actual owner's user id if you allow it; then only that owner can edit). Option B: Add optional listed_by_id (dealer) and keep owner_id as asset owner; API rules: edit allowed if user is owner or listed_by. |
| Visibility of "my posts" | GET /properties/mine filters by ownerId | If you add listed_by: "my posts" = owner_id = me OR listed_by_id = me. |

---

## 2. Security and Validation Upgrades

- **Rate limiting:** Throttle POST /property-leads and POST /property-leads/:id/messages per user (and optionally per IP for auth) to prevent spam and abuse.
- **Input validation:** Max length on message, title, description; sanitize or reject HTML in messages to avoid XSS.
- **Authorization on PATCH/DELETE property:** Ensure only owner (and optionally listed_by) can update/delete; already partially done via updateForUser/removeForUser.
- **Lead update/delete:** PATCH/DELETE property-leads restricted to owner of the property, buyer of the lead, or ADMIN (enforced in service). List all leads is ADMIN-only.
- **Foreign key enforcement (SQLite):** Run `PRAGMA foreign_keys = ON` on every connection (e.g. in PrismaService onModuleInit) so deletes and updates respect FKs.

---

## 3. Notifications and UX

- **New inquiry:** Already creating Notification for property owner. Ensure UI shows unread count and deep link to the lead thread.
- **New reply:** Already notifying the other party. Consider in-app + email (and optional SMS) for high-value leads.
- **Mark as read:** PATCH notification to set is_read; optional "mark all read" for user.
- **Listing expiry:** If you add an expiry date to property (or listing), notify owner before expiry and optionally auto-set status to EXPIRED.

---

## 4. Moderation and Verification (Future)

- **Verification status:** Already on property (PENDING, VERIFIED, REJECTED) and PropertyVerificationLog. Add admin-only endpoint to set verification and write log; optionally require verified before showing in public list.
- **Document verification:** Add property_documents table (document_type, document_url, verification_status) and admin review flow; link to property or to listing if you split.
- **Moderation logs:** Add moderation_logs (entity_type, entity_id, action, performed_by, remarks) for admin actions (block user, verify/reject listing, reject document).
- **Report listing / report user:** Optional reports table and admin queue for takedowns or blocks.

---

## 5. Data and Schema Evolution

- **Property vs Listing split:** If you want one physical property to have multiple offers (e.g. sale and rent): introduce Listings table (property_id, created_by, listing_type, price, status, verification_status, published_at). Move price/listing_type/status/verification from Property to Listing. Favorites and leads reference listing_id. Migration: one Listing per existing Property with current values.
- **Soft delete:** Add deleted_at to users and/or properties if you need to retain data and "undo" delete.
- **Posting on behalf (dealer):** Add optional listed_by_id to properties (or listings) and adjust "my posts" and edit permissions as above.
- **PostgreSQL:** When moving to production, switch provider in Prisma; use same schema (TEXT UUID, CHECK) or migrate to native UUID/boolean/enum. Re-run or adapt migrations; enable FKs (default in PG).

---

## 6. Performance and Scale

- **Pagination:** Already on GET /properties; ensure all list endpoints (leads, favorites, notifications) are paginated to avoid large payloads.
- **Indexes:** Apply indexes from [schema.md](schema.md); add composite indexes for common filters (e.g. status + created_at for listings).
- **N+1:** Use Prisma include/select so threads and related data are loaded in minimal queries; already used in findForOwner/findForBuyer.
- **Caching:** Later: cache public listing list (short TTL) and invalidate on create/update/delete.

---

## 7. Testing and Observability

- **E2E tests:** Guest browse → register → create post → second user inquire → both reply in thread; favorite flow; owner sees inquiries.
- **Edge case tests:** Inquiry on own property (expect 400); access other user's thread (expect 404); blocked user (expect 403).
- **Logging:** Log create lead, add message, and verification actions for audit; avoid logging full message body in production if PII.
- **Activity log:** Use ActivityLog for key actions (create property, create lead, add message, verify) so you have an audit trail.

---

## 8. Checklist (Quick Reference)

- [ ] Guest can browse; cannot create lead or favorite (must register).
- [ ] User cannot inquire on own property.
- [ ] Only owner and buyer can see/reply in a lead thread.
- [ ] Notifications on new inquiry and new reply.
- [ ] PRAGMA foreign_keys = ON for SQLite.
- [ ] Rate limit lead create and message endpoints.
- [ ] Validate message length and sanitize input.
- [ ] Restrict lead update/delete to owner, buyer, or admin.
- [ ] Optional: one active lead per (user, property) or allow multiple.
- [ ] Optional: listed_by_id for "dealer" posts; "my posts" = owner or listed_by.
- [ ] Optional: property_documents and moderation_logs for admin flows.
- [ ] Optional: soft delete and listing expiry with notifications.

Use this document alongside [end-to-end-flow.md](end-to-end-flow.md) and [schema.md](schema.md) to build and iterate on the application.
