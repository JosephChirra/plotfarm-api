# PlotFarm Estate — Admin & Engagement Master Reference

**Owner:** Dev C (Admin & Engagement)
**Date:** 7 March 2026
**Phase:** Phase 1 MVP
**Purpose:** Single implementation map to execute Admin + Engagement work module-by-module without breaking parallel work from Dev A (Marketplace) and Dev B (User flows).

---

## 1) Important Alignment (Read First)

Your provided master prompt is **conceptually correct**, but this repository is implemented in:

- **Backend:** NestJS + Prisma (not FastAPI + SQLAlchemy)
- **Frontend:** Next.js App Router + TypeScript + Tailwind
- **DB (dev):** SQLite via Prisma (`schema.prisma`) with PostgreSQL-ready structure

So implementation must follow the **existing NestJS/Prisma architecture** while preserving the prompt’s business requirements.

---

## 2) Canonical Domain Mapping (Prompt → Current Repo)

| Prompt Term | Repo Canonical Term | Primary Model/Module |
|---|---|---|
| Plot / Listing | Property | `Property`, `properties` module |
| Inquiry | Property Lead | `PropertyLead`, `property-leads` module |
| Inquiry Messages | Lead Messages | `PropertyLeadMessage` |
| Favorite | Property Favorite | `PropertyFavorite`, `engagement` module |
| Admin actions log | Activity Log (current) | `ActivityLog`, `activity-logs` module |
| Plot moderation | Verification + status updates | `properties` + `property-verification-logs` |

---

## 3) What Each Existing MD File Means For Your Work

### `docs/plotfarmDocs/end-to-end-flow.md`
- Defines the live behavior: **unified user model**, admin is special role for moderation.
- Confirms current user/inquiry/favorite journey already exists.
- Confirms route-level expectations for browsing, posting, inquiries, and favorites.
- Use this as the **flow contract** when changing admin or engagement logic.

### `docs/plotfarmDocs/schema.md`
- Source of truth for domain entities and constraints.
- Confirms key enums and lifecycle fields (`PropertyStatus`, `VerificationStatus`, `LeadStatus`, `UserStatus`).
- Confirms relationships needed for admin screens: users ↔ properties ↔ leads/messages/favorites.
- Use this as the **data contract** for API and UI.

### `docs/plotfarmDocs/upgrades-and-edge-cases.md`
- Captures hardening points and unresolved behavior edges.
- Use this as your **gap checklist** after each module implementation pass.

### `docs/emisthraRef/architecture-reuse-plan.md`
- Conceptual reuse only.
- Confirms patterns to reuse: thin controllers, service-driven business logic, consistent pagination/error/response contracts.
- Do **not** create FastAPI folder structure in this repo.

---

## 4) Source-of-Truth Code Map (Admin & Engagement)

## Backend Core / Architecture
- `src/main.ts`
- `src/app.module.ts`
- `src/core/database/prisma.service.ts`
- `src/core/interceptors/response.interceptor.ts`
- `src/core/exceptions/http-exception.filter.ts`
- `src/shared/dto/pagination.dto.ts`

## Auth / Authorization
- `src/modules/auth/auth.controller.ts`
- `src/modules/auth/auth.service.ts`
- `src/modules/auth/guards/jwt-auth.guard.ts`
- `src/modules/auth/guards/roles.guard.ts`
- `src/modules/auth/strategies/jwt.strategy.ts`
- `src/modules/auth/decorators/roles.decorator.ts`
- `src/modules/auth/decorators/current-user.decorator.ts`

## Admin-Relevant Backend Modules
- `src/modules/users/*`
- `src/modules/properties/*`
- `src/modules/property-verification-logs/*`
- `src/modules/property-leads/*`
- `src/modules/engagement/*`
- `src/modules/stats/*`
- `src/modules/activity-logs/*`
- `src/modules/notifications/*`

## Database
- `prisma/schema.prisma`
- `prisma/migrations/20250307180000_init/migration.sql`
- `prisma/migrations/20260307174043_add_schema_indexes_and_align/migration.sql`
- `prisma/seed.ts`

