const postgres = require('postgres');
const url = 'postgresql://neondb_owner:npg_UdsjJ0W1PahI@ep-crimson-frog-aytuz9ib-pooler.c-5.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

const sql = postgres(url);

async function main() {
  const col = await sql`
    SELECT column_name, data_type, udt_name, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name IN ('payment_mode', 'payment_method', 'total', 'payments', 'change_given')
  `;
  console.log('Columns:', col);

  const constraints = await sql`
    SELECT conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'orders'
  `;
  console.log('Constraints:', constraints);

  await sql.end();
}
main();
