import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/DATABASE_URL=([^\r\n]+)/);
if (!match) {
  console.error('DATABASE_URL not found in .env');
  process.exit(1);
}
const dbUrl = match[1].trim().replace(/^['"]|['"]$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

async function run() {
  console.log('Executing migration 0022_advance_order_skip_unlinked_stock.sql ...');
  const migrationSql = fs.readFileSync('neon/migrations/0022_advance_order_skip_unlinked_stock.sql', 'utf8');
  await sql.unsafe(migrationSql);
  console.log('✓ Migration 0022 executed successfully on Neon database!');
  await sql.end();
}

run().catch(async (e) => {
  console.error('Migration failed:', e);
  await sql.end();
  process.exit(1);
});
