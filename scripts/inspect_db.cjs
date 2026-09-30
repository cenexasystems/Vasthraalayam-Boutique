const dotenv = require('dotenv');
dotenv.config();
const postgres = require('postgres');

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  try {
    const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
    console.log('Tables:', tables.map(r => r.table_name));

    const columns = await sql`
      SELECT column_name, data_type, udt_name, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders'
      ORDER BY ordinal_position
    `;
    console.log('\nOrders columns:');
    columns.forEach(c => console.log(`- ${c.column_name}: ${c.data_type} (${c.udt_name}) default: ${c.column_default} nullable: ${c.is_nullable}`));

    // Check payment_mode constraints or enum
    const constraints = await sql`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'orders'
    `;
    console.log('\nOrders constraints:');
    constraints.forEach(c => console.log(`- ${c.conname}: ${c.pg_get_constraintdef}`));

    // Check sample orders
    const sample = await sql`SELECT id, invoice_no, total, payment_mode, payment_method FROM public.orders LIMIT 3`;
    console.log('\nSample orders:', sample);

  } catch (err) {
    console.error('DB Error:', err);
  } finally {
    await sql.end();
  }
}

main();
