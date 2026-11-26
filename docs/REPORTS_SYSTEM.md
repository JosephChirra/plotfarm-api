# Reports system (v1)

## Database

- **`Report`** model: `reporterId`, `targetType` (PROPERTY | USER), `targetId`, `reason`, optional `description`, `status`, `reviewedById`, `reviewedAt`, `resolutionAction`, `createdAt`.
- **Unique:** `(reporterId, targetId)` — one report per user per target id.
- **`Property.isBlocked`** — default `false`; when a report is resolved with `REMOVE_PROPERTY`, listing is hidden from public browse/search and detail (except owner/admin).
- **`User.isSuspended`** — default `false`; with `SUSPEND_USER`, user gets `isSuspended` + `status = BLOCKED` (admins cannot be suspended).

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/reports` | User (active) | Create report; max **5 per user per UTC day** |
| GET | `/reports/check?targetType=&targetId=` | User | `{ reported: boolean }` |
| GET | `/admin/reports` | Admin | Paginated list; `?status=&targetType=` |
| PATCH | `/admin/reports/:id` | Admin | `{ status, action }` — see DTO |

## Apply migration

```bash
cd plotfarm-api
npx prisma migrate deploy
npx prisma generate
```

## Testing checklist

- [ ] Logged-in user reports a property; success toast.
- [ ] Second report on same listing → 409 / “already reported”.
- [ ] Owner cannot report own listing.
- [ ] Admin resolves with “Block listing” → property disappears from public `/properties` and search.
- [ ] Admin resolves user report with “Suspend user” → user cannot log in or use JWT.
- [ ] Reject report → no change to target; report status `REJECTED`.
