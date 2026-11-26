# Phase 1 Marketplace (Missing) + Phase 2 What To Build

## Target spec for Phase 1 (from your requirements)
The marketplace Phase 1 target behavior is:
- Public browse route: `GET /plots` and detail `GET /plots/[id]`
- Plot cards show: image, title, location, acreage, price_per_acre, featured, and a View Details button
- Plot detail shows image gallery, title, location, acreage, price per acre, total price, description, and a map view (Leaflet/Google Maps)
- Lead form (guest) on plot detail:
  - Fields: `name`, `phone`, `email`, `message`
  - Submit: `POST /leads` with `{ plot_id, ... }`
- Guest can browse and submit interest without login.
- Guest cannot build conversation until they register (but owner/admin can review/moderate and respond).

## What is currently missing (vs the target spec)

### A) Public `/plots` routes do not exist (UI)
- The current UI implements marketplace browse/detail via:
  - `GET /listings`
  - `GET /listings/[id]`
- There are no route files for `/plots` and `/plots/[id]` in the current codebase.

Consequence:
- You can browse, but it does not match the required route contract `/plots`.

### B) Public guest lead submission (`POST /leads`) does not exist (Backend)
- The current lead/inquiry creation endpoint requires authentication:
  - `POST /property-leads` with `JwtAuthGuard` (and active-user guard)
- Guest users cannot create inquiries because the API expects a logged-in `buyerId`.

Consequence:
- The required guest lead form cannot work end-to-end until a public lead endpoint + storage exists.

### C) Map view on public plot detail is missing (UI)
- Plot detail currently shows gallery + text + buttons, but does not render a map iframe/embed.
- Even though `latitude/longitude` exist in the DB (`PropertyLocation.latitude/longitude`), they are not used in the public detail UI.

Consequence:
- Plot detail does not satisfy “See location on map”.

### D) Guest-to-conversation continuity is not supported (Backend + UI)
Current conversation model:
- `PropertyLeadMessage.senderId` is a required user reference.
- Message retrieval is authorized by lead participants (owner or buyer user id).

Consequence:
- If a guest creates a lead without a user account, the guest cannot reply or access the thread until they become a real user in the system.

### E) Minor mismatches / limitations inside the current implemented flow
- “Interested” preloading depends on `GET /engagement/status`.
  - Current backend response returns `interested: []` always.
- Owner can still reply in the conversation UI once a lead exists for their property.

This does not block the core marketplace flows, but it affects UI correctness.

## Why these items are missing (technical root causes)

### 1) Auth-first inquiry model
- Existing `property-leads` logic always sets `buyerId` from the JWT user.
- Conversation messages are always stored with a non-null `senderId`.

### 2) Guest has no identity in conversation layer
- The current schema assumes both participants are users.
- Guest identity must be represented either by:
  - a temporary “guest profile” entity, or
  - a nullable sender type for message records, or
  - creating a temporary user account, then linking it when the guest registers.

## Phase 2 proposal (recommended implementation order)

### Milestone 1: Add `/plots` as a public alias to the existing browse/detail UI
- Implement `GET /plots` and `GET /plots/[id]` by reusing the existing `/listings` and `/listings/[id]` rendering logic.
- Keep UI clean and responsive; route naming should match the spec.

### Milestone 2: Public guest lead form that calls a new `POST /leads`
Backend changes:
- Add a new controller route `POST /leads` (public, no JWT).
- It should create a `PropertyLead` row using guest contact info.
- It must notify the property owner (as current inquiry flow already does).

DB/schema changes (likely required):
- Add guest fields to `PropertyLead` (or a new `GuestLeadProfile` table) so owner can contact guest:
  - `guest_name`, `guest_phone`, `guest_email`
- Current `PropertyLead` only stores:
  - `message` and `contactPhone`, and a nullable `buyerId`.
  - It does not store guest email or name in a structured way.

### Milestone 3: Map embed in `/plots/[id]`
- Use `PropertyLocation.latitude` and `PropertyLocation.longitude` already stored.
- Render a Google Maps iframe or a Leaflet map in the public detail page.

### Milestone 4: Guest registers to continue conversation
Pick one minimal strategy:
1. Link-on-registration by matching email/phone:
   - When a guest registers, find any guest leads with matching phone/email and set `buyerId` to the new user.
   - After link, the guest can use existing message thread endpoints.
2. Create a “guest profile” entity and allow thread participation after registration:
   - Requires schema changes to message sender representation.
   - More flexible; more work.

For MVP, strategy (1) is usually the lowest effort while still respecting “guest cannot build conversation”.

### Milestone 5: UI improvements for correctness
- On `/plots/[id]`, show correct interest state after user login (favorites/inquiries).
- Fix “interested” preloading so UI reflects DB status (optional but recommended).

## Phase 2 end-to-end test checklist (once implemented)
1. Guest browse:
   - `/plots` shows plot cards and filters work
2. Guest lead form:
   - Submit lead on `/plots/[id]` creates lead (owner gets notification)
3. Map:
   - Map loads when latitude/longitude exists
4. Register-to-converse:
   - After registration, guest can open conversation messages for leads they created

## Where to integrate (code pointers)
- UI route integration targets:
  - `plotfarm-ui/src/app/(main)/plots/page.tsx`
  - `plotfarm-ui/src/app/(main)/plots/[id]/page.tsx`
- Backend lead endpoint integration target:
  - `plotfarm-api/src/modules/...` (new module or extend `property-leads`)

