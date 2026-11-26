# PlotFarm API

NestJS backend for PlotFarm Estate MVP. Uses Prisma with SQLite (dev) or PostgreSQL (prod).

## Setup

```bash
npm install
cp .env.example .env   # edit DATABASE_URL, JWT_SECRET if needed
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | file:./dev.db | SQLite path or PostgreSQL connection string |
| JWT_SECRET | change-me... | JWT signing secret |
| PORT | 3001 | Server port |
| CORS_ORIGINS | http://localhost:3000 | Comma-separated allowed origins |
| SNS_ENABLED | false | Enable AWS SNS for mobile OTP delivery |
| SNS_REGION | - | AWS region for SNS |
| SMS_DEFAULT_COUNTRY_CODE | +91 | Default country code used for 10-digit phone OTP login |
| OTP_EXPIRES_IN_MINUTES | 10 | OTP validity window |
| OTP_MAX_ATTEMPTS | 5 | Max invalid attempts before the code is burned |

## API (current)

### Auth
- `POST /auth/register` — Register (body: email, password, fullName?). New users get role USER. Role cannot be set via signup.
- `POST /auth/token` — Login (body: email, password). Returns JWT (access + refresh). Blocked (suspended) users receive "Account suspended".
- `POST /auth/phone/request-otp` — Request an SMS OTP for a mobile number.
- `POST /auth/phone/verify-otp` — Verify SMS OTP and sign in. Creates a new USER account on first verified phone login and marks it for profile completion.
- `POST /auth/token/refresh` — Refresh token (body: refresh_token)

Access token payload: `sub` (user id), `email`, `role`, `type: 'access'`, `exp`. Authenticated requests: `Authorization: Bearer <access_token>`.

### User
- `GET /users/me` — Current user (JWT required)

### Properties (posts)
- `GET /properties` — List posts (public; optional filters: categoryId, status, postType, state, maxPrice, maxArea)
- `GET /properties/:id` — Property detail (public)
- `GET /properties/mine` — My posts (JWT)
- `POST /properties` — Create property (JWT)
- `PATCH /properties/:id` — Update own property (JWT)
- `DELETE /properties/:id` — Delete own property (JWT)

### Property locations
- `GET /property-locations` — List locations (public)
- `GET /property-locations/states/distinct` — Distinct state names (public)
- `GET /property-locations/property/:propertyId` — Location by property (public)
- `GET /property-locations/:id` — One location (public)
- `POST /property-locations` — Create location (JWT)
- `PATCH /property-locations/:id`, `DELETE /property-locations/:id` — Update/delete (JWT)

### Property leads (inquiries & conversation)
- `POST /property-leads` — Create inquiry (JWT; body: propertyId, message?, contactPhone?)
- `GET /property-leads/owner/mine` — Inquiries on my properties (JWT)
- `GET /property-leads/buyer/mine` — My inquiries (JWT)
- `GET /property-leads/:id` — Lead detail (JWT; owner or buyer of this lead only)
- `GET /property-leads/:id/messages` — Messages in thread (JWT; owner or buyer)
- `POST /property-leads/:id/messages` — Reply (JWT; body: message)
- `PATCH /property-leads/:id`, `DELETE /property-leads/:id` — Update/delete (JWT; owner, buyer, or ADMIN)
- `GET /property-leads` — List all (ADMIN only; query: propertyId?, buyerId?, status?)

### Favorites
- `GET /engagement/favorites` — My favorites (JWT)
- `POST /engagement/posts/:id/favorite` — Toggle favorite (JWT; :id = propertyId)
- `POST /engagement/posts/:id/interest` — Toggle interest (JWT; seller-visible signal)
- `GET /engagement/posts/:id/interests` — Owner-only interest summary for a post
- `GET /engagement/status?ids=...` — Batch favorite/interest status for current user

### Other
- `GET /stats` — Dashboard stats (public)
- **Protected (JWT):** user-subscriptions, user-profiles, user-devices, property-favorites (all CRUD). property-locations, property-media, property-feature-mapping (write). property-categories, property-features (read public; create/update/delete ADMIN). property-verification-logs (ADMIN only). Plans (read public; write ADMIN). Notifications, activity-logs (ADMIN).

## Roles

Two roles: **ADMIN** and **USER**.

- **ADMIN** — Full system control; list all leads, users, moderate, manage categories/features/verification.
- **USER** — Can list plots, buy/inquire, act as agent, contact sellers. Any authenticated user has the same capabilities (create post, inquire, favorite, converse).

**User status:** ACTIVE, BLOCKED, PENDING. Blocked users cannot log in and receive "Account suspended". Active-user guard blocks blocked users on sensitive write routes (create property, create lead, add message).

## Seed & demo

After `npm run prisma:seed`:

- **Property categories:** PLOT, FARM_LAND, COMMERCIAL, RENTAL
- **Property features:** ROAD_ACCESS, BOREWELL, ELECTRICITY, FENCING, WATER_SOURCE
- **Plan:** Basic (postLimit 5, validityDays 365)
- **Admin user:** `admin@plotfarm.com` / `admin123`

No demo posts or extra users are created; add via API or UI.
