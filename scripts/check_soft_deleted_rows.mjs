import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=([^\r\n]+)/)[1].trim().replace(/^['"]|['"]$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

async function run() {
  console.log('=== CHECK IS_ACTIVE = FALSE ROWS ===');
  const prods = await sql`SELECT id, name, is_active FROM products WHERE is_active = false`;
  console.log('Inactive products:', prods);

  const vars = await sql`SELECT id, product_id, variant_name, is_active FROM product_variants WHERE is_active = false`;
  console.log('Inactive variants:', vars);

  const cats = await sql`SELECT id, name_en, is_active FROM categories WHERE is_active = false`;
  console.log('Inactive categories:', cats);

  const coups = await sql`SELECT id, code, is_active FROM coupons WHERE is_active = false`;
  console.log('Inactive coupons:', coups);

  const bars = await sql`SELECT id, barcode_value, is_active FROM barcode_registry WHERE is_active = false`;
  console.log('Inactive barcodes:', bars);

  console.log('\n=== CHECK ORDERS STATUSES ===');
  const orderStatuses = await sql`SELECT status, count(*)::int FROM orders GROUP BY status`;
  console.log('Orders status distribution:', orderStatuses);

  const advStatuses = await sql`SELECT status, count(*)::int FROM advance_orders GROUP BY status`;
  console.log('Advance orders status distribution:', advStatuses);

  await sql.end();
}

run().catch(async (e) => {
  console.error(e);
  await sql.end();
});
