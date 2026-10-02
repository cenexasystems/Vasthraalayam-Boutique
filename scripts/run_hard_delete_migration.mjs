import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=([^\r\n]+)/)[1].trim().replace(/^['"]|['"]$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

async function run() {
  console.log('1. Executing migration 0011_hard_delete_infrastructure.sql ...');
  const migrationSql = fs.readFileSync('neon/migrations/0011_hard_delete_infrastructure.sql', 'utf8');
  await sql.unsafe(migrationSql);
  console.log('✓ Migration 0011 executed successfully.');

  console.log('\n2. Purging the two approved inactive items (ID 9 and ID 17) ...');
  // First, verify they exist and are inactive
  const prods = await sql`SELECT id, name, is_active FROM public.products WHERE id IN (9, 17)`;
  console.log('Items found to purge:', prods);

  if (prods.length > 0) {
    for (const p of prods) {
      console.log(`Purging product ${p.id} (${p.name}) via hard_delete_product...`);
      const res = await sql`SELECT public.hard_delete_product(${p.id}::bigint, '1', 'admin_approved') AS result`;
      console.log('Result:', res[0].result);
    }
  }

  console.log('\n3. Verifying inactive products count ...');
  const remainingInactive = await sql`SELECT count(*)::int as count FROM public.products WHERE is_active = false`;
  console.log('Remaining inactive products:', remainingInactive[0].count);

  console.log('\n4. Verifying delete_backups table ...');
  const backups = await sql`SELECT id, entity_type, entity_id, entity_identifier, deleted_by, deleted_at FROM public.delete_backups`;
  console.table(backups);

  await sql.end();
}

run().catch(async (e) => {
  console.error('Migration failed:', e);
  await sql.end();
  process.exit(1);
});
