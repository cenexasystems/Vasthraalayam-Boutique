import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=([^\r\n]+)/)[1].trim().replace(/^['"]|['"]$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

async function run() {
  const viewDef = await sql`
    SELECT view_definition 
    FROM information_schema.views 
    WHERE table_schema = 'public' AND table_name = 'v_analytics_line_items';
  `;
  console.log('=== VIEW v_analytics_line_items ===');
  console.log(viewDef[0]?.view_definition);
  await sql.end();
}

run().catch(async (e) => {
  console.error(e);
  await sql.end();
});
