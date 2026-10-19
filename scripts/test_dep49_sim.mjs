import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=([^\r\n]+)/)[1].trim().replace(/^['"]|['"]$/g, '');
const sql = postgres(dbUrl, { ssl: 'require' });

async function testSimulation() {
  const [advance] = await sql`SELECT * FROM public.advance_orders WHERE deposit_id = 'DEP000049'`;
  const items = advance.products;

  console.log('Testing items loop logic:');
  for (const item of items) {
    const productId = item.product_id;
    const variantId = item.variant_id;
    const name = item.name;
    let itemType = null;

    if (productId) {
      const [p] = await sql`SELECT item_type FROM public.products WHERE id = ${productId}`;
      if (p) itemType = p.item_type;
    }
    if (!itemType) {
      itemType = item.item_type;
    }
    console.log(`- ${name} (id: ${productId}, variant: ${variantId}) => item_type: ${itemType}`);
    if (itemType === 'service') {
      console.log(`  -> SKIPPING stock check for ${name} (service item)`);
    } else {
      console.log(`  -> ENFORCING stock check for ${name} (product item)`);
    }
  }

  await sql.end();
}
testSimulation().catch(console.error);
