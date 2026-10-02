const { readFileSync } = require('fs');
const postgres = require('postgres');
const env = readFileSync('.env', 'utf8');
const match = env.match(/^DATABASE_URL\s*=\s*(.+)$/m);
let dbUrl = match[1].trim().replace(/^["']|["']$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

async function run() {
  const row = await sql`SELECT * FROM public.orders WHERE id = '9b5eab82-67d0-473b-91da-798739f7ef69'`;
  console.log(JSON.stringify(row[0], null, 2));
  await sql.end();
}
run().catch(console.error);
