import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=([^\r\n]+)/)[1].trim().replace(/^['"]|['"]$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

async function checkStock() {
  const v1 = await sql`SELECT id, variant_name, stock FROM public.product_variants WHERE id = '807c99ab-abfe-4dc7-a2cc-f2013f4a466c'`;
  console.log('hello - S variant:', v1);
  const v2 = await sql`SELECT id, variant_name, stock FROM public.product_variants WHERE id = '709e23d9-6d97-4f74-a334-50e8669ab152'`;
  console.log('lion - M variant:', v2);
  await sql.end();
}
checkStock().catch(console.error);
