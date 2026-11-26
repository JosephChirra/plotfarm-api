# PlotFarm Architecture Reuse Plan

> Extracted from Emisthra analysis. Conceptual reuse only—no framework-specific code copy.

## 1. Emisthra Structure Summary

### emisthra-api (FastAPI)

```
app/
├── core/                     # Shared infrastructure
│   ├── config.py             # Pydantic Settings, env vars
│   ├── database.py           # SQLAlchemy engine, session, get_db
│   ├── deps.py               # get_current_user, guards, pagination
│   ├── exceptions.py         # AppException hierarchy
│   ├── exception_handlers.py # Global exception handlers
│   ├── security.py           # JWT, password hashing
│   ├── pagination.py         # PaginationParams, PaginatedResponse
│   ├── mixins.py             # TimestampMixin, SoftDeleteMixin
│   ├── middleware.py
│   └── logging_config.py
│
└── services/                 # Domain modules
    ├── auth_service/
    │   ├── api.py            # Router (thin controllers)
    │   ├── crud.py           # DB operations
    │   ├── schemas.py        # Pydantic request/response
    │   └── models.py         # SQLAlchemy models
    └── ... (per-domain)
```

### emisthra-admin-ui (Next.js)

```
src/
├── app/                      # App Router (Next.js 13+)
├── components/
├── contexts/
│   └── AuthContext.tsx       # Auth state, login/logout
├── lib/
│   ├── axios.ts              # API client + 401 interceptor, token refresh
│   ├── api/
│   │   └── auth.ts           # authApi.login, refreshToken, getCurrentUser
│   └── utils/
│       └── translateApiError.ts
├── store/
│   ├── slices/
│   │   └── authSlice.ts      # Tokens, user in Redux
│   └── api/                  # RTK Query APIs
├── hooks/
└── types/
```

---

## 2. What PlotFarm Will Reuse (Conceptually)

### 2.1 Folder Structure Philosophy

| Emisthra | PlotFarm (NestJS) | Notes |
|----------|-------------------|-------|
| `app/core/` | `src/core/` | Config, DB, exceptions, guards, interceptors |
| `app/services/` | `src/modules/` | Domain modules (auth, users, listings, etc.) |
| Per-service: api, crud, schemas, models | Per-module: controller, service, dto | NestJS conventions |
| `app/core/mixins` | Prisma schema + base classes | Soft delete, timestamps in schema |

### 2.2 Validation Strategy

- **Emisthra**: Pydantic schemas for request/response; `@field_validator` for complex validation; keep validation close to schema or service, not in controllers.
- **PlotFarm**: class-validator DTOs; validation pipes; business validation in services.

### 2.3 API Response Format

**Emisthra pattern:**
```json
{
  "items": [...],
  "pagination": {
    "total": 100,
    "page": 1,
    "size": 20,
    "pages": 5
  }
}
```

**Emisthra error format:**
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "User not found",
    "type": "ResourceNotFoundError",
    "details": {}
  },
  "detail": "User not found"
}
```

**PlotFarm**: Implement same structures via response interceptor and exception filter.

### 2.4 Auth Structure (JWT Flow)

- Access token + refresh token
- `Bearer` in `Authorization` header
- Token payload: `sub` (user id), `type` (access/refresh), `roles`, org/admin flags
- `get_current_user` → resolves user, checks active, loads roles/permissions
- Role-based guards: superuser, platform owner, org admin, permission-based

**PlotFarm**: JWT strategy, `@UseGuards(JwtAuthGuard, RolesGuard)`, role enum, custom decorators.

### 2.5 Error Handling Pattern

**Emisthra exceptions:**
- `AppException` (base)
- `ResourceNotFoundError` → 404
- `AuthorizationError` → 403
- `ValidationError` → 400
- `BusinessRuleError` → 422
- `ConflictError` → 409

**PlotFarm**: Custom exception classes + global exception filter mapping to HTTP status and consistent `{ error: { code, message, type }, detail }`.

### 2.6 Config Management

- Environment-based (`.env`)
- Prefix (e.g. `CBAM_` in Emisthra)
- Typed settings (Pydantic in Emisthra)

**PlotFarm**: `@nestjs/config`, ConfigModule, env validation with class-validator.

### 2.7 Database Abstraction

- Session/connection per request
- ORM for queries (SQLAlchemy in Emisthra)
- No direct ORM in controllers; all access via services/crud

**PlotFarm**: Prisma as ORM; PrismaService injected into services; controllers call services only.

### 2.8 Utility Concepts Worth Reusing

- Soft delete: `deletedAt` column, exclude from default queries
- Audit fields: `createdAt`, `updatedAt`
- UUID primary keys
- Pagination: `page`, `limit`, `offset`
- Role constants and permission checks

---

## 3. What PlotFarm Will NOT Copy

- FastAPI-specific code (routers, Depends, Pydantic v2)
- SQLAlchemy models, migrations, mixins
- Emisthra-specific business logic (CBAM, organizations, facilities)
- Python utilities

---

## 4. PlotFarm-Specific Adjustments

| Concept | Emisthra | PlotFarm |
|---------|----------|----------|
| Roles | platform_admin, org_admin, supplier, etc. | SUPER_ADMIN, STATE_ADMIN, DISTRICT_ADMIN, AGENT, BUYER |
| Hierarchy | org → facility → submission | state → district → listing |
| Modules | auth, facilities, submissions, materials… | auth, users, listings, inquiries, locations, admin |

---

## 5. UI Reuse (plotfarm-ui)

| Pattern | Emisthra | PlotFarm |
|---------|----------|----------|
| API client | Axios + baseURL, interceptors | Same (axios / fetch wrapper) |
| Token handling | localStorage, request interceptor, 401 → refresh | Same flow |
| Auth context | AuthProvider, login/logout, getCurrentUser | Same structure |
| Error translation | translateApiError (i18n keys) | Same concept, optional |
| Feature structure | features/*, lib/api/* | features/auth, listings, dashboard; lib/api-client.ts |

---

## 6. Summary

PlotFarm adopts Emisthra’s **architecture concepts**:

1. **Core** layer for config, DB, exceptions, guards, interceptors  
2. **Module-based** domain separation  
3. **Thin controllers**, logic in services  
4. **Centralized** error format and response wrapping  
5. **JWT** access + refresh, role-based access  
6. **Soft delete**, audit fields, UUIDs  
7. **Paginated** list responses with consistent structure  
8. **Environment-based** config with validation  

All implemented with **NestJS** and **Prisma**, without copying FastAPI or Python code.
