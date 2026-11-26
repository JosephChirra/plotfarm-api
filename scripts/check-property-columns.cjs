require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

async function run() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const res = await c.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'Property'
      AND column_name IN (
        'propertyType',
        'state',
        'district',
        'mandal',
        'contactName',
        'contactPhone'
      )
    ORDER BY column_name
  `);
  console.log(res.rows);
  await c.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
