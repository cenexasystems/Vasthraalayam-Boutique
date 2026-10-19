import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=([^\r\n]+)/)[1].trim().replace(/^['"]|['"]$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

async function check() {
  const order = await sql`SELECT id, deposit_id, customer_name, product_name, products, status FROM public.advance_orders WHERE deposit_id = 'DEP000049'`;
  console.log('Order:', JSON.stringify(order, null, 2));

  const prods = await sql`SELECT id, name, item_type, stock_quantity FROM public.products WHERE LOWER(name) LIKE '%blouse%'`;
  console.log('Products matching blouse:', JSON.stringify(prods, null, 2));

  // Also check routines / functions to see what complete_advance_order_v2 actually contains
  const routine = await sql`
    SELECT routine_name, routine_definition 
    FROM information_schema.routines 
    WHERE routine_name = 'complete_advance_order_v2'
  `;
  console.log('Routine found count:', routine.length);

  await sql.end();
}
check().catch(console.error);
