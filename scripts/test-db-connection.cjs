/**
 * Quick check that DATABASE_URL is reachable.
 * Usage: npm run db:ping
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is missing in .env');
  process.exit(1);
}

const c = new Client({ connectionString: url });
c.connect()
  .then(() => c.query('SELECT 1 as ok'))
  .then((res) => {
    console.log('Database OK:', res.rows[0]);
    return c.end();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Database connection failed:', err.message);
    if (/ETIMEDOUT|ECONNREFUSED|P1001/i.test(String(err.message))) {
      console.error('\n→ Allowlist your public IP for port 5432 on the DB host.\n');
    }
    process.exit(1);
  });
