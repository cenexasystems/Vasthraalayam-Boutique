import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=([^\r\n]+)/)[1].trim().replace(/^['"]|['"]$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

async function run() {
  const funcs = await sql`
    SELECT routine_name, routine_definition 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
      AND routine_name IN ('complete_pos_sale_with_inventory', 'create_advance_order', 'complete_advance_order');
  `;
  for (const f of funcs) {
    console.log(`\n=== FUNCTION: ${f.routine_name} ===\n`);
    console.log(f.routine_definition);
  }

  const seqs = await sql`
    SELECT sequence_name 
    FROM information_schema.sequences 
    WHERE sequence_schema = 'public';
  `;
  console.log('\n=== SEQUENCES ===', seqs);

  await sql.end();
}

run().catch(async (e) => {
  console.error(e);
  await sql.end();
});
