const dotenv = require('dotenv');
dotenv.config();
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set!');
  process.exit(1);
}

const sql = postgres(connectionString);

async function run() {
  try {
    const migrationSql = fs.readFileSync(path.join(__dirname, '../migrations/add_split_payments.sql'), 'utf8');
    console.log('Running migration:');
    console.log(migrationSql);

    await sql.unsafe(migrationSql);
    console.log('Migration executed successfully!');

    // Verify columns
    const columns = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'orders' AND column_name IN ('payments', 'change_given', 'payment_mode', 'total')
    `;
    console.log('\nVerified columns:');
    columns.forEach(c => console.log(`- ${c.column_name}: ${c.data_type} (default: ${c.column_default})`));

    // Verify backfilled orders
    const backfilled = await sql`
      SELECT id, invoice_no, total, payment_mode, payments, change_given
      FROM public.orders
      LIMIT 3
    `;
    console.log('\nSample backfilled orders:', JSON.stringify(backfilled, null, 2));
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
