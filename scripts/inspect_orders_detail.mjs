import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=([^\r\n]+)/)[1].trim().replace(/^['"]|['"]$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

async function run() {
  const orders = await sql`
    SELECT id, invoice_no, customer_name, total, status, payments, coupon_code 
    FROM orders 
    ORDER BY created_at DESC;
  `;
  console.log('ORDERS:', JSON.stringify(orders, null, 2));

  const adv = await sql`
    SELECT id, deposit_id, customer_name, total_amount, deposit_amount, status, completed_order_id, invoice_number 
    FROM advance_orders 
    ORDER BY created_at DESC;
  `;
  console.log('ADVANCE ORDERS:', JSON.stringify(adv, null, 2));

  await sql.end();
}

run().catch(async (e) => {
  console.error(e);
  await sql.end();
});
