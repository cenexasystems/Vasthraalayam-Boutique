import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=([^\r\n]+)/)[1].trim().replace(/^['"]|['"]$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

async function run() {
  const inactiveProds = await sql`SELECT * FROM products WHERE is_active = false`;
  console.log('INACTIVE PRODUCTS:', inactiveProds);

  for (const p of inactiveProds) {
    const items = await sql`SELECT count(*)::int as count FROM order_items WHERE product_id = ${p.id}`;
    const variants = await sql`SELECT count(*)::int as count FROM product_variants WHERE product_id = ${p.id}`;
    const barcodes = await sql`SELECT count(*)::int as count FROM barcode_registry WHERE product_id = ${p.id}`;
    const movements = await sql`SELECT count(*)::int as count FROM inventory_movements WHERE product_id = ${p.id}`;
    console.log(`Product ID ${p.id} (${p.name}): order_items=${items[0].count}, variants=${variants[0].count}, barcodes=${barcodes[0].count}, movements=${movements[0].count}`);
  }

  await sql.end();
}

run().catch(async (e) => {
  console.error(e);
  await sql.end();
});
