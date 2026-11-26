# Admin login

Configured via **`plotfarm-api/.env`**:

- `ADMIN_EMAIL` — default `admin@plotfarm.com`
- `ADMIN_PASSWORD` — your secret; seed applies it to the DB

Create or **reset** the admin password:

```bash
cd plotfarm-api
npm run prisma:seed
```

Then sign in at the UI **`/login`** with that email and password.

**Production:** use a long random `ADMIN_PASSWORD`, never commit `.env`, and rotate after first deploy.
