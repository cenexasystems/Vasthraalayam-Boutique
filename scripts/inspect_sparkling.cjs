const postgres = require('postgres');

const url = 'postgresql://neondb_owner:npg_YrFUV0NP6bJK@ep-sparkling-salad-b5ijqvzt-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const sql = postgres(url);

async function main() {
  const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
  console.log('Tables:', tables.map(r => r.table_name));

  for (const t of tables.map(r => r.table_name)) {
    const cols = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${t}
      ORDER BY ordinal_position
    `;
    console.log(`\nTable ${t} columns:`);
    cols.forEach(c => console.log(`  ${c.column_name} (${c.data_type}) DEFAULT ${c.column_default}`));
  }

  const sampleOrders = await sql`SELECT * FROM public.orders LIMIT 3`;
  console.log('\nSample orders:', sampleOrders);

  await sql.end();
}

main();