## Frontend Admin / Engagement
- `../plotfarm-ui/src/lib/api-client.ts`
- `../plotfarm-ui/src/lib/api.ts`
- `../plotfarm-ui/src/lib/auth.ts`
- `../plotfarm-ui/src/store/auth-store.ts`
- `../plotfarm-ui/src/components/layout/nav.tsx`
- `../plotfarm-ui/src/app/(main)/admin/page.tsx`
- `../plotfarm-ui/src/app/(main)/admin/properties/page.tsx`
- `../plotfarm-ui/src/app/(main)/admin/users/page.tsx`
- `../plotfarm-ui/src/app/(main)/admin/leads/page.tsx`
- `../plotfarm-ui/src/app/(main)/admin/notifications/page.tsx`
- `../plotfarm-ui/src/app/(main)/admin/activity/page.tsx`

---

## 5) Requirement → API → DB → UI Traceability Matrix

> Status tags: `DONE`, `PARTIAL`, `TODO`, `HARDEN`

| Requirement (from master prompt) | Backend API (current/target) | DB Entities | Frontend Surface | Status | Notes |
|---|---|---|---|---|---|
| Admin auth gate | Admin routes guarded with JWT + role checks | `User.role`, `UserStatus` | Admin route/nav visibility | `PARTIAL` | Verify all sensitive routes enforce `ADMIN` |
| Dashboard stats | `stats` module endpoints | Users, Properties, Leads, Favorites | `/admin` dashboard cards/charts | `PARTIAL` | Ensure metrics match prompt set |
| Plot moderation list/detail | `properties` + verification logs routes | `Property`, `PropertyVerificationLog` | `/admin/properties` | `PARTIAL` | Separate owner edit vs admin moderation fields |
| Approve/reject plot | Property update + verification log insert | Property status/verification fields + logs | Moderation actions in admin table | `PARTIAL` | Ensure action audit and reason capture |
| Delete plot | Property delete route | Property + cascade children | Admin properties table actions | `PARTIAL` | Verify cascade effects on media/leads/favorites |
| User management list | `users` list/admin endpoints | `User`, `Property` counts | `/admin/users` | `PARTIAL` | Standardize pagination contract |
| Suspend user | User status update endpoint | `User.status` | Admin user action | `PARTIAL` | Enforce suspended user restrictions in auth and write actions |
| Delete user | Admin delete user route | User + related rows | Admin user action | `PARTIAL` | Confirm safe cascade behavior |
| Inquiry monitoring | `property-leads` list/filter endpoints | `PropertyLead`, `PropertyLeadMessage` | `/admin/leads` | `PARTIAL` | Add/confirm pagination + filter by property |
| Engagement metrics (top viewed/favorited) | `stats` and/or `engagement` aggregations | `Property.views`-equivalent fields, `PropertyFavorite` | Admin analytics widgets/charts | `TODO` | Define canonical endpoint contract |
| Admin action logging | Current `activity-logs` module | `ActivityLog` | `/admin/activity` | `PARTIAL` | Decide if new `admin_actions` table needed or `ActivityLog` reuse |
| Admin notifications | Notifications module APIs | `Notification` | `/admin/notifications` | `PARTIAL` | Align response shape + pagination |

---

## 6) Phase-Wise Implementation Plan (Execute One by One)

## Phase A — Contract Lock (No behavior break)
**Goal:** freeze naming and response standards before deep edits.

Tasks:
1. Lock canonical vocabulary in code/docs: `property` + `lead`.
2. Lock role policy: only `ADMIN` for moderation routes.
3. Lock response envelope shape and pagination format across admin APIs.

Primary files:
- `src/core/interceptors/response.interceptor.ts`
- `src/shared/dto/pagination.dto.ts`
- `src/modules/auth/*`
- `../plotfarm-ui/src/lib/api.ts`

Done criteria:
- New admin endpoints and existing admin pages consume one consistent response/pagination contract.

---

## Phase B — Security & Moderation Hardening
**Goal:** eliminate authorization leaks and ownership/moderation overlap.

Tasks:
1. Ensure all admin-only operations use JWT + role guard.
2. Split owner-editable fields from admin-moderation fields in properties flow.
3. Enforce suspension restrictions in login/critical write operations.

Primary files:
- `src/modules/properties/properties.controller.ts`
- `src/modules/properties/properties.service.ts`
- `src/modules/users/users.service.ts`
- `src/modules/auth/*`

Done criteria:
- No non-admin path can perform moderation actions.

---

## Phase C — Admin CRUD Consistency
**Goal:** make admin list/action screens reliable and paginated.

Tasks:
1. Normalize list endpoints: users, leads, notifications, activity logs.
2. Add consistent query params (`page`, `limit`, optional filters).
3. Ensure service-level query optimization (indexed fields, no N+1).

