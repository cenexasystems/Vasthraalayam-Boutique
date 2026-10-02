import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=([^\r\n]+)/)[1].trim().replace(/^['"]|['"]$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

async function run() {
  console.log('=== ORDERS (8 rows) ===');
  const orders = await sql`
    SELECT id, invoice_no, customer_name, total, status, payment_mode, created_at 
    FROM orders 
    ORDER BY created_at DESC;
  `;
  console.table(orders);

  console.log('=== ADVANCE ORDERS (6 rows) ===');
  const advOrders = await sql`
    SELECT id, deposit_id, customer_name, total_amount, deposit_amount, remaining_balance, status, completed_order_id, invoice_number 
    FROM advance_orders 
    ORDER BY created_at DESC;
  `;
  console.table(advOrders);

  console.log('=== COUPONS (1 row) ===');
  const coupons = await sql`SELECT * FROM coupons`;
  console.table(coupons);

  console.log('=== CATEGORIES (4 rows) ===');
  const cats = await sql`SELECT id, name_en, is_active FROM categories`;
  console.table(cats);

  console.log('=== PRODUCTS (8 rows) ===');
  const prods = await sql`SELECT id, name, category, is_active, stock_quantity, item_type FROM products`;
  console.table(prods);

  console.log('=== PRINTER PROFILES (1 row) ===');
  const profiles = await sql`SELECT id, name, is_default, business_id FROM printer_profiles`;
  console.table(profiles);

  console.log('=== INVENTORY MOVEMENTS (15 rows) ===');
  const movements = await sql`
    SELECT id, product_id, movement_type, quantity_delta, reference_type, reference_id, created_at 
    FROM inventory_movements 
    ORDER BY created_at DESC 
    LIMIT 20;
  `;
  console.table(movements);

  await sql.end();
}

run().catch(async (e) => {
  console.error(e);
  await sql.end();
});
