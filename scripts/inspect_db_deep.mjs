import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=([^\r\n]+)/)[1].trim().replace(/^['"]|['"]$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

async function run() {
  console.log('=== BUSINESS_ID COLUMNS IN DATABASE ===');
  const cols = await sql`
    SELECT table_name, column_name, data_type, column_default
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND column_name = 'business_id';
  `;
  console.table(cols);

  console.log('\n=== TABLES AND THEIR COLUMNS ===');
  const allCols = await sql`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `;
  
  const byTable = {};
  for (const c of allCols) {
    if (!byTable[c.table_name]) byTable[c.table_name] = [];
    byTable[c.table_name].push(`${c.column_name} (${c.data_type})`);
  }
  for (const [t, cols] of Object.entries(byTable)) {
    console.log(`\nTable ${t}:\n  ` + cols.join(', '));
  }

  console.log('\n=== CHECK ORPHAN ROWS ===');
  // order_items without orders
  const orphanOrderItems = await sql`
    SELECT count(*)::int as count 
    FROM order_items oi 
    LEFT JOIN orders o ON oi.order_id = o.id 
    WHERE o.id IS NULL;
  `;
  console.log('Orphan order_items (no order):', orphanOrderItems[0].count);

  // order_items product_id not in products
  const orphanOrderProducts = await sql`
    SELECT count(*)::int as count 
    FROM order_items oi 
    WHERE oi.product_id IS NOT NULL 
      AND oi.product_id NOT IN (SELECT id FROM products);
  `;
  console.log('Orphan order_items product_id:', orphanOrderProducts[0].count);

  // inventory_movements without products
  const orphanMovements = await sql`
    SELECT count(*)::int as count 
    FROM inventory_movements im 
    WHERE im.product_id IS NOT NULL 
      AND im.product_id NOT IN (SELECT id FROM products);
  `;
  console.log('Orphan inventory_movements (no product):', orphanMovements[0].count);

  // barcode_registry without products
  const orphanBarcodes = await sql`
    SELECT count(*)::int as count 
    FROM barcode_registry br 
    WHERE br.product_id IS NOT NULL 
      AND br.product_id NOT IN (SELECT id FROM products);
  `;
  console.log('Orphan barcode_registry (no product):', orphanBarcodes[0].count);

  // advance_order_payments without advance_orders
  const orphanAdvPayments = await sql`
    SELECT count(*)::int as count 
    FROM advance_order_payments aop 
    LEFT JOIN advance_orders ao ON aop.advance_order_id = ao.id 
    WHERE ao.id IS NULL;
  `;
  console.log('Orphan advance_order_payments:', orphanAdvPayments[0].count);

  // advance_order_timeline without advance_orders
  const orphanAdvTimeline = await sql`
    SELECT count(*)::int as count 
    FROM advance_order_timeline aot 
    LEFT JOIN advance_orders ao ON aot.advance_order_id = ao.id 
    WHERE ao.id IS NULL;
  `;
  console.log('Orphan advance_order_timeline:', orphanAdvTimeline[0].count);

  // advance_orders completed_order_id without order
  const orphanAdvCompleted = await sql`
    SELECT count(*)::int as count 
    FROM advance_orders ao 
    WHERE ao.completed_order_id IS NOT NULL 
      AND ao.completed_order_id NOT IN (SELECT id FROM orders);
  `;
  console.log('Orphan advance_orders completed_order_id:', orphanAdvCompleted[0].count);

  await sql.end();
}

run().catch(async (e) => {
  console.error(e);
  await sql.end();
});