Primary files:
- `src/modules/users/*`
- `src/modules/property-leads/*`
- `src/modules/notifications/*`
- `src/modules/activity-logs/*`

Done criteria:
- All admin tables support stable pagination and filters.

---

## Phase D — Analytics Completion
**Goal:** complete prompt-required engagement and growth metrics.

Tasks:
1. Confirm/implement totals and daily trend metrics.
2. Add top viewed and top favorited properties endpoints.
3. Align frontend charts with backend payload shape.

Primary files:
- `src/modules/stats/*`
- `src/modules/engagement/*`
- `../plotfarm-ui/src/app/(main)/admin/page.tsx`

Done criteria:
- Admin dashboard shows all required KPI cards + trend charts.

---

## Phase E — UI Integration & QA Stabilization
**Goal:** close contract mismatches and ensure smooth admin workflows.

Tasks:
1. Refactor admin pages to shared API helpers only.
2. Remove ad-hoc response-shape branching in admin pages.
3. Verify action feedback states (approve/reject/suspend/delete).

Primary files:
- `../plotfarm-ui/src/lib/api.ts`
- `../plotfarm-ui/src/app/(main)/admin/*`

Done criteria:
- Admin flows are deterministic and consistent with backend contracts.

---

## 7) Work Split / Dependency Safety (3 Dev Team)

## You (Admin & Engagement)
- Own: `users`, `properties moderation`, `property-leads admin`, `stats`, `activity logs`, `admin UI pages`.
- Avoid breaking: public property browse/detail contracts used by Dev A; auth/session contracts used by Dev B.

## Dev A (Marketplace)
- Own: home, listings browse/search/detail, public filtering.
- Dependency on you: moderation visibility fields and status semantics.

## Dev B (User flows)
- Own: signup/login, create listing, favorites, contact seller baseline.
- Dependency on you: suspension behavior, inquiry permissions, response envelopes.

---

## 8) Immediate Ticket Queue (Start Here)

1. **Ticket A1:** Admin endpoint guard audit (all admin routes). ✅ Completed (initial hardening pass)
2. **Ticket A2:** Property moderation contract split (owner update vs admin approve/reject). ✅ Completed
3. **Ticket A3:** Admin users list pagination standardization. ✅ Completed
4. **Ticket A4:** Admin leads list pagination + property filter. ✅ Completed
5. **Ticket A5:** Dashboard stats endpoint parity with prompt metrics. ✅ Completed
6. **Ticket A6:** Top viewed + top favorited endpoints. ✅ Completed (migration pending: run `npx prisma migrate dev`)
7. **Ticket A7:** Admin UI response contract unification (`/admin`, `/admin/users`, `/admin/properties`, `/admin/leads`, `/admin/notifications`, `/admin/activity`). ✅ Completed
8. **Ticket A8:** Activity/admin action logging consistency decision (`ActivityLog` vs dedicated `admin_actions`). ✅ Completed (Decision: Keep dual-purpose logging - see below)

---

## 9) Open Decisions (Resolve Once, Then Implement)

1. ✅ **RESOLVED (A8):** Admin action logging architecture.
   - **Decision:** Use dual-purpose logging with separate tables by domain:
     - `ActivityLog` — General system actions (user activity, non-moderation events)
     - `PropertyVerificationLog` — Property moderation actions (approve/reject with verification workflow)
   - **Rationale:** 
     - PropertyVerificationLog is already purpose-built for property moderation with domain-specific fields (propertyId, verifiedById, status, remarks)
     - ActivityLog remains generic for broader audit trail needs (entity-agnostic tracking)
     - This separation follows domain-driven design and avoids table bloat
     - No need for new `admin_actions` table as current architecture serves all use cases
   - **Implementation Status:** Already operational in properties.service.ts approve/reject methods

2. Should one buyer have only one open lead per property, or multiple leads allowed?
3. Should admin metrics be read-only in `stats` module only, or split between `stats` and `engagement` modules?
4. Final naming in UI copy: use only “Properties”, or “Plots (Properties)” dual label?

---

## 10) Definition of Done (Phase 1 Admin & Engagement)

- Admin can view platform stats and trends.
- Admin can moderate properties (approve/reject/delete) with audit trail.
- Admin can manage users (list, suspend, delete).
- Admin can monitor inquiries with filters and pagination.
- Admin can view engagement analytics (top viewed/top favorited + trends).
- Admin UI pages are protected and use unified API contracts.
- No regressions in public marketplace and user baseline journeys.
