const postgres = require('postgres');

async function check(name, url) {
  console.log(`\n=== Checking ${name} ===`);
  const sql = postgres(url);
  try {
    const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    console.log('Tables:', tables.map(t => t.table_name));
    if (tables.some(t => t.table_name === 'orders')) {
      const count = await sql`SELECT count(*) FROM orders`;
      console.log('Orders count:', count[0].count);
      const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders'`;
      console.log('Orders columns:', cols.map(c => `${c.column_name} (${c.data_type})`).join(', '));
      const sample = await sql`SELECT * FROM orders ORDER BY created_at DESC LIMIT 2`;
      console.log('Sample order:', sample);
    }
    if (tables.some(t => t.table_name === 'store_settings')) {
      const s = await sql`SELECT * FROM store_settings LIMIT 1`;
      console.log('Store settings:', s);
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await sql.end();
  }
}

async function main() {
  await check('ep-sparkling-salad', 'postgresql://neondb_owner:npg_YrFUV0NP6bJK@ep-sparkling-salad-b5ijqvzt-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
  await check('ep-crimson-frog', 'postgresql://neondb_owner:npg_UdsjJ0W1PahI@ep-crimson-frog-aytuz9ib-pooler.c-5.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require');
}

main();
